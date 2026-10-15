"""BSP — peso exchange rates (Reference Exchange Rate Bulletin).

Today's bulletin: the BSP website (SharePoint) reads it from an open list API,
`_api/web/lists/getByTitle('Exchange Rate')/items`, one item per currency
(PHP per unit, Groups 1–2) plus BSP's own USD reference/buying/selling rates
and gold/silver buying prices (Group 3). The rates are as of the previous
trading day (the "PDS Closing Rate (dd-Mon-yyyy)" label carries that date),
and weekend bulletins repeat Friday's numbers.

History: `statistics/external/dailycrossrates.xlsx`, sheet "peso cross daily",
one row per calendar day ('..' = no trading). It lags by up to a month, so it
backfills whole months and the daily bulletin covers the rest.

bsp.gov.ph sits behind Akamai, which rejects non-browser TLS fingerprints, so
both go through net.get_as_browser.
"""

import io
import json
import re
from datetime import date, datetime, timedelta

from .. import net, store
from ..paths import HISTORY_START

SOURCE = "bsp_forex"
API = ("https://www.bsp.gov.ph/_api/web/lists/getByTitle('Exchange%20Rate')/items"
       "?$select=Title,Unit,Symbol,PHPequivalent,Group,Ordering&$orderby=Ordering%20asc&$top=100")
PAGE = "https://www.bsp.gov.ph/SitePages/Statistics/ExchangeRate.aspx"
CROSS_XLSX = "https://www.bsp.gov.ph/statistics/external/dailycrossrates.xlsx"

# code -> display name; also the column headers of the history sheet
# ("<row 4> <row 5>", lower-cased) in the order BSP lists them.
CURRENCIES: list[tuple[str, str, str]] = [
    ("USD", "US dollar", "us dollar"), ("JPY", "Japanese yen", "japanese yen"),
    ("GBP", "British pound", "pound sterling"), ("HKD", "Hong Kong dollar", "hongkong dollar"),
    ("CHF", "Swiss franc", "swiss franc"), ("CAD", "Canadian dollar", "canadian dollar"),
    ("SGD", "Singapore dollar", "singapore dollar"), ("AUD", "Australian dollar", "australian dollar"),
    ("BHD", "Bahraini dinar", "bahrain dinar"), ("KWD", "Kuwaiti dinar", "kuwait dinar"),
    ("SAR", "Saudi riyal", "saudi riyal"), ("BND", "Brunei dollar", "brunei dollar"),
    ("IDR", "Indonesian rupiah", "indonesian rupiah"), ("THB", "Thai baht", "thai baht"),
    ("AED", "UAE dirham", "uae dirham"), ("EUR", "Euro", "euro"),
    ("KRW", "Korean won", "s.korean won"), ("CNY", "Chinese yuan", "chinese yuan"),
    ("ARS", "Argentine peso", "argentinian peso"), ("BRL", "Brazilian real", "brazilian real"),
    ("DKK", "Danish krone", "danish kroner"), ("INR", "Indian rupee", "indian rupee"),
    ("MYR", "Malaysian ringgit", "malaysian ringgit"), ("MXN", "Mexican peso", "mexican new peso"),
    ("NZD", "New Zealand dollar", "new zealand dollar"), ("NOK", "Norwegian krone", "norwegian kroner"),
    ("PKR", "Pakistani rupee", "pakistani rupee"), ("ZAR", "South African rand", "s.african rand"),
    ("SEK", "Swedish krona", "swedish kroner"), ("SYP", "Syrian pound", "syrian pound"),
    ("TWD", "New Taiwan dollar", "new taiwan dollar"), ("VES", "Venezuelan bolívar", "venezuelan bolivar"),
]
NAMES = {code: name for code, name, _ in CURRENCIES}
_BY_HEADER = {header: code for code, _, header in CURRENCIES}

# Group 3 rows of the bulletin (label prefix -> item code)
BSP_ROWS = {"bsp buying rate": "BSP_BUY", "bsp selling rate": "BSP_SELL", "bsp reference rate": "BSP_REF",
            "gold buying": "GOLD_USD", "silver buying": "SILVER_USD"}

_MON = {m: i + 1 for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}


def _num(s) -> float | None:
    if s is None:
        return None
    if isinstance(s, (int, float)):
        return float(s)
    m = re.match(r"\s*([\d,]+(?:\.\d+)?)", str(s))
    return float(m.group(1).replace(",", "")) if m else None


