"""Turn the normalized history in data/ into the static JSON the app reads.

Everything is precomputed so the app never filters large files: it picks the
nearest place on-device, then fetches one small file per source.
"""

import json
import shutil
from collections import defaultdict
from datetime import datetime, timezone

from . import store
from .geo import load as load_areas
from .paths import APP_DATA, DATA

FUEL_SOURCES = ["doe_ncr", "doe_north_luzon", "doe_south_luzon", "doe_visayas", "doe_mindanao"]
TABS = ["rice", "fuel", "meat", "vegetables", "seafood", "fruits", "pantry"]

# Headline items for the "Today" card and the palengke basket, in display
# order. One variant per key is kept (local first).
HEADLINE = ["rice_well_milled", "rice_regular", "rice_premium", "pork_liempo", "pork_kasim",
            "chicken_whole", "egg_medium", "galunggong", "bangus", "tilapia", "tomato", "onion_red",
            "garlic", "cabbage", "carrots", "potato", "ampalaya", "pechay", "banana_lakatan",
            "calamansi", "sugar_refined", "sugar_washed", "cooking_oil_palm_1l", "salt_iodized"]
_ORIGIN_RANK = {"local": 0, None: 1, "imported": 2}


def _headline(series: dict) -> list[dict]:
    """[{key, item, unit, origin, last, prev, period, prev_period, spark}] from a _series body."""
    periods = series["periods"]
    best: dict[str, dict] = {}
    for it in series["items"]:
        k = it.get("key")
        if k not in HEADLINE:
            continue
        idx = [i for i, v in enumerate(it["s"]) if v is not None]
        if not idx or idx[-1] < len(periods) - 14:  # not reported lately
            continue
        cur = best.get(k)
        if cur is None or _ORIGIN_RANK.get(it.get("origin"), 1) < _ORIGIN_RANK.get(cur.get("origin"), 1):
            best[k] = it
    out = []
    for k in HEADLINE:
        it = best.get(k)
        if not it:
            continue
        idx = [i for i, v in enumerate(it["s"]) if v is not None]
        last, prev = idx[-1], (idx[-2] if len(idx) > 1 else None)
        out.append({"key": k, "item": it["item"], "unit": it["unit"], "cat": it["cat"],
                    **({"origin": it["origin"]} if it.get("origin") else {}),
                    "last": it["s"][last], "period": periods[last],
                    **({"prev": it["s"][prev], "prev_period": periods[prev]} if prev is not None else {}),
                    "spark": it["s"][-30:]})
    return out


def _write(rel: str, obj) -> int:
    path = APP_DATA / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    body = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    path.write_text(body)
    return len(body)


def _price(r: dict):
    """Single price, or [min, max]."""
    if "price" in r:
        return r["price"]
    return [r["min"], r["max"]] if r["min"] != r["max"] else r["min"]


def _item_id(r: dict) -> tuple:
    return (r["cat"], r["item"], r.get("spec"), r.get("origin"), r["unit"])


def _item_meta(key: tuple, r: dict) -> dict:
    cat, item, spec, origin, unit = key
    out = {"cat": cat, "item": item, "unit": unit}
    if spec:
        out["spec"] = spec
    if origin:
        out["origin"] = origin
    if r.get("key"):
        out["key"] = r["key"]
    return out


def _series(docs: list[dict], period_of, group_of) -> dict:
    """{group: {"periods": [...], "items": [{meta, "s": [...]}, ...]}}"""
    periods = sorted({period_of(d) for d in docs})
    idx = {p: i for i, p in enumerate(periods)}
    groups: dict = defaultdict(dict)
    for d in docs:
        p = idx[period_of(d)]
        for r in d["rows"]:
            g = group_of(r)
            if g is None or r["cat"] not in TABS:
                continue
            k = _item_id(r)
            entry = groups[g].get(k)
            if entry is None:
                entry = groups[g][k] = {**_item_meta(k, r), "s": [None] * len(periods)}
            entry["s"][p] = _price(r)
    out = {}
    for g, items in groups.items():
        # drop leading periods with no data at all for this group
        first = min((next((i for i, v in enumerate(it["s"]) if v is not None), len(periods))
                     for it in items.values()), default=0)
        out[g] = {"periods": periods[first:],
                  "items": [{**it, "s": it["s"][first:]} for it in
                            sorted(items.values(), key=lambda x: (x["cat"], x["item"], x.get("spec") or "", x.get("origin") or ""))]}
    return out


