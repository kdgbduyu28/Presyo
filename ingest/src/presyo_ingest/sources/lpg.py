"""DOE — 11 kg household LPG prices.

Two kinds of report, both found through the CMS media API:
  * Regional "Price Monitoring of 11 KG Household LPG" tables: one row per
    city/municipality, one column per brand, monthly. Real PDF tables, so
    pdfplumber reads them; province cells are merged across rows.
  * "LPG Monitor as of 01 <Month> <Year>": a monthly memo whose table holds
    the Metro Manila price range for every month of the year -> history.
North Luzon uploads scans (no table), recorded as needs_ocr like the fuel files.
"""

import calendar
import re
from datetime import date
from pathlib import Path
from urllib.parse import quote

import pdfplumber

from .. import net, store
from ..geo import Gazetteer
from ..paths import HISTORY_START
from .doe import CMS, AreaResolver, period_from_text

NCR = "130000000"
KEY = "lpg_11kg"
ITEM = "LPG 11 kg tank"

# Which regions each regional office's file can mention (for name matching).
OFFICE_REGIONS = {
    "ncr": {"130000000"},
    "4a": {"040000000"}, "4b": {"170000000"}, "5": {"050000000"},
    "north": {"010000000", "020000000", "030000000", "140000000"},
    "visayas": {"060000000", "070000000", "080000000"},
    "mindanao": {"090000000", "100000000", "110000000", "120000000", "160000000", "150000000"},
}

BRANDS = {
    "gasul elite": "Gasul Elite", "gasul": "Gasul", "petron gasul": "Gasul",
    "fiesta": "Fiesta Gas", "fiesta gas": "Fiesta Gas",
    "solane": "Solane", "regasco": "Regasco", "pryce gas": "Pryce Gas", "prycegas": "Pryce Gas",
    "shine gaz": "Shinegaz", "shinegaz": "Shinegaz", "superkalan": "Superkalan",
    "brent gas": "Brent Gas", "m-gas": "M-Gas", "island gas": "Island Gas", "ec gas": "EC Gas",
    "town gas": "Town Gas", "eco-savers gas": "Eco-Savers Gas", "eco savers": "Eco-Savers Gas",
    "phoenix": "Phoenix", "cebu rufrance": "Cebu Rufrance", "rcg": "RCG",
}

_MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august",
           "september", "october", "november", "december"]


def _office(filename: str) -> str | None:
    f = filename.lower()
    for pat, office in [(r"\bncr\b", "ncr"), (r"region 4a|iv-a", "4a"), (r"region 4b|iv-b|mimaropa", "4b"),
                        (r"region 5\b|bicol", "5"), (r"north luzon|northern luzon", "north"),
                        (r"\bvfo\b|visayas|regions 6-8", "visayas"), (r"\bmfo\b|mindanao", "mindanao")]:
        if re.search(pat, f):
            return office
    return None


def listing() -> list[dict]:
    r = net.get(f"{CMS}/api/media", params={
        "where[filename][like]": "LPG", "where[mimeType][equals]": "application/pdf",
        "sort": "-createdAt", "limit": 200, "depth": 0})
    return r.json()["docs"]


def _month_period(text: str, fallback_year: int) -> tuple[date, date] | None:
    """LPG reports are monthly; take the month named in the header."""
    p = period_from_text(text, fallback_year)
    if p:
        start = p[0]
    else:
        m = re.search(r"(january|february|march|april|may|june|july|august|september|october|"
                      r"november|december)\s*,?\s*(\d{4})?", text, re.I)
        if not m:
            return None
        start = date(int(m.group(2) or fallback_year), _MONTHS.index(m.group(1).lower()) + 1, 1)
    first = start.replace(day=1)
    return first, first.replace(day=calendar.monthrange(first.year, first.month)[1])


def _nums(text: str) -> list[float]:
    vals = [float(x.replace(",", "")) for x in re.findall(r"\d{1,2},?\d{3}(?:\.\d{1,2})?", text or "")]
    return [v for v in vals if 500 <= v <= 3000]  # P per 11 kg tank