def _row(code: str, day: str, price: float, unit: str = "PHP") -> dict:
    return {"item": code, "spec": NAMES.get(code), "cat": "forex", "unit": unit,
            "start": day, "end": day, "price": price}


def parse_bulletin(items: list[dict]) -> tuple[str | None, list[dict]]:
    """(trading date, rows) from the Exchange Rate list items."""
    trade: str | None = None
    for it in items:
        m = re.search(r"(\d{1,2})-([A-Za-z]{3})-(\d{4})", it.get("Unit") or "")
        if m and m.group(2).lower() in _MON and ("PDS" in it["Unit"] or "as of" in it["Unit"]):
            trade = date(int(m.group(3)), _MON[m.group(2).lower()], int(m.group(1))).isoformat()
            break
    if trade is None:
        return None, []
    rows = []
    for it in items:
        group, sym, unit = it.get("Group"), (it.get("Symbol") or "").strip(), (it.get("Unit") or "").lower()
        if group in ("1", "2") and sym in NAMES:
            v = _num(it.get("PHPequivalent"))
            if v:
                rows.append(_row(sym, trade, v))
        elif group == "3":
            for label, code in BSP_ROWS.items():
                if unit.startswith(label):
                    v = _num(it.get("PHPequivalent"))
                    if v:
                        rows.append({**_row(code, trade, v, "USD" if code.endswith("_USD") else "PHP"), "spec": None})
    return trade, rows


def parse_history(body: bytes, since: str = HISTORY_START) -> dict[str, list[dict]]:
    """{"YYYY-MM": rows} from the "peso cross daily" sheet."""
    import openpyxl

    wb = openpyxl.load_workbook(io.BytesIO(body), read_only=True, data_only=True)
    ws = wb["peso cross daily"]
    cols: dict[int, str] = {}
    head: list = []
    out: dict[str, list[dict]] = {}
    for r in ws.iter_rows(values_only=True):
        if r and r[0] == "Period":
            head = list(r)
            continue
        if head and not cols:
            # second header row: currency unit names under the country names
            for i, (a, b) in enumerate(zip(head, r)):
                label = " ".join(str(x) for x in (a, b) if x).strip().lower()
                if label in _BY_HEADER:
                    cols[i] = _BY_HEADER[label]
            continue
        if not cols or not isinstance(r[0], datetime):
            continue
        day = r[0].date().isoformat()
        if day < since:
            continue
        for i, code in cols.items():
            v = r[i] if i < len(r) else None
            if isinstance(v, (int, float)) and v > 0:
                out.setdefault(day[:7], []).append(_row(code, day, float(v)))
    return out


def _months(since: str, until: date) -> list[str]:
    y, m = int(since[:4]), int(since[5:7])
    out = []
    while (y, m) < (until.year, until.month):
        out.append(f"{y}-{m:02d}")
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


def ingest(force: bool = False) -> None:
    body = net.get_as_browser(API, {"Accept": "application/json;odata=nometadata"})
    trade, rows = parse_bulletin(json.loads(body)["value"])
    if trade and rows:
        store.write(SOURCE, f"day-{trade}", {"url": PAGE, "status": "ok", "period_start": trade,
                                              "period_end": trade}, rows)
        print(f"forex: bulletin for {trade}, {len(rows)} rates")
    else:
        print("forex: bulletin had no trading date / rates")

    # Backfill finished months from the history workbook (10 MB) only when
    # one is missing or was written before the month was complete.
    today = date.today()
    wanted = _months(HISTORY_START, today)
    def done(month: str) -> bool:
        p = store.doc_path(SOURCE, f"month-{month}")
        return p.exists() and json.loads(p.read_text())["doc"].get("complete", False)
    missing = [m for m in wanted if force or not done(m)]
    if not missing:
        return
    hist = parse_history(net.get_as_browser(CROSS_XLSX))
    last_day = max((r["start"] for rows in hist.values() for r in rows), default="")
    for month in missing:
        mrows = hist.get(month)
        if not mrows:
            continue
        y, m = int(month[:4]), int(month[5:])
        month_end = (date(y + (m == 12), m % 12 + 1, 1) - timedelta(days=1)).isoformat()
        store.write(SOURCE, f"month-{month}", {
            "url": CROSS_XLSX, "status": "ok", "period_start": f"{month}-01", "period_end": month_end,
            # the sheet runs through the month's last calendar day once it's complete
            "complete": last_day >= month_end,
        }, mrows)
        print(f"forex: history {month}, {len(mrows)} rates")
