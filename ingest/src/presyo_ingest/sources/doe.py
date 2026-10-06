"""DOE — weekly retail pump prices per city/municipality, product and brand.

The site (Next.js + Payload CMS) exposes an open REST API; each region page's
JSON lists the PDFs uploaded by that regional office. Every office uses its own
file naming *and* layout:
  * NCR / South Luzon merge each brand's prices for all products into one cell
    (blank products are simply skipped), so values are placed by coordinates:
    row = product (y), column = brand (x).
  * Mindanao writes "88.90 - 88.90" ranges, Visayas a single price per cell.
  * North Luzon sometimes uploads image-only scans -> status "needs_ocr".
Placing words by coordinates handles all of them.
"""

import re
from datetime import date, datetime, timedelta
from pathlib import Path
from urllib.parse import quote, unquote

import pdfplumber

from .. import net, store
from ..geo import Gazetteer
from ..paths import HISTORY_START

CMS = "https://d24qbtp4vooyzi.cloudfront.net"
PAGE_PATH = "/data-and-prices/liquid-fuels/retail-pump-prices/{}-pump-prices"

# region page -> PSGC regions its offices report on
REGIONS = {
    "ncr": {"130000000"},
    "north-luzon": {"010000000", "020000000", "030000000", "140000000"},
    "south-luzon": {"040000000", "170000000", "050000000"},
    "visayas": {"060000000", "070000000", "080000000"},
    "mindanao": {"090000000", "100000000", "110000000", "120000000", "160000000", "150000000"},
}

PRODUCTS = {
    "RON 100": ("Gasoline RON 100", "fuel_ron100"),
    "RON 97": ("Gasoline RON 97", "fuel_ron97"),
    "RON 95": ("Gasoline RON 95", "fuel_ron95"),
    "RON 91": ("Gasoline RON 91", "fuel_ron91"),
    "DIESEL": ("Diesel", "fuel_diesel"),
    "DIESEL PLUS": ("Diesel Plus", "fuel_diesel_plus"),
    "KEROSENE": ("Kerosene", "fuel_kerosene"),
}

# Places DOE lists that are not LGUs, or are spelled differently.
AREA_ALIASES = {
    "boracay": "Malay",
    "caticlan": "Malay",
    "taguig cty": "City of Taguig",
    "legaspi": "City of Legazpi",
    "la tridindad": "La Trinidad",
    "daan bantayan": "Daanbantayan",
    "san dioniso": "San Dionisio",
    "sapian": "Sapi-An",
    "pigcawayan": "Pigkawayan",
    "san jose de buenavista": "San Jose",
}

# Province cells that wrap and get cut ("OCCIDENTAL" / "MINDORO").
PROVINCE_ALIASES = {
    "occidental": "Occidental Mindoro",
    "oriental": "Oriental Mindoro",
}

_MON = {m: i + 1 for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}


# ---------------------------------------------------------------- discovery

def listing() -> dict[str, list[str]]:
    """{region page: [pdf url, ...]} from the CMS pages API."""
    out = {}
    for region in REGIONS:
        r = net.get(f"{CMS}/api/pages", params={
            "where[path][equals]": PAGE_PATH.format(region), "depth": 2})
        urls = re.findall(r"https://d24qbtp4vooyzi\.cloudfront\.net/api/media/file/[^\"\\?]+\.pdf", r.text)
        out[region] = sorted(set(urls))
    return out


def _created_at(filename: str) -> date | None:
    r = net.get(f"{CMS}/api/media", params={
        "where[filename][equals]": filename, "limit": 1, "depth": 0})
    docs = r.json().get("docs", [])
    if not docs:
        return None
    return datetime.fromisoformat(docs[0]["createdAt"].replace("Z", "+00:00")).date()


# ---------------------------------------------------------------- dates

def _mon(word: str) -> int | None:
    return _MON.get(word[:3].lower())


