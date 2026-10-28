"""Turn the normalized history in data/ into the static JSON the app reads.

Everything is precomputed so the app never filters large files: it picks the
nearest place on-device, then fetches one small file per source.
"""

import json
import re
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
    found: dict[str, list[dict]] = {}
    for it in series["items"]:
        k = it.get("key")
        if k not in HEADLINE:
            continue
        idx = [i for i, v in enumerate(it["s"]) if v is not None]
        if not idx or idx[-1] < len(periods) - 14:  # not reported lately
            continue
        found.setdefault(k, []).append(it)

    def row(k: str, it: dict) -> dict:
        idx = [i for i, v in enumerate(it["s"]) if v is not None]
        last, prev = idx[-1], (idx[-2] if len(idx) > 1 else None)
        return {"key": k, "item": it["item"], "unit": it["unit"], "cat": it["cat"],
                **({"origin": it["origin"]} if it.get("origin") else {}),
                "last": it["s"][last], "period": periods[last],
                **({"prev": it["s"][prev], "prev_period": periods[prev]} if prev is not None else {}),
                "spark": it["s"][-30:]}

    out = []
    for k in HEADLINE:
        its = sorted(found.get(k, []), key=lambda it: _ORIGIN_RANK.get(it.get("origin"), 1))
        if not its:
            continue
        r = row(k, its[0])
        # The other variants ride along so the app can honour Settings → local / imported / cheapest.
        others = [row(k, it) for it in its[1:] if it.get("origin") != its[0].get("origin")]
        if others:
            r["variants"] = others
        out.append(r)
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


def _offer_stats(h: list, end: str) -> dict:
    """Deal numbers for one store's price history: the last drop and the 30-day range."""
    from datetime import date, timedelta

    cur = h[-1][1] if h else None
    if cur is None:
        return {}
    out: dict = {}
    if len(h) >= 2 and h[-2][1] is not None and h[-2][1] > cur:
        out.update(drop=round(h[-2][1] - cur, 2), since=h[-1][0])
    start = (date.fromisoformat(end) - timedelta(days=30)).isoformat()
    window = [p for i, (d, p) in enumerate(h) if p is not None and (i + 1 == len(h) or h[i + 1][0] > start)]
    # cheapest it has been in 30 days, it was dearer in that time, and we have
    # watched it for at least two weeks (a 2-day-old history proves nothing)
    tracked = (date.fromisoformat(end) - date.fromisoformat(h[0][0])).days
    if tracked >= 14 and max(window) > cur and cur <= min(window):
        out["low30"] = True
    return out


def _fx_latest() -> dict[str, tuple[float, str]]:
    """{currency: (PHP per unit, date)} from the newest BSP rates."""
    rates: dict[str, tuple[float, str]] = {}
    for d in store.read_all("bsp_forex"):
        for r in d["rows"]:
            if r["unit"] == "PHP" and not r["item"].startswith("BSP_"):
                if r["item"] not in rates or r["start"] >= rates[r["item"]][1]:
                    rates[r["item"]] = (r["price"], r["start"])
    return rates


