"""DA Bantay Presyo — NCR wet-market prices (PDFs listed on one page).

Two daily reports:
  da_index   Daily-Price-Index-<Month>-<D>-<YYYY>.pdf   NCR-wide prevailing price,
             ~150 items with specs, grouped by section headers.
  da_market  Price-Monitoring-<Month>-<D>-<YYYY>.pdf    ~30 items x ~34 markets.
Both are proper PDF tables, so pdfplumber's extract_tables() reads them.
"""

import json
import re
import tempfile
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path

import pdfplumber

from .. import net, store
from ..catalog import key_for, origin_of, titlecase
from ..paths import DATA, HISTORY_START

LISTING = "https://www.da.gov.ph/price-monitoring/"
NCR = "130000000"
MARKETS_FILE = DATA / "markets.json"

_MONTHS = {m: i + 1 for i, m in enumerate(
    ["january", "february", "march", "april", "may", "june", "july",
     "august", "september", "october", "november", "december"])}
_MONTHS.update({k[:3]: v for k, v in list(_MONTHS.items())})
_MONTHS["sept"] = 9

_NA = {"", "n/a", "na", "-", "not available", "none"}


def _date_from_name(name: str) -> date | None:
    m = re.search(r"([A-Za-z]+)-(\d{1,2})-(\d{4})", name)
    if not m or m.group(1).lower() not in _MONTHS:
        return None
    try:
        return date(int(m.group(3)), _MONTHS[m.group(1).lower()], int(m.group(2)))
    except ValueError:
        return None


def listing() -> dict[str, dict[date, str]]:
    """{source: {date: url}} for every report on the DA price page."""
    html = net.get(LISTING).text
    out: dict[str, dict[date, str]] = {"da_index": {}, "da_market": {}}
    for url in re.findall(r'href="([^"]+\.pdf)"', html, re.I):
        name = url.rsplit("/", 1)[-1]
        if re.match(r"Daily-Price-Index-", name, re.I):
            source = "da_index"
        elif re.match(r"Price-Monitoring-", name, re.I):
            source = "da_market"
        else:
            continue
        d = _date_from_name(name)
        if d is None or d.isoformat() < HISTORY_START:
            continue
        # Re-uploads get a "-1" suffix; keep the latest upload of a day.
        out[source].setdefault(d, url)
        if re.search(r"-\d\.pdf$", name):
            out[source][d] = url
    return out


def _num(s: str | None) -> float | None:
    if s is None:
        return None
    t = s.strip().replace(",", "")
    if t.lower() in _NA:
        return None
    m = re.fullmatch(r"(?:P|₱)?\s*(\d+(?:\.\d+)?)", t)
    return float(m.group(1)) if m else None


def _range(s: str | None) -> tuple[float, float] | None:
    """'45.00' -> (45, 45); '150.00 -160.00' -> (150, 160) (older per-market reports)."""
    if s is None:
        return None
    t = re.sub(r"\s+", " ", s.replace(",", "")).strip()
    if t.lower() in _NA or "not" in t.lower():
        return None
    m = re.fullmatch(r"(\d+(?:\.\d+)?)\s*(?:-\s*(\d+(?:\.\d+)?))?", t)
    if not m:
        return None
    lo = float(m.group(1))
    hi = float(m.group(2)) if m.group(2) else lo
    return (lo, hi) if lo <= hi else (hi, lo)


def _clean(s: str | None) -> str:
    return re.sub(r"\s+", " ", (s or "").replace("\n", " ")).strip()


# ---------------------------------------------------------------- daily index

_SECTION_CAT = [
    (r"rice", "rice"),
    (r"fish|seafood", "seafood"),
    (r"beef|pork|livestock|poultry|meat", "meat"),
    (r"vegetable|spice", "vegetables"),
    (r"fruit", "fruits"),
    (r"corn|legume|other basic", "pantry"),
]


def _section_category(section: str) -> str:
    low = section.lower()
    if "kadiwa" in low:
        return "other"  # P20 rice programme, not a market price
    for pat, cat in _SECTION_CAT:
        if re.search(pat, low):
            return cat
    return "other"


def _unit(item: str, spec: str) -> str:
    low = f"{item} {spec}".lower()
    if re.search(r"\begg\b", low):
        return "pc"
    if "bottle" in low:
        return "bottle"  # cooking oil comes as 350 ml and 1 L bottles
    if re.search(r"\bliter|\bml\b", low):
        return "L"
    return "kg"