def period_from_text(text: str, default_year: int) -> tuple[date, date] | None:
    """Find a 'Sep 29 - Oct 5, 2026' / '25-31 August 2026' style range."""
    t = re.sub(r"\s+", " ", text)
    M = r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?"
    pats = [
        # September 29 - October 5, 2026 / SEPT 29 - OCT 5 2026 / Sept 22 to 28 2026
        rf"{M} (\d{{1,2}})(?:,? (\d{{4}}))? ?(?:-|to|–) ?(?:{M} )?(\d{{1,2}}),? (\d{{4}})",
        # 25-31 August 2026 / 29 Sep to 5 Oct 2026 / 28 July-03 August 2026
        rf"(\d{{1,2}}) ?(?:{M} ?)?(?:-|to|–) ?(\d{{1,2}}) {M},? (\d{{4}})",
        # September 1-7-2026
        rf"{M} (\d{{1,2}}) ?- ?(\d{{1,2}})-(\d{{4}})",
    ]
    m = re.search(pats[0], t, re.I)
    if m:
        m1, d1, y1, m2, d2, y2 = m.groups()
        y2 = int(y2)
        start = date(int(y1 or y2), _mon(m1), int(d1))
        end_month = _mon(m2) if m2 else _mon(m1)
        end = date(y2, end_month, int(d2))
        if start > end:  # Dec 29 - Jan 4
            start = start.replace(year=start.year - 1)
        return start, end
    m = re.search(pats[1], t, re.I)
    if m:
        d1, m1, d2, m2, y = m.groups()
        y = int(y)
        start = date(y, _mon(m1 or m2), int(d1))
        end = date(y, _mon(m2), int(d2))
        if start > end:
            start = start.replace(year=y - 1) if _mon(m1 or m2) == 12 else start
        return start, end
    m = re.search(pats[2], t, re.I)
    if m:
        m1, d1, d2, y = m.groups()
        return date(int(y), _mon(m1), int(d1)), date(int(y), _mon(m1), int(d2))
    # 09222026 (MMDDYYYY) or 092926 (MMDDYY)
    m = re.search(r"\b(\d{2})(\d{2})(\d{4}|\d{2})\b", t)
    if m:
        mm, dd, yy = m.groups()
        y = int(yy) if len(yy) == 4 else 2000 + int(yy)
        try:
            start = date(y, int(mm), int(dd))
            return start, start + timedelta(days=6)
        except ValueError:
            pass
    # "8 TO 14" with no month/year -> caller falls back to upload date
    return None


def _week_of(d: date) -> tuple[date, date]:
    """DOE weeks run Tuesday - Monday."""
    start = d - timedelta(days=(d.weekday() - 1) % 7)
    return start, start + timedelta(days=6)


# ---------------------------------------------------------------- parsing

def _numbers(text: str) -> list[float]:
    return [float(x) for x in re.findall(r"\d+\.\d{2}", text)]


def _valid(v: float) -> bool:
    return 30 <= v <= 250  # P/liter; drops 0.00 placeholders and stray numbers


def _cell_label(words: list[dict]) -> str | None:
    """Text of a (possibly merged) label cell.

    Words come in drawing order. Lines stacked ~a line apart are a wrapped
    name ("Zamboanga del" / "Sur"); lines overlapping each other are a stray
    label drawn over another (NCR p.2: "Caloocan City" under "Muntinlupa
    City") and the one drawn last is the visible one.
    """
    lines: list[dict] = []
    for w in words:
        if lines and abs(lines[-1]["top"] - w["top"]) < 0.6:
            lines[-1]["words"].append(w)
            continue
        lines = [ln for ln in lines if abs(ln["top"] - w["top"]) >= 3]
        lines.append({"top": w["top"], "words": [w]})
    if not lines:
        return None
    lines.sort(key=lambda ln: ln["top"])
    text = " ".join(" ".join(x["text"] for x in sorted(ln["words"], key=lambda x: x["x0"])) for ln in lines)
    return re.sub(r"\s+", " ", text).strip() or None