def parse_regional(path: Path) -> tuple[list[dict], str]:
    rows: list[dict] = []
    header_text = ""
    last_kinds: list[tuple[str, str]] | None = None
    with pdfplumber.open(path) as pdf:
        for pno, page in enumerate(pdf.pages):
            if pno == 0:
                header_text = page.extract_text() or ""
            for table in page.find_tables():
                text = table.extract()
                # The header row names the columns; data rows like "Zamboanga
                # City" must not pass for one.
                hidx = next((i for i, r in enumerate(text) if any(
                    c and re.search(r"CITY\s*/|MUNICIPALITY|^PROVINCE", c.strip(), re.I) for c in r)), None)
                if hidx is None:
                    # continuation table on a later page: same columns, no header
                    if last_kinds and text and len(text[0]) == len(last_kinds):
                        kinds, hidx = last_kinds, -1
                        rows.extend(_rows(page, table, text, kinds, hidx))
                    continue
                header = [re.sub(r"\s+", " ", c or "").strip() for c in text[hidx]]
                kinds = []
                for h in header:
                    low = h.lower()
                    if low.startswith("province"):
                        kinds.append(("province", h))
                    elif "city" in low or "municipality" in low:
                        kinds.append(("area", h))
                    elif "common" in low:
                        kinds.append(("common", h))
                    elif "range" in low or "average" in low or "auto-lpg" in low:
                        kinds.append(("skip", h))
                    elif low:
                        kinds.append(("brand", BRANDS.get(low, h.title())))
                    else:
                        # blank header: spill-over of the column to its left
                        # (a brand's "1,079.00 - 1,120.00", or the range's hi)
                        prev = kinds[-1] if kinds else ("skip", "")
                        kinds.append(("spill", prev[1]) if prev[0] in ("brand", "spill") else ("skip", ""))
                last_kinds = kinds
                rows.extend(_rows(page, table, text, kinds, hidx))
    return rows, header_text


def _rows(page, table, text, kinds, hidx) -> list[dict]:
    """City rows below the header (hidx = -1: the whole table is data)."""
    rows: list[dict] = []
    area_j = next((j for j, k in enumerate(kinds) if k[0] == "area"), None)
    prov_j = next((j for j, k in enumerate(kinds) if k[0] == "province"), None)
    if area_j is None:
        return rows

    # Province cells are merged across rows: map each row to the cell spanning it.
    prov_cells = []
    if prov_j is not None:
        ref = next((r.cells[prov_j] for r in table.rows if r.cells[prov_j]), None)
        top = table.rows[hidx].bbox[3] if hidx >= 0 else table.bbox[1]
        if ref:
            for c in table.cells:
                if abs(c[0] - ref[0]) < 2 and c[1] >= top - 1:
                    t = page.crop(c).extract_text() or ""
                    prov_cells.append((c[1], c[3], re.sub(r"\s+", " ", t).strip() or None))

    for i in range(hidx + 1, len(text)):
        cells = text[i]
        if area_j >= len(cells):
            continue
        area = re.sub(r"\s+", " ", cells[area_j] or "").strip()
        if not area or re.search(r"price|range|source|note|date", area, re.I):
            continue
        y = (table.rows[i].bbox[1] + table.rows[i].bbox[3]) / 2
        province = next((t for y0, y1, t in prov_cells if y0 - 0.5 <= y <= y1 + 0.5), None)
        by_brand: dict[str, list[float]] = {}
        common = None
        for j, (kind, label) in enumerate(kinds):
            if j >= len(cells):
                break
            if kind in ("brand", "spill") and label:
                by_brand.setdefault(label, []).extend(_nums(cells[j]))
            elif kind == "common":
                v = _nums(cells[j])
                common = v[0] if v else None
        for brand, vals in by_brand.items():
            if vals:
                rows.append({"province": province, "area": area, "brand": brand,
                             "min": min(vals), "max": max(vals)})
        if common is not None:
            rows.append({"province": province, "area": area, "brand": None, "common": common})
    return rows


def parse_monitor(path: Path) -> list[tuple[int, int, float, float]]:
    """(year, month, low, high) rows of the Metro Manila table in an LPG Monitor memo."""
    text = "\n".join((p.extract_text() or "") for p in pdfplumber.open(path).pages)
    # The table's "Year 2026" header is split over lines; the memo title
    # ("LPG Monitor as of 01 September 2026") always carries the year.
    m = re.search(r"as of \d{1,2} [A-Za-z]+ (\d{4})", text) or re.search(r"\b(20\d{2})\b", text)
    year = int(m.group(1)) if m else None
    out = []
    for line in text.splitlines():
        mm = re.match(r"\s*(January|February|March|April|May|June|July|August|September|October|"
                      r"November|December)\*?\s+([\d,]+\.\d{2})\s*-\s*([\d,]+\.\d{2})", line)
        if mm and year:
            out.append((year, _MONTHS.index(mm.group(1).lower()) + 1,
                        float(mm.group(2).replace(",", "")), float(mm.group(3).replace(",", ""))))
    return out