def _build_gadgets(meta: dict) -> int:
    """gadgets/index.json (categories, models with lowest price and deals) +
    gadgets/<model>.json (per variant: each store's offer, price changes and
    Apple's price abroad in pesos)."""
    from datetime import date, timedelta

    from .sources.gadgets import ABROAD, CATEGORIES, CHECKED, STORES, make_of, sort_key

    checked = json.loads(CHECKED.read_text()) if CHECKED.exists() else {}
    names: dict[str, str] = {}
    cats: dict[str, str] = {}
    # key -> spec -> store -> {"h": [[day, price|None], ...], "now": row|None}
    offers: dict = defaultdict(lambda: defaultdict(dict))
    stores = []
    for st in STORES:
        docs = [d for d in store.read_all(f"gadgets_{st['id']}") if d["rows"]]
        if not docs:
            continue
        stores.append({k: st[k] for k in ("id", "name", "url", "official", "slot") if k in st}
                      | {"checked": checked.get(st["id"], docs[-1]["doc"]["period_start"])})
        listed: set = set()
        for d in docs:
            day = d["doc"]["period_start"]
            now = set()
            for r in d["rows"]:
                names[r["key"]] = r["item"]
                cats[r["key"]] = r.get("cat") if r.get("cat") != "gadgets" else "phones"
                o = offers[r["key"]][r["spec"]].setdefault(st["id"], {"h": []})
                if not o["h"] or o["h"][-1][1] != r["price"]:
                    o["h"].append([day, r["price"]])
                now.add((r["key"], r["spec"]))
            for key, spec in listed - now:  # dropped from the store's site
                h = offers[key][spec][st["id"]]["h"]
                if h[-1][1] is not None:
                    h.append([day, None])
            listed = now
        for r in docs[-1]["rows"]:
            offers[r["key"]][r["spec"]][st["id"]]["now"] = r
    if not stores:
        return 0
    end = max(s["checked"] for s in stores)

    # Apple abroad: latest prices, converted at BSP's latest reference rate
    fx = _fx_latest()
    abroad: dict = defaultdict(lambda: defaultdict(list))  # key -> spec -> [{cc, cur, price, php}]
    countries = []
    for c in ABROAD:
        docs = [d for d in store.read_all(f"gadgets_abroad_{c['cc'].lower()}") if d["rows"]]
        if not docs or c["cur"] not in fx:
            continue
        rate, rate_day = fx[c["cur"]]
        countries.append({**c, "rate": rate, "rate_date": rate_day,
                          "checked": checked.get(f"abroad_{c['cc'].lower()}", docs[-1]["doc"]["period_start"])})
        for r in docs[-1]["rows"]:
            abroad[r["key"]][r["spec"]].append({"cc": c["cc"], "price": r["price"],
                                                "php": round(r["price"] * rate), "url": r["url"]})

    def size_order(spec: str) -> tuple:
        m = re.match(r"(\d+)(GB|TB|mm)", spec)
        n = int(m.group(1)) * (1024 if m.group(2) == "TB" else 1) if m else 0
        return (n, spec)

    total = 0
    index = []
    for key in offers:
        variants = []
        best = None  # lowest in-stock (or stock-unknown) price right now
        deal = None  # biggest recent drop among in-stock offers
        recent = (date.fromisoformat(end) - timedelta(days=14)).isoformat()
        for spec in sorted(offers[key], key=size_order):
            out = []
            for sid, o in offers[key][spec].items():
                r = o.get("now")
                cur = {"price": r["price"], "url": r["url"],
                       **{k: r[k] for k in ("was", "stock", "colors", "pre", "note") if k in r}} if r else {}
                stats = _offer_stats(o["h"], end) if r else {}
                out.append({"store": sid, **cur, **stats, "h": o["h"]})
                if r and r.get("stock", True):
                    if best is None or r["price"] < best[0]:
                        best = (r["price"], sid, spec)
                    if stats.get("drop") and stats["since"] >= recent:
                        pct = stats["drop"] / (r["price"] + stats["drop"])
                        if deal is None or pct > deal["pct"]:
                            deal = {"pct": round(pct, 4), "drop": stats["drop"], "store": sid, "spec": spec,
                                    "since": stats["since"], "price": r["price"]}
            out.sort(key=lambda x: (x.get("price") is None, x.get("stock") is False, x.get("price") or 0))
            variants.append({"spec": spec, "offers": out,
                             **({"abroad": abroad[key][spec]} if abroad.get(key, {}).get(spec) else {})})
        name, cat = names[key], cats[key]
        total += _write(f"gadgets/{key}.json", {"key": key, "name": name, "cat": cat, "end": end, "variants": variants})
        listed = [v for v in variants if any("price" in o for o in v["offers"])]
        if not listed:
            continue
        srp = next((o["price"] for v in listed for o in v["offers"] if o["store"] == "apple" and "price" in o), None)
        low30 = best and any(o.get("low30") and o.get("price") == best[0] and o.get("stock") is not False
                             for v in listed for o in v["offers"] if v["spec"] == best[2])
        top = max(o["price"] for v in listed for o in v["offers"] if "price" in o)
        index.append({"key": key, "name": name, "cat": cat, "make": make_of(name),
                      "specs": [v["spec"] for v in listed],
                      "stores": len({o["store"] for v in listed for o in v["offers"] if "price" in o}),
                      **({"from": best[0], "from_store": best[1], "from_spec": best[2]} if best else {}),
                      **({"srp": srp} if srp else {}), **({"deal": deal} if deal else {}),
                      **({"low30": True} if low30 else {}), "_top": top})

    makes = ["Apple", "Samsung", "Sony", "Nintendo", "Microsoft", "Valve"]

    def order(m: dict) -> tuple:
        if m["cat"] == "phones":
            return (0, sort_key(m["name"]))
        if m["cat"] == "games":
            return (0, (m["name"].lower(),))
        mk = makes.index(m["make"]) if m["make"] in makes else len(makes)
        return (mk, (-m["_top"], m["name"]))

    index.sort(key=lambda m: ([c for c, _ in CATEGORIES].index(m["cat"]), order(m)))
    for m in index:
        del m["_top"]
    deals = sorted((m for m in index if "deal" in m), key=lambda m: -m["deal"]["pct"])[:12]
    total += _write("gadgets/index.json", {
        "stores": stores, "end": end, "countries": countries,
        "categories": [{"id": c, "label": label, "count": sum(1 for m in index if m["cat"] == c)}
                       for c, label in CATEGORIES if any(m["cat"] == c for m in index)],
        "models": index,
        "deals": [m["key"] for m in deals],
    })
    meta["sources"]["gadgets"] = {"latest": end}
    return total


def _norm_drug(s: str) -> str:
    return re.sub(r"[^a-z0-9.%+]+", " ", (s or "").lower()).strip()