def parse(path: Path) -> tuple[list[dict], str]:
    """Rows of {province, area, product, brand, min, max | common} + page-1 text."""
    out: list[dict] = []
    header_text = ""
    last_province: str | None = None
    with pdfplumber.open(path) as pdf:
        for pno, page in enumerate(pdf.pages):
            if pno == 0:
                header_text = page.extract_text() or ""
            words = page.extract_words(use_text_flow=True)
            for i, w in enumerate(words):
                w["i"] = i  # drawing order
            for table in page.find_tables():
                text = table.extract()
                hidx = next((i for i, r in enumerate(text)
                             if any(c and "PRODUCT" in c.upper() for c in r)), None)
                if hidx is None:
                    continue
                cols = []  # (kind, label, x0, x1)
                for label, bbox in zip(text[hidx], table.rows[hidx].cells):
                    if bbox is None:
                        continue
                    label = re.sub(r"\s+", " ", label or "").strip().upper()
                    if label.startswith("PRODUCT"):
                        kind = "product"
                    elif label.startswith("PROVINCE"):
                        kind = "province"
                    elif "CITY" in label or label == "AREA" or "MUNICIPALITY" in label:
                        kind = "area"
                    elif "COMMON" in label:
                        kind = "common"
                    elif "RANGE" in label and "INDEPENDENT" not in label:
                        kind = "range"
                    elif "OVERALL RANGE" in label:
                        # NCR merges "INDEPENDENT OVERALL RANGE" into one header
                        # cell; split it where the word OVERALL starts.
                        split = next((w["x0"] for w in words if w["text"].upper() == "OVERALL"
                                      and bbox[0] <= w["x0"] <= bbox[2]
                                      and bbox[1] - 2 <= w["top"] <= bbox[3] + 2), None)
                        if split is None:
                            continue
                        cols.append(("brand", label.replace("OVERALL RANGE", "").strip(), bbox[0], split - 1))
                        cols.append(("range", "OVERALL RANGE", split - 1, bbox[2]))
                        continue
                    elif label:
                        kind = "brand"
                    else:
                        continue
                    cols.append((kind, label, bbox[0], bbox[2]))
                if not any(c[0] == "product" for c in cols):
                    continue
                top = table.rows[hidx].bbox[3]

                def col_of(w):
                    x = (w["x0"] + w["x1"]) / 2
                    return next((c for c in cols if c[2] - 1 <= x <= c[3] + 1), None)

                tw = [w for w in words if top <= (w["top"] + w["bottom"]) / 2 <= table.bbox[3]
                      and table.bbox[0] <= (w["x0"] + w["x1"]) / 2 <= table.bbox[2]]
                # Excel exports redraw the first rows' labels, hidden, at the
                # start of later pages ("Aklan"/"Boracay", "Bacoor"/"Cavite",
                # NCR's "Caloocan City"). Real labels are drawn after the
                # product column, so anything in a label column before it is junk.
                first_product = min((w["i"] for w in tw if (col_of(w) or ("",))[0] == "product"),
                                    default=0)
                tw = [w for w in tw if not (w["i"] < first_product
                                            and (col_of(w) or ("",))[0] in ("area", "province"))]

                # product lines -> row bands (midpoints between neighbouring labels)
                plines: dict[float, list] = {}
                for w in tw:
                    c = col_of(w)
                    if c and c[0] == "product":
                        key = next((k for k in plines if abs(k - w["top"]) < 1.5), w["top"])
                        plines.setdefault(key, []).append(w)
                prods = []
                for t in sorted(plines):
                    label = " ".join(x["text"] for x in sorted(plines[t], key=lambda x: x["x0"])).upper()
                    if label in PRODUCTS:
                        cy = sum((x["top"] + x["bottom"]) / 2 for x in plines[t]) / len(plines[t])
                        prods.append([label, cy])
                if not prods:
                    continue
                bands = []
                for i, (label, cy) in enumerate(prods):
                    lo = (prods[i - 1][1] + cy) / 2 if i else top
                    hi = (prods[i + 1][1] + cy) / 2 if i + 1 < len(prods) else table.bbox[3]
                    bands.append((label, cy, lo, hi))

                # label cells (merged): every table cell inside the area/province column
                def label_cells(kind):
                    c = next((c for c in cols if c[0] == kind), None)
                    if c is None:
                        return []
                    cells = [b for b in table.cells
                             if b[1] >= top - 1 and abs(b[0] - c[2]) < 3 and abs(b[2] - c[3]) < 3]
                    res = []
                    for b in cells:
                        ws = [w for w in tw if b[0] <= (w["x0"] + w["x1"]) / 2 <= b[2]
                              and b[1] - 0.5 <= (w["top"] + w["bottom"]) / 2 <= b[3] + 0.5]
                        res.append((b[1], b[3], _cell_label(ws)))
                    return res

                provinces = label_cells("province")
                area_col = next((c for c in cols if c[0] == "area"), None)

                def label_at(cells, y):
                    return next((lbl for y0, y1, lbl in cells if y0 - 0.5 <= y <= y1 + 0.5), None)

                # A place is a run of product rows starting at RON 100 (or at a
                # repeated product); its label is every area-column word in that run.
                blocks: list[list] = []
                for b in bands:
                    if not blocks or b[0] == "RON 100" or any(x[0] == b[0] for x in blocks[-1]):
                        blocks.append([])
                    blocks[-1].append(b)
                area_of: dict[float, str | None] = {}
                for block in blocks:
                    lo, hi = block[0][2], block[-1][3]
                    ws = [w for w in tw if area_col and area_col[2] - 1 <= (w["x0"] + w["x1"]) / 2 <= area_col[3] + 1
                          and lo <= (w["top"] + w["bottom"]) / 2 < hi]
                    label = _cell_label(ws)
                    for b in block:
                        area_of[b[1]] = label

                values: dict[tuple, list] = {}
                for w in tw:
                    c = col_of(w)
                    if not c or c[0] not in ("brand", "common"):
                        continue
                    cy = (w["top"] + w["bottom"]) / 2
                    band = next((b for b in bands if b[2] <= cy < b[3]), None)
                    if band:
                        values.setdefault((band[1], c[0], c[1]), []).append(w)

                for label, cy, _, _ in bands:
                    area = area_of.get(cy)
                    # Province cells span many towns; blocks outside the
                    # labelled cell belong to the province above.
                    province = label_at(provinces, cy) or (last_province if provinces else None)
                    last_province = province
                    for (bcy, kind, brand), ws in values.items():
                        if bcy != cy:
                            continue
                        nums = [v for v in _numbers(" ".join(x["text"] for x in sorted(ws, key=lambda x: x["x0"])))
                                if _valid(v)]
                        if not nums:
                            continue
                        row = {"province": province, "area": area, "product": label}
                        if kind == "common":
                            out.append({**row, "brand": None, "common": nums[0]})
                        else:
                            out.append({**row, "brand": brand.title(), "min": min(nums), "max": max(nums)})
    return out, header_text