def build() -> None:
    if APP_DATA.exists():
        shutil.rmtree(APP_DATA)
    APP_DATA.mkdir(parents=True)
    areas = load_areas()
    by_code = {a["code"]: a for a in areas}
    total = 0
    meta: dict = {"generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                  "tabs": TABS, "sources": {}}

    # ---- PSA: monthly per province / HUC / region
    psa_docs = store.read_all("psa")
    psa = _series(psa_docs, lambda d: d["doc"]["period_start"][:7], lambda r: r["area"])
    for code, body in psa.items():
        total += _write(f"psa/{code}.json", body)
        total += _write(f"summary/{code}.json", {"source": "psa", "items": _headline(body)})
    if psa_docs:
        meta["sources"]["psa"] = {"latest": psa_docs[-1]["doc"]["period_start"][:7],
                                  "places": len(psa)}

    # ---- DA daily index (NCR-wide), split per tab
    idx_docs = store.read_all("da_index")
    if idx_docs:
        s = _series(idx_docs, lambda d: d["doc"]["period_start"], lambda r: r["cat"])
        for cat, body in s.items():
            total += _write(f"da/index-{cat}.json", body)
        # NCR "Today" card: headline items across every category
        everything = _series(idx_docs, lambda d: d["doc"]["period_start"], lambda r: "all")["all"]
        total += _write("summary/ncr.json", {"source": "da_index", "items": _headline(everything)})
        meta["sources"]["da_index"] = {"latest": idx_docs[-1]["doc"]["period_start"]}

    # ---- DA per market
    mk_docs = store.read_all("da_market")
    markets = json.loads((DATA / "markets.json").read_text()) if (DATA / "markets.json").exists() else {}
    if mk_docs:
        s = _series(mk_docs, lambda d: d["doc"]["period_start"], lambda r: r.get("market"))
        for mid, body in s.items():
            total += _write(f"da/m/{mid}.json", body)
        latest = mk_docs[-1]
        rows = defaultdict(dict)
        for r in latest["rows"]:
            if r["cat"] in TABS:
                k = "|".join(str(x or "") for x in _item_id(r))
                rows[k]["meta"] = _item_meta(_item_id(r), r)
                rows[k].setdefault("m", {})[r["market"]] = _price(r)
        total += _write("da/latest.json", {"date": latest["doc"]["period_start"],
                                           "items": [{**v["meta"], "m": v["m"]} for v in rows.values()]})
        meta["sources"]["da_market"] = {"latest": latest["doc"]["period_start"]}
    last_seen: dict[str, str] = {}
    for d in mk_docs:
        for r in d["rows"]:
            last_seen[r["market"]] = d["doc"]["period_start"]
    total += _write("markets.json", [
        {"id": mid, "name": m["name"], "lat": m["lat"], "lng": m["lng"], "area": m.get("area"),
         **({"approx": True} if m.get("approx") else {}), "last": last_seen[mid]}
        for mid, m in sorted(markets.items())
        if mid in last_seen and m.get("lat") is not None
    ])

    # ---- DOE fuel: weekly per city/municipality
    fuel: dict = defaultdict(lambda: defaultdict(list))  # area -> week -> rows
    for src in FUEL_SOURCES:
        docs = store.read_all(src)
        weeks = sorted({d["doc"]["period_start"] for d in docs if d["rows"]})
        if weeks:
            meta["sources"][src] = {"latest": weeks[-1]}
        for d in docs:
            for r in d["rows"]:
                fuel[r["area"]][(r["start"], r["end"])].append(r)
    for area, weeks in fuel.items():
        out = []
        for (start, end), rows in sorted(weeks.items()):
            # Two uploads for the same week (DOE re-uploads) -> keep one row
            # per product+brand.
            seen = {}
            for r in rows:
                seen[(r["key"], r.get("brand"))] = r
            out.append({"start": start, "end": end, "rows": [
                {"key": r["key"], **({"brand": r["brand"]} if r.get("brand") else {}), "p": _price(r)}
                for r in sorted(seen.values(), key=lambda r: (r["key"], r.get("brand") or ""))]})
        total += _write(f"fuel/{area}.json", {"weeks": out})

    # ---- LPG: monthly per city/municipality + Metro Manila monthly range
    lpg: dict = defaultdict(lambda: defaultdict(list))
    lpg_docs = store.read_all("doe_lpg")
    for d in lpg_docs:
        for r in d["rows"]:
            lpg[r["area"]][(r["start"], r["end"])].append(r)
    for area, months in lpg.items():
        total += _write(f"lpg/{area}.json", {"months": [
            {"start": start, "end": end, "rows": [
                {**({"brand": r["brand"]} if r.get("brand") else {}), "p": _price(r)}
                for r in sorted(rows, key=lambda r: (r.get("brand") or ""))]}
            for (start, end), rows in sorted(months.items())]})
    if lpg_docs:
        meta["sources"]["doe_lpg"] = {"latest": max(d["doc"]["period_start"] for d in lpg_docs if d["rows"])}
    mon = store.read_all("doe_lpg_monitor")
    if mon and mon[-1]["rows"]:
        rows = mon[-1]["rows"]
        total += _write("lpg/ncr-monthly.json", {"periods": [r["start"][:7] for r in rows],
                                                 "s": [[r["min"], r["max"]] for r in rows]})

    # ---- weekly fuel price adjustment notices (latest 8 weeks)
    import statistics
    adj = []
    for d in store.read_all("doe_adjust"):
        if not d["rows"]:
            continue
        by: dict = defaultdict(list)
        companies: dict = defaultdict(dict)
        for r in d["rows"]:
            prod = r["key"].removeprefix("adj_")
            by[prod].append(r["price"])
            companies[r["brand"]][prod] = r["price"]
        adj.append({"start": d["doc"]["period_start"], "end": d["doc"]["period_end"],
                    "status": d["doc"].get("status", "ok"),
                    "products": {k: {"median": round(statistics.median(v), 2), "min": min(v),
                                     "max": max(v), "n": len(v)} for k, v in by.items()},
                    "companies": [{"name": n, **v} for n, v in sorted(companies.items())]})
    adj.sort(key=lambda w: w["start"])
    if adj:
        total += _write("fuel/adjust.json", {"weeks": adj[-8:]})

    # ---- electricity: monthly residential rate per utility, grouped by region
    pw = store.read_all("doe_power")
    if pw and pw[-1]["rows"]:
        by_region: dict = defaultdict(lambda: defaultdict(dict))
        meta_du: dict = {}
        months = sorted({r["start"][:7] for r in pw[-1]["rows"]})
        for r in pw[-1]["rows"]:
            by_region[r["area"]][r["item"]][r["start"][:7]] = r["price"]
            meta_du[r["item"]] = {"type": r.get("brand"), **({"name": r["spec"]} if r.get("spec") else {})}
        for region, dus in by_region.items():
            total += _write(f"power/{region}.json", {"periods": months, "utilities": [
                {"id": du, **meta_du[du], "s": [vals.get(m) for m in months]}
                for du, vals in sorted(dus.items())]})
        meta["sources"]["doe_power"] = {"latest": months[-1]}

    # ---- DTI suggested retail prices (national)
    srp = store.read_all("dti_srp")
    if srp and srp[-1]["rows"]:
        sections: dict = defaultdict(list)
        for r in sorted(srp[-1]["rows"], key=lambda r: r.get("n", 0)):
            sections[r.get("brand") or "Other"].append({"item": r["item"], **({"size": r["spec"]} if r.get("spec") else {}),
                                                        "srp": r["price"]})
        total += _write("grocery/srp.json", {"effective": srp[-1]["doc"]["period_start"],
                                             "url": srp[-1]["doc"]["url"],
                                             "sections": [{"name": k, "items": v} for k, v in sections.items()]})
        meta["sources"]["dti_srp"] = {"latest": srp[-1]["doc"]["period_start"]}

    # ---- places: everything the app needs to pick a location on-device
    lgus = [a for a in areas if a["level"] in ("city", "municipality") and a["lat"] is not None]
    names = {a["code"]: a["name"] for a in areas if a["level"] in ("region", "province", "district")}
    total += _write("places.json", {
        "cols": ["code", "name", "province", "region", "lat", "lng", "flags"],
        "rows": [[a["code"], a["name"], a["province"], a["region"], a["lat"], a["lng"],
                  (1 if a["code"] in fuel else 0) | (2 if a["code"] in psa else 0)
                  | (4 if a["code"] in lpg else 0)]
                 for a in lgus],
        "names": names,
        "psa": sorted(c for c in psa if c in by_code and by_code[c]["level"] in ("province", "region")),
    })
    total += _write("meta.json", meta)
    print(f"build: {total / 1e6:.1f} MB raw JSON in {APP_DATA}")