def _build_medicine(meta: dict) -> int:
    """medicine.json: one row per medicine (generic + strength/form) with the
    DPRI lowest/median/highest and, where regulated, the MRP; plus the change
    in median since the previous booklet."""
    dpri = [d for d in store.read_all("doh_dpri") if d["rows"]]
    mrp = [d for d in store.read_all("doh_mrp") if d["rows"]]
    if not dpri and not mrp:
        return 0
    latest = dpri[-1] if dpri else None
    prev = {(_norm_drug(r["item"]), _norm_drug(r.get("spec"))): r["price"] for r in (dpri[-2]["rows"] if len(dpri) > 1 else [])}
    items: dict = {}
    for r in latest["rows"] if latest else []:
        k = (_norm_drug(r["item"]), _norm_drug(r.get("spec")))
        p = prev.get(k)
        items[k] = {"name": r["item"], **({"desc": r["spec"]} if r.get("spec") else {}),
                    "lo": r.get("min"), "med": r["price"], "hi": r.get("max"),
                    **({"prev": p} if p is not None and p != r["price"] else {})}
    for r in mrp[-1]["rows"] if mrp else []:
        k = (_norm_drug(r["item"]), _norm_drug(r.get("spec")))
        it = items.setdefault(k, {"name": r["item"], **({"desc": r["spec"]} if r.get("spec") else {})})
        it["mrp"] = r["price"]
        if r.get("brand"):
            it["use"] = r["brand"]
    rows = sorted(items.values(), key=lambda x: (x["name"].lower(), x.get("desc") or ""))
    body = {"dpri": {"date": latest["doc"]["period_start"], "url": latest["doc"]["url"]} if latest else None,
            "mrp": {"date": mrp[-1]["doc"]["period_start"], "url": mrp[-1]["doc"]["url"]} if mrp else None,
            "items": [{k: v for k, v in r.items() if v is not None} for r in rows]}
    meta["sources"]["doh_dpri"] = {"latest": body["dpri"]["date"] if latest else body["mrp"]["date"]}
    return _write("medicine.json", body)


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

    # ---- Meralco: full residential bill at typical kWh levels, per month
    mb = [d for d in store.read_all("meralco_bills") if d["rows"]]
    if mb:
        months = []
        for d in mb:
            pts: dict = defaultdict(list)
            for r in sorted(d["rows"], key=lambda r: r["kwh"]):
                pts[r["brand"]].append([r["kwh"], r["price"]])
            months.append({"month": d["doc"]["period_start"][:7], "url": d["doc"]["url"],
                           "regular": pts["regular"], "lifeline": pts["lifeline"]})
        total += _write("power/meralco.json", {"months": months})
        meta["sources"]["meralco_bills"] = {"latest": months[-1]["month"]}

    # ---- BSP exchange rates: monthly history backfill + daily bulletins
    fx_docs = store.read_all("bsp_forex")
    if fx_docs:
        rates: dict = defaultdict(dict)  # day -> code -> PHP
        # history first, so a day's bulletin wins where both exist
        for d in sorted(fx_docs, key=lambda d: not d["doc"].get("url", "").endswith(".xlsx")):
            for r in d["rows"]:
                if r["unit"] == "PHP" and not r["item"].startswith("BSP_"):
                    rates[r["start"]][r["item"]] = r["price"]
        days = sorted(rates)
        codes = sorted({c for v in rates.values() for c in v})
        from .sources.forex import CURRENCIES, NAMES
        order = {code: i for i, (code, _, _) in enumerate(CURRENCIES)}
        latest = max((d for d in fx_docs if d["doc"].get("url", "").endswith(".aspx")),
                     key=lambda d: d["doc"]["period_start"], default=None)
        bsp = {}
        if latest:
            bsp = {"date": latest["doc"]["period_start"],
                   **{r["item"].lower(): r["price"] for r in latest["rows"]
                      if r["item"].startswith("BSP_") or r["item"].endswith("_USD")}}
        total += _write("forex.json", {
            "periods": days, "bsp": bsp,
            "currencies": [{"code": c, "name": NAMES.get(c, c), "s": [rates[d].get(c) for d in days]}
                           for c in sorted(codes, key=lambda c: order.get(c, 99))]})
        meta["sources"]["bsp_forex"] = {"latest": days[-1]}

    # ---- gadgets: phone prices per store, history as price changes
    total += _build_gadgets(meta)

    # ---- medicine: DOH reference prices (latest booklet) + legal maximum retail prices
    total += _build_medicine(meta)

    # ---- hand-maintained tables (water tariffs, PUV fares)
    for name in ("water", "fares"):
        p = DATA / "static" / f"{name}.json"
        if p.exists():
            body = json.loads(p.read_text())
            body.pop("note", None)
            total += _write(f"{name}.json", body)
            meta["sources"][f"{name}_table"] = {"latest": body["checked"]}

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