# ---------------------------------------------------------------- ingest

class AreaResolver:
    def __init__(self, gz: Gazetteer):
        self.gz = gz
        self.misses: set[str] = set()

    def __call__(self, region: str, province: str | None, area: str | None,
                 filename: str = "") -> str | None:
        if not area:
            return None
        scope = REGIONS[region]
        # Mindanao tags duplicate names with a province code: "Carmen-DDN".
        area = re.sub(r"\s*-\s*[A-Z]{2,4}$", "", area.strip())
        # "Romblon, Romblon": town, province
        if "," in area:
            area, _, tail = area.partition(",")
            province = province or tail.strip()
        name = AREA_ALIASES.get(area.lower(), area)
        prov = None
        if province:
            province = PROVINCE_ALIASES.get(province.lower().strip(), province)
            prov = self.gz.province(province)
        code = self.gz.lgu(name, province=prov, regions=scope)
        if code is None:
            # NIR / BARMM boundary changes: try nationwide when the name is unique.
            code = self.gz.lgu(name, province=prov)
        if code is None:
            self.misses.add(f"{region}: {province or '-'} / {area}   [{filename}]")
        return code


def _download(url: str) -> Path:
    # Fuel PDFs are small (<2 MB); keep them so re-parsing never re-downloads.
    name = unquote(url.split("?")[0].rsplit("/", 1)[1])
    return net.fetch_cached(url, f"doe/{name}")


def ingest(gz: Gazetteer, force: bool = False) -> None:
    resolve = AreaResolver(gz)
    for region, urls in listing().items():
        for url in urls:
            filename = unquote(url.rsplit("/", 1)[1])
            doc_key = re.sub(r"[^A-Za-z0-9]+", "-", filename[:-4]).strip("-")[:80]
            source = f"doe_{region.replace('-', '_')}"
            existing = list((store.PRICES / source).glob(f"*__{doc_key}.json")) if (store.PRICES / source).exists() else []
            if existing and not force:
                continue
            path = _download(url + "?prefix=dev%2Fmedia")
            try:
                sha = net.sha256(path)
                text_len = len("".join((p.extract_text() or "") for p in pdfplumber.open(path).pages))
                created = _created_at(filename)
                rows_raw, header = ([], "") if text_len < 200 else parse(path)
                period = (period_from_text(header, (created or date.today()).year)
                          or period_from_text(filename, (created or date.today()).year)
                          or (_week_of(created) if created else None))
                status = "needs_ocr" if text_len < 200 else ("ok" if rows_raw else "empty")
            except Exception as e:
                print(f"{source}: failed on {filename}: {e!r}")
                continue
            if period is None:
                print(f"{source}: no period for {filename}; skipped")
                continue
            start, end = period
            if end.isoformat() < HISTORY_START:
                continue
            rows = []
            for r in rows_raw:
                code = resolve(region, r["province"], r["area"], filename)
                if code is None:
                    continue
                item, key = PRODUCTS[r["product"]]
                base = {"item": item, "cat": "fuel", "unit": "L", "key": key, "area": code,
                        "start": start.isoformat(), "end": end.isoformat()}
                if r["brand"]:
                    rows.append({**base, "brand": r["brand"], "min": r["min"], "max": r["max"]})
                else:
                    rows.append({**base, "price": r["common"]})
            name = f"{start.isoformat()}__{doc_key}"
            for old in existing:
                old.unlink()
            store.write(source, name, {
                "url": url, "filename": filename, "sha256": sha,
                "period_start": start.isoformat(), "period_end": end.isoformat(),
                "status": status, "areas": len({r["area"] for r in rows}),
            }, rows)
            print(f"{source} {start}..{end}: {status} {len(rows)} rows, {len({r['area'] for r in rows})} areas  ({filename})")
    if resolve.misses:
        print("doe: unmatched places:\n  " + "\n  ".join(sorted(resolve.misses)))


