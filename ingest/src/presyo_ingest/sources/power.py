"""DOE — residential electricity rates per distribution utility (P/kWh).

DOE's electricity page embeds a public Google Sheet; its "Residential" tab
exports to CSV: one row per utility (code, grid, region, island, type) and
one column per month since Jan 2018. "NDA" = no data available. Section
rows ("LUZON", "VISAYAS", ...) repeat the header row.
"""

import csv
import io
import re

from .. import net, store
from ..paths import HISTORY_START

SHEET = "https://docs.google.com/spreadsheets/d/1oGc1iGpacELS6tkHjesvAeKZo8v2iv4UkYFY04e0p-I"
RESIDENTIAL_GID = "0"
SOURCE = "doe_power"

# Sheet "Region" labels -> PSGC region codes
REGIONS = {
    "ncr": "130000000", "car": "140000000", "region 1": "010000000", "region 2": "020000000",
    "region 3": "030000000", "region 4a": "040000000", "region 4b": "170000000",
    "region 5": "050000000", "region 6": "060000000", "region 7": "070000000",
    "region 8": "080000000", "region 9": "090000000", "region 10": "100000000",
    "region 11": "110000000", "region 12": "120000000", "region 13": "160000000",
    "caraga": "160000000", "barmm": "150000000", "armm": "150000000",
    # NIR (Negros) is newer than the PSGC mirror; its provinces sit in VI/VII there.
    "nir": "060000000",
}

_MON = {m: i + 1 for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}


def _month(label: str) -> str | None:
    m = re.fullmatch(r"([A-Za-z]{3})-(\d{2})", label.strip())
    if not m or m.group(1).lower() not in _MON:
        return None
    return f"20{m.group(2)}-{_MON[m.group(1).lower()]:02d}"


def parse(text: str) -> tuple[list[dict], list[str]]:
    rows = list(csv.reader(io.StringIO(text)))
    out: list[dict] = []
    unknown: set[str] = set()
    header: list[str] | None = None
    for r in rows:
        if r and r[0].strip().lower() == "du name":
            header = r
            continue
        if header is None or not r or not r[0].strip() or len(r) < 6 or not r[2].strip():
            continue
        code, _grid, region, _island, du_type = (c.strip() for c in r[:5])
        region_code = REGIONS.get(region.lower())
        if region_code is None:
            unknown.add(region)
            continue
        source_note = r[header.index("SOURCES")].strip() if "SOURCES" in header and len(r) > header.index("SOURCES") else ""
        # The SOURCES column often holds the utility's full name; ignore links.
        name = source_note if source_note and not re.search(r"https?://|\||rate|advisor|news|archive|schedule|charge",
                                                            source_note, re.I) else None
        for col, val in zip(header[5:], r[5:]):
            month = _month(col)
            if month is None or f"{month}-01" < HISTORY_START:
                continue
            try:
                price = float(val.replace(",", ""))
            except ValueError:
                continue  # NDA / blank
            if not 2 <= price <= 60:
                continue
            out.append({"item": code, "spec": name, "cat": "power", "unit": "kWh",
                        "key": f"power_{re.sub(r'[^a-z0-9]+', '_', code.lower()).strip('_')}",
                        "brand": du_type or None, "area": region_code,
                        "start": f"{month}-01", "end": f"{month}-28", "price": price})
    return out, sorted(unknown)


def ingest(force: bool = False) -> None:
    url = f"{SHEET}/export?format=csv&gid={RESIDENTIAL_GID}"
    body = net.get(url).content.decode("utf-8", errors="replace")
    rows, unknown = parse(body)
    if unknown:
        print(f"power: unknown region labels {unknown}")
    store.write(SOURCE, "residential", {
        "url": f"{SHEET}/edit?gid={RESIDENTIAL_GID}", "status": "ok" if rows else "empty",
        "period_start": min((r["start"] for r in rows), default=None),
        "period_end": max((r["start"] for r in rows), default=None),
        "utilities": len({r["item"] for r in rows}),
    }, rows)
    print(f"power: {len(rows)} rows, {len({r['item'] for r in rows})} utilities")