def parse_index(path: Path, day: date) -> list[dict]:
    rows: list[dict] = []
    section = ""
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            for table in page.extract_tables():
                for raw in table:
                    cells = [_clean(c) for c in raw if c is not None]
                    filled = [c for c in cells if c]
                    if not filled:
                        continue
                    if filled[0].upper().startswith("COMMODITY"):
                        continue
                    if len(filled) == 1 and _num(filled[0]) is None and filled[0].upper() == filled[0]:
                        text = filled[0]
                        # Each page repeats the price column header as its own table.
                        if re.match(r"PREVAILING|RETAIL PRICE|UNIT \(", text):
                            continue
                        # "OTHER LIVESTOCK MEAT" / "PRODUCTS" wraps over two rows.
                        section = f"{section} {text}" if text == "PRODUCTS" else text
                        continue
                    if len(cells) < 3:
                        continue
                    item, spec, price = cells[0], cells[1], cells[-1]
                    if not item:
                        continue
                    value = _num(price)
                    if value is None:
                        continue
                    cat = _section_category(section)
                    origin = origin_of(item) or origin_of(section)
                    name = re.sub(r",\s*(Local|Imported)\s*$", "", item, flags=re.I)
                    if cat == "rice" and "rice" not in name.lower():
                        name = f"{name} Rice"
                    rows.append({
                        "item": name, "spec": spec or None, "cat": cat,
                        "unit": _unit(item, spec), "key": key_for(cat, name, spec),
                        "origin": origin, "area": NCR,
                        "start": day.isoformat(), "end": day.isoformat(), "price": value,
                    })
    return rows


# ---------------------------------------------------------------- per market

_COLUMN_CAT = [
    (r"rice|milled", "rice"),
    (r"bangus|tilapia|galunggong|fish|squid|pusit|alumahan|tamban|tuna", "seafood"),
    (r"\begg\b|pork|chicken|beef|carabeef", "meat"),
    (r"calamansi|banana|mango|papaya|pomelo|melon", "fruits"),
    (r"sugar|oil|salt|corn|mung", "pantry"),
    (r"ampalaya|eggplant|tomato|cabbage|carrot|chayote|pechay|potato|onion|garlic|"
     r"chili|chilli|sitao|squash|ginger|baguio beans|habichuelas|lettuce|pepper", "vegetables"),
]


def _column(label: str) -> dict:
    per_piece = label.startswith("*")
    label = label.lstrip("*").strip()
    origin = origin_of(label)
    name = re.sub(r"\s*\(?\b(local|imported)\b\)?", "", label, flags=re.I).strip()
    name = re.sub(r"^Fresh\s+", "", name, flags=re.I)
    name = re.sub(r"\s*\(\s*\)", "", name).strip()
    cat = next((c for pat, c in _COLUMN_CAT if re.search(pat, label, re.I)), "other")
    if cat == "rice" and "rice" not in name.lower():
        name = f"{name} Rice"
    return {"item": name, "cat": cat, "origin": origin,
            "unit": "pc" if per_piece or re.search(r"\begg\b", label, re.I) else "kg",
            "key": key_for(cat, name)}


def market_id(name: str) -> str:
    import unicodedata
    base = re.split(r"/", name)[0]
    base = unicodedata.normalize("NFKD", base).encode("ascii", "ignore").decode()
    base = re.sub(r"\(.*?\)", " ", base)
    base = re.sub(r"[^a-z0-9]+", "-", base.lower()).strip("-")
    return MARKET_ALIASES.get(base, base)


# Same market under different names across reports.
MARKET_ALIASES = {
    "mandaluyong-public-market": "mandaluyong-public-market-i",
    "new-las-pinas-city-public-market": "new-las-pinas-public-market",
}


def parse_market(path: Path, day: date) -> tuple[list[dict], dict[str, str]]:
    """Rows plus {market id: display name} seen in the report."""
    rows: list[dict] = []
    seen: dict[str, str] = {}
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            for table in page.extract_tables():
                header: list[str] | None = None
                for raw in table:
                    cells = [_clean(c) for c in raw]
                    if cells and cells[0].upper() == "MARKET":
                        header = cells
                        continue
                    if header is None or not cells or not cells[0]:
                        continue
                    if re.match(r"(source|note)\b", cells[0], re.I):
                        continue
                    mid = market_id(cells[0])
                    seen.setdefault(mid, cells[0])
                    for label, val in zip(header[1:], cells[1:]):
                        rng = _range(val)
                        if not label or rng is None:
                            continue
                        col = _column(label)
                        price = ({"price": rng[0]} if rng[0] == rng[1]
                                 else {"min": rng[0], "max": rng[1]})
                        rows.append({**col, "area": None, "market": mid,
                                     "start": day.isoformat(), "end": day.isoformat(),
                                     **price})
    return rows, seen