# ---------------------------------------------------------------- adjustments

ADJ_PAGE = "/data-and-prices/liquid-fuels/retail-pump-prices/price-adjustments"
ADJ_PRODUCTS = {"gasoline": "adj_gasoline", "diesel": "adj_diesel", "kerosene": "adj_kerosene"}


def parse_adjustments(path: Path) -> tuple[list[dict], str]:
    """Per-company P/L changes from a 'Summary of Prior Notice on Price Adjustments'.

    Columns are placed by the header words' x positions because companies
    that don't sell kerosene leave that cell blank.
    """
    out: list[dict] = []
    text = ""
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            text += (page.extract_text() or "") + "\n"
            words = page.extract_words()
            heads = {w["text"].lower(): (w["x0"] + w["x1"]) / 2 for w in words
                     if w["text"].lower() in ADJ_PRODUCTS}
            if len(heads) < 2:
                continue
            head_y = max(w["bottom"] for w in words if w["text"].lower() in ADJ_PRODUCTS)
            company_head = next((w for w in words if w["text"].lower() == "company"), None)
            name_edge = (company_head["x1"] + 8) if company_head else min(heads.values()) - 220
            lines: dict[int, list] = {}
            for w in words:
                if w["top"] > head_y:
                    lines.setdefault(round(w["top"] / 3), []).append(w)
            for ws in lines.values():
                nums = [w for w in ws if re.fullmatch(r"[-+]?\d+\.\d{2}", w["text"].replace("(", "-").rstrip(")"))]
                if not nums:
                    continue
                # company = words starting in the "Oil Company" column; an
                # indented "Total" is a staged-increase subtotal, not a company
                name = " ".join(w["text"] for w in sorted(ws, key=lambda w: w["x0"])
                                if w["x0"] < name_edge and not re.match(r"\d", w["text"])
                                and w["text"] not in ("AM", "PM"))
                if not name:
                    continue
                for w in nums:
                    x = (w["x0"] + w["x1"]) / 2
                    prod = min(heads, key=lambda h: abs(heads[h] - x))
                    out.append({"company": name, "product": prod,
                                "delta": float(w["text"].replace("(", "-").rstrip(")"))})
    return out, text


def ingest_adjustments(force: bool = False) -> None:
    r = net.get(f"{CMS}/api/pages", params={"where[path][equals]": ADJ_PAGE, "depth": 2})
    urls = sorted(set(re.findall(r"https://d24qbtp4vooyzi\.cloudfront\.net/api/media/file/[^\"\\?]+\.pdf", r.text)))
    for url in urls:
        filename = unquote(url.rsplit("/", 1)[1])
        doc_key = re.sub(r"[^A-Za-z0-9]+", "-", filename[:-4]).strip("-")[:80]
        folder = store.PRICES / "doe_adjust"
        existing = list(folder.glob(f"*__{doc_key}.json")) if folder.exists() else []
        if existing and not force:
            continue
        path = net.fetch_cached(url + "?prefix=dev%2Fmedia", f"adj/{filename}")
        raw, text = parse_adjustments(path)
        created = _created_at(filename)
        period = (period_from_text(text, (created or date.today()).year)
                  or period_from_text(filename, (created or date.today()).year))
        if period is None:
            print(f"doe_adjust: no period for {filename}")
            continue
        start, end = period
        rows = [{"item": f"{r['product'].title()} price change", "cat": "fuel", "unit": "L",
                 "key": ADJ_PRODUCTS[r["product"]], "brand": r["company"],
                 "start": start.isoformat(), "end": end.isoformat(), "price": r["delta"]}
                for r in raw]
        # Staged increases (two tranches on different days) leave companies
        # with only some products read; don't present such a week as a summary.
        counts = {k: sum(1 for r in rows if r["key"] == k) for k in ("adj_gasoline", "adj_diesel")}
        status = ("empty" if not rows else
                  "partial" if min(counts.values()) < 0.7 * max(counts.values()) else "ok")
        for old in existing:
            old.unlink()
        store.write("doe_adjust", f"{start.isoformat()}__{doc_key}", {
            "url": url, "filename": filename, "sha256": net.sha256(path),
            "period_start": start.isoformat(), "period_end": end.isoformat(), "status": status,
        }, rows)
        print(f"doe_adjust {start}: {len(rows)} rows ({filename})")
