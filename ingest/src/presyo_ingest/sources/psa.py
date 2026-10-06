"""PSA OpenSTAT — monthly retail prices by region / province / HUC.

PXWeb API: POST a query to the table URL. Gotchas (2026-10):
  * json-stat2 responses are broken (one value for the whole cube) -> use csv.
  * "." marks a missing value.
  * The 2M/NRP series stops in 2021; 2M/2018NEW is the live one.
"""

import csv
import io
import re

from .. import net
from ..catalog import key_for, origin_of, titlecase
from ..geo import Gazetteer, norm
from ..paths import HISTORY_START
from .. import store

BASE = "https://openstat.psa.gov.ph/PXWeb/api/v1/en/DB/2M/2018NEW/"
SOURCE = "psa"

# table id -> category; _category() refines mixed tables per item
TABLES = {
    "0042M4ARN01.px": "rice",        # cereals: rice + corn (corn -> pantry)
    "0042M4ARN02.px": "vegetables",  # root crops
    "0042M4ARN03.px": "pantry",      # beans & legumes (string/Baguio beans -> vegetables)
    "0042M4ARN04.px": "vegetables",  # condiments: onion, garlic, ginger
    "0042M4ARN05.px": "vegetables",  # fruit vegetables
    "0042M4ARN06.px": "vegetables",  # leafy vegetables
    "0042M4ARN07.px": "fruits",
    "0042M4ARN08.px": "pantry",      # coconuts
    "0042M4ARN09.px": "meat",        # livestock
    "0042M4ARN10.px": "meat",        # poultry + eggs
    "0042M4ARN11.px": "seafood",
}

MONTHS = ["January", "February", "March", "April", "May", "June", "July",
          "August", "September", "October", "November", "December"]


def _geo_codes(labels: list[str], gz: Gazetteer) -> dict[str, str | None]:
    """PSA geolocation label -> PSGC code (None = no PSGC equivalent)."""
    regions = [a for a in gz.areas if a["level"] == "region"]
    out: dict[str, str | None] = {}
    region: str | None = None
    for label in labels:
        name = label.lstrip(".")
        depth = len(label) - len(name)
        if depth == 0:
            out[label] = "PH"
        elif depth == 2:
            parts = {norm(p) for p in re.split(r"\s+-\s+", name)}
            hit = [r for r in regions if parts & {norm(r["name"]), norm(r["short"])}]
            region = hit[0]["code"] if len(hit) == 1 else None
            out[label] = region
        else:
            # "City of Cebu" must not fall through to Cebu province.
            scope = {region} if region else None
            if re.search(r"\bcity\b", name, re.I):
                # Cotabato City sits in BARMM for PSA but Region XII in the PSGC mirror.
                code = gz.lgu(name, regions=scope) or gz.lgu(name)
            else:
                code = gz.province(name) or gz.lgu(name, regions=scope)
            out[label] = code
    return out


def _category(table_cat: str, label: str) -> str:
    up = label.upper()
    if table_cat == "rice" and not up.startswith("RICE"):
        return "pantry"  # corn grits, whole corn
    if table_cat == "pantry" and ("STRING BEANS" in up or "BAGUIO BEANS" in up):
        return "vegetables"
    return table_cat


def _item(label: str) -> tuple[str, str, str]:
    """'FRESH PORK, KASIM, 1 KG' -> ('Pork, Kasim', '', 'kg')."""
    m = re.search(r",\s*1\s*(KG|PC)\s*$", label)
    unit = (m.group(1).lower() if m else "kg")
    name = label[: m.start()] if m else label
    name = re.sub(r"^(FRESH|EDIBLE OFFAL)\s+(FISH|SHRIMP|CRABS|SHELLS|SQUID|SEAWEEDS|FRUIT)?,?\s*",
                  lambda mm: (mm.group(2) + ", ") if mm.group(2) not in (None, "FRUIT") else "", name)
    return titlecase(name.strip(", ")), "", unit


def fetch_table(table: str, meta: dict, year: str) -> list[list[str]]:
    vars_ = {v["code"]: v for v in meta["variables"]}
    year_var = next(v for v in meta["variables"] if v["text"].lower() == "year")
    period_var = next(v for v in meta["variables"] if v["text"].lower() == "period")
    if year not in year_var["valueTexts"]:
        return []
    query = {
        "query": [
            {"code": year_var["code"], "selection": {"filter": "item", "values": [
                year_var["values"][year_var["valueTexts"].index(year)]]}},
            {"code": period_var["code"], "selection": {"filter": "item", "values": [
                c for c, t in zip(period_var["values"], period_var["valueTexts"]) if t in MONTHS]}},
        ],
        "response": {"format": "csv"},
    }
    del vars_
    r = net.request("POST", BASE + table, json=query)
    text = r.content.decode("utf-8-sig", errors="replace")
    if "�" in text:
        text = r.content.decode("latin-1")
    return list(csv.reader(io.StringIO(text)))


def ingest(gz: Gazetteer, force: bool = False) -> None:
    year_from = int(HISTORY_START[:4])
    by_month: dict[str, list[dict]] = {}
    tables_meta: dict[str, str] = {}
    unmapped: set[str] = set()

    listing = {t["id"]: t.get("updated", "") for t in net.get(BASE.rstrip("/")).json()}
    for table, category in TABLES.items():
        meta = net.get(BASE + table).json()
        tables_meta[table] = listing.get(table, "")
        geo_var = meta["variables"][0]
        geos = _geo_codes(geo_var["valueTexts"], gz)
        for year in range(year_from, 2100):
            rows = fetch_table(table, meta, str(year))
            if not rows:
                break
            header = rows[0]
            for rec in rows[1:]:
                geo_label, item_label, *vals = rec
                code = geos.get(geo_label)
                if code is None:
                    unmapped.add(geo_label.lstrip("."))
                    continue
                item, spec, unit = _item(item_label)
                cat = _category(category, item_label)
                for col, val in zip(header[2:], vals):
                    val = val.strip()
                    if val in (".", "", "..", "-"):
                        continue
                    y, month = col.split(" ", 1)
                    if month not in MONTHS:
                        continue
                    mm = MONTHS.index(month) + 1
                    start = f"{y}-{mm:02d}-01"
                    by_month.setdefault(start[:7], []).append({
                        "item": item, "spec": spec or None, "cat": cat, "unit": unit,
                        "key": key_for(cat, item, spec), "origin": origin_of(item_label),
                        "area": code, "start": start, "end": _month_end(int(y), mm),
                        "price": float(val),
                    })

    if unmapped:
        print(f"psa: no PSGC match for {sorted(unmapped)}")
    for month, rows in sorted(by_month.items()):
        store.write(SOURCE, month, {
            "url": BASE, "period_start": f"{month}-01", "period_end": rows[0]["end"],
            "tables": tables_meta,
        }, rows)
        print(f"psa {month}: {len(rows)} rows")


def _month_end(y: int, m: int) -> str:
    import calendar
    return f"{y}-{m:02d}-{calendar.monthrange(y, m)[1]:02d}"