def _download(filename: str) -> Path:
    return net.fetch_cached(f"{CMS}/api/media/file/{quote(filename)}?prefix=dev%2Fmedia", f"lpg/{filename}")


def ingest(gz: Gazetteer, force: bool = False) -> None:
    resolve = AreaResolver(gz)
    docs = listing()

    # ---- regional city x brand tables
    for d in docs:
        fn = d["filename"]
        if not re.search(r"price monitoring|lpg prices", fn, re.I) or re.search(r"adjust|monitor as of", fn, re.I):
            continue
        office = _office(fn)
        if office is None:
            print(f"lpg: unknown office for {fn}")
            continue
        created = date.fromisoformat(d["createdAt"][:10])
        doc_key = re.sub(r"[^A-Za-z0-9]+", "-", fn[:-4]).strip("-")[:80]
        existing = list((store.PRICES / "doe_lpg").glob(f"*__{doc_key}.json")) if (store.PRICES / "doe_lpg").exists() else []
        if existing and not force:
            continue
        path = _download(fn)
        text_len = len("".join((p.extract_text() or "") for p in pdfplumber.open(path).pages))
        raw, header = parse_regional(path) if text_len > 200 else ([], "")
        period = _month_period(header or fn, created.year) or _month_period(fn, created.year)
        if period is None:
            print(f"lpg: no period for {fn}")
            continue
        start, end = period
        if end.isoformat() < HISTORY_START:
            continue
        rows = []
        for r in raw:
            # AreaResolver keys on the fuel page names; LPG offices map onto them.
            region_page = {"ncr": "ncr", "north": "north-luzon", "visayas": "visayas",
                           "mindanao": "mindanao"}.get(office, "south-luzon")
            code = resolve(region_page, r["province"], r["area"], fn)
            if code is None:
                continue
            base = {"item": ITEM, "cat": "fuel", "unit": "tank", "key": KEY, "area": code,
                    "start": start.isoformat(), "end": end.isoformat()}
            rows.append({**base, "brand": r["brand"], "min": r["min"], "max": r["max"]} if r["brand"]
                        else {**base, "price": r["common"]})
        # North Luzon: scans with an OCR layer but no table structure.
        status = "needs_ocr" if text_len <= 200 or not raw else ("ok" if rows else "empty")
        for old in existing:
            old.unlink()
        store.write("doe_lpg", f"{start.isoformat()}__{doc_key}", {
            "url": f"{CMS}/api/media/file/{quote(fn)}", "filename": fn, "sha256": net.sha256(path),
            "period_start": start.isoformat(), "period_end": end.isoformat(), "status": status,
            "areas": len({r["area"] for r in rows}),
        }, rows)
        print(f"doe_lpg {start:%Y-%m}: {status} {len(rows)} rows, {len({r['area'] for r in rows})} areas  ({fn})")

    # ---- Metro Manila monthly range, from the newest "LPG Monitor" memo
    monitors = [d for d in docs if re.search(r"monitor as of", d["filename"], re.I)]
    if monitors:
        fn = monitors[0]["filename"]  # newest first; it carries the whole year
        path = _download(fn)
        months = parse_monitor(path)
        rows = [{"item": ITEM, "cat": "fuel", "unit": "tank", "key": KEY, "area": NCR,
                 "start": f"{y}-{m:02d}-01", "end": f"{y}-{m:02d}-{calendar.monthrange(y, m)[1]:02d}",
                 "min": lo, "max": hi}
                for y, m, lo, hi in months if f"{y}-{m:02d}-01" >= HISTORY_START[:8] + "01"]
        store.write("doe_lpg_monitor", "latest", {
            "url": f"{CMS}/api/media/file/{quote(fn)}", "filename": fn, "sha256": net.sha256(path),
            "period_start": rows[0]["start"] if rows else None,
            "period_end": rows[-1]["end"] if rows else None, "status": "ok" if rows else "empty",
        }, rows)
        print(f"doe_lpg_monitor: {len(rows)} months from {fn}")
    if resolve.misses:
        print("lpg: unmatched places:\n  " + "\n  ".join(sorted(resolve.misses)))