# ---------------------------------------------------------------- markets

def load_markets() -> dict[str, dict]:
    return json.loads(MARKETS_FILE.read_text()) if MARKETS_FILE.exists() else {}


def save_markets(markets: dict[str, dict]) -> None:
    MARKETS_FILE.write_text(json.dumps(dict(sorted(markets.items())), ensure_ascii=False, indent=1) + "\n")


# ---------------------------------------------------------------- ingest

def _download(url: str) -> Path:
    tmp = Path(tempfile.mkstemp(suffix=".pdf")[1])
    tmp.write_bytes(net.get(url).content)
    return tmp


def ingest(force: bool = False, limit: int | None = None) -> None:
    reports = listing()
    markets = load_markets()

    jobs = []
    for source, by_day in reports.items():
        for day, url in sorted(by_day.items()):
            if force or not store.exists(source, day.isoformat()):
                jobs.append((source, day, url))
    if limit:
        jobs = jobs[-limit:]
    print(f"da: {len(jobs)} reports to fetch")

    def run(job):
        source, day, url = job
        path = _download(url)
        try:
            sha = net.sha256(path)
            if source == "da_index":
                rows, seen = parse_index(path, day), {}
            else:
                rows, seen = parse_market(path, day)
            return job, sha, rows, seen, None
        except Exception as e:  # keep going; the doc is recorded as failed
            return job, None, [], {}, repr(e)
        finally:
            path.unlink(missing_ok=True)

    with ThreadPoolExecutor(max_workers=4) as pool:
        for (source, day, url), sha, rows, seen, err in pool.map(run, jobs):
            for mid, name in seen.items():
                markets.setdefault(mid, {"name": name})
            status = "failed" if err else ("empty" if not rows else "ok")
            store.write(source, day.isoformat(), {
                "url": url, "sha256": sha, "period_start": day.isoformat(),
                "period_end": day.isoformat(), "status": status,
                **({"error": err} if err else {}),
            }, rows)
            print(f"{source} {day}: {status} {len(rows)} rows")
    save_markets(markets)


# ---------------------------------------------------------------- geocoding

NCR_BOX = (120.90, 14.35, 121.15, 14.80)  # lng/lat bounds of Metro Manila
NOMINATIM = "https://nominatim.openstreetmap.org/search"


def geocode_markets(gz) -> None:
    """Fill lat/lng (+ area) for markets that lack them, via OSM Nominatim.

    A hit must be inside Metro Manila, and inside the city named in the
    market label when there is one ("Agora Public Market/San Juan").
    Misses are left null and listed, to be filled in data/markets.json by hand.
    """
    import math
    import time

    markets = load_markets()
    ncr = [a for a in gz.lgus if a["region"] == NCR]
    misses = []
    for mid, m in markets.items():
        if m.get("lat") is not None or m.get("manual"):
            continue
        city_hint = m["name"].split("/", 1)[1] if "/" in m["name"] else None
        city = gz.lgu(city_hint, regions={NCR}) if city_hint else None
        base = re.sub(r"\s*\(.*?\)", "", m["name"].split("/", 1)[0])
        queries = [f"{base}, {gz.by_code[city]['name']}" if city else base, base]
        hit = None
        for q in queries:
            r = net.get(NOMINATIM, params={
                "q": q, "format": "jsonv2", "limit": 5, "countrycodes": "ph",
                "viewbox": ",".join(map(str, NCR_BOX)), "bounded": 1})
            time.sleep(1.1)  # Nominatim usage policy
            for h in r.json():
                lat, lng = float(h["lat"]), float(h["lon"])
                near = min(ncr, key=lambda a: (a["lat"] - lat) ** 2 + (a["lng"] - lng) ** 2)
                if city and near["code"] != city:
                    # centroid-nearest can miss at borders; allow ~2.5 km slack
                    c = gz.by_code[city]
                    if math.dist((c["lat"], c["lng"]), (lat, lng)) > 0.035:
                        continue
                if "market" not in (h.get("name", "") + h.get("type", "") + h.get("category", "")).lower():
                    continue
                hit = (round(lat, 5), round(lng, 5), city or near["code"], h["display_name"])
                break
            if hit:
                break
        if hit:
            m.update({"lat": hit[0], "lng": hit[1], "area": hit[2], "osm": hit[3][:120]})
        else:
            misses.append(m["name"])
    save_markets(markets)
    if misses:
        print("markets without coordinates (fill by hand, set \"manual\": true):\n  " + "\n  ".join(misses))
