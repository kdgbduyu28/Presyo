"""Meralco — residential bills at typical consumption levels (monthly).

Meralco's "Rates Archives" page links three PDFs per month on S3:
`<YYYY-MM>/<MM-YYYY>_residential_bills[_0].pdf` is a one-page table of the
full bill (every charge, VAT and subsidies) at 50 … 5000 kWh, for lifeline and
non-lifeline customers. That is more exact than kWh × average rate because
the distribution charge steps up at 200/300/400 kWh.

pdfplumber splits digits inside numbers ("2 ,948.48"), so the Total Bill
column is read by x position instead of from the text line.
"""

import re
from collections import defaultdict
from datetime import date

from .. import net, store
from ..paths import HISTORY_START

SOURCE = "meralco_bills"
ARCHIVE = "https://company.meralco.com.ph/news-and-advisories/rates-archives"
_PDF = re.compile(r"https://meralcomain\.s3[.-]ap-southeast-1\.amazonaws\.com/(\d{4})-(\d{2})/"
                  r"\d{2}-\d{4}_residential_bills[^\"'\s]*\.pdf")
MERALCO_AREA = "130000000"


def links(html: str) -> dict[str, str]:
    """{"YYYY-MM": pdf url} (the last link wins when a month was re-uploaded)."""
    out: dict[str, str] = {}
    for m in _PDF.finditer(html):
        out[f"{m.group(1)}-{m.group(2)}"] = m.group(0)
    return out


def _money(parts: list[str]) -> float | None:
    s = "".join(parts).replace(",", "")
    try:
        return float(s)
    except ValueError:
        return None


def parse(path) -> dict[str, list[tuple[int, float]]]:
    """{"lifeline"|"regular": [(kWh, total bill)]} from the bills table."""
    import pdfplumber

    out: dict[str, list[tuple[int, float]]] = {"lifeline": [], "regular": []}
    with pdfplumber.open(path) as pdf:
        page = pdf.pages[0]
        words = page.extract_words()
        total = next((w for w in words if w["text"] == "Total"), None)
        if total is None:
            return out
        # The per-kWh table further down repeats the kWh column; stop there.
        stop = next((w["top"] for w in words if w["text"] == "kWh" and w["top"] > total["top"] + 20), page.height)
        lines: dict[int, list[dict]] = defaultdict(list)
        for w in words:
            if total["top"] < w["top"] < stop:
                lines[round(w["top"])].append(w)
        section = None
        for top in sorted(lines):
            ws = sorted(lines[top], key=lambda w: w["x0"])
            text = " ".join(w["text"] for w in ws).lower()
            if text.startswith("for lifeline"):
                section = "lifeline"
                continue
            if text.startswith("for non-lifeline"):
                section = "regular"
                continue
            if section is None or not ws[0]["text"].isdigit():
                continue
            # Total Bill: right-aligned under "Total"; the subsidy column ends
            # ~13pt left of the header, 5-digit bills start ~5pt left of it.
            bill_words = [w["text"] for w in ws if w["x0"] > total["x0"] - 9]
            bill = _money(bill_words)
            # "-" = fully subsidized lifeline bill
            if bill is None and bill_words == ["-"]:
                bill = 0.0
            if bill is not None:
                out[section].append((int(ws[0]["text"]), bill))
    return out


def ingest(force: bool = False) -> None:
    html = net.get_as_browser(ARCHIVE).decode("utf-8", errors="replace")
    found = links(html)
    # The archive page only links the last few months (and lags the S3
    # upload), but older/newer files sit at the same predictable path.
    today = date.today()
    y, m = int(HISTORY_START[:4]), int(HISTORY_START[5:7])
    while (y, m) <= (today.year, today.month):
        month = f"{y}-{m:02d}"
        if month not in found and not store.exists(SOURCE, month):
            guess = f"https://meralcomain.s3.ap-southeast-1.amazonaws.com/{month}/{m:02d}-{y}_residential_bills.pdf"
            if net._client.head(guess).status_code == 200:  # S3 answers 403 for missing keys
                found[month] = guess
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    for month, url in sorted(found.items()):
        if f"{month}-01" < HISTORY_START:
            continue
        name = month
        if store.exists(SOURCE, name) and not force:
            continue
        path = net.fetch_cached(url, f"meralco/{url.rsplit('/', 1)[1]}")
        table = parse(path)
        rows = [{"item": "MERALCO", "spec": f"{kwh} kWh", "cat": "power", "unit": "bill",
                 "brand": section, "kwh": kwh, "area": MERALCO_AREA,
                 "start": f"{month}-01", "end": f"{month}-28", "price": bill}
                for section, pts in table.items() for kwh, bill in pts]
        regular = dict(table["regular"])
        store.write(SOURCE, name, {
            "url": url, "status": "ok" if regular else "empty", "period_start": f"{month}-01",
            "period_end": f"{month}-28",
            **({"rate_200": round(regular[200] / 200, 4)} if 200 in regular else {}),
        }, rows)
        print(f"meralco: {month} {len(rows)} bill rows"
              + (f", ₱{regular[200] / 200:.4f}/kWh at 200 kWh" if 200 in regular else ""))
