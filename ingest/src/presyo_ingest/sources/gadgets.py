"""Gadget prices — phones at the official Apple Store PH and big PH resellers.

Unlike the government sources there is no report to download: each run reads
the stores' current prices and records a new document only when something
changed, so the history is a list of price changes (and the day each store
was last checked is kept in data/gadgets-checked.json).

Stores:
- Apple Store PH: every iPhone page under /ph/shop/buy-iphone embeds
  `PRODUCT_SELECTION_BOOTSTRAP` (one product per part number with its color
  and capacity; prices under displayValues.prices keyed by `fullPrice`).
- Power Mac Center, Beyond the Box, iStore (Apple resellers) and Digital
  Walker (Samsung and others) run Shopify, whose open `/products.json` lists
  the whole catalog with variant price, compare-at price and availability.
  Power Mac Center lists one product per variant ("iPhone 17 Pro Max 256GB
  Silver"); the others use Color/Capacity options.

One row per model × storage × store: the lowest price among in-stock colors
(any color when none is in stock), the colors in stock and a link.
"""

import json
import re
from datetime import datetime
from zoneinfo import ZoneInfo

from .. import net, store
from ..paths import DATA

STORES: list[dict] = [
    {"id": "apple", "name": "Apple Store", "url": "https://www.apple.com/ph/shop/buy-iphone", "official": True},
    {"id": "powermac", "name": "Power Mac Center", "url": "https://powermaccenter.com", "shopify": "powermaccenter.com"},
    {"id": "beyondthebox", "name": "Beyond the Box", "url": "https://www.beyondthebox.ph", "shopify": "www.beyondthebox.ph"},
    {"id": "istore", "name": "iStore", "url": "https://istore.ph", "shopify": "istore.ph"},
    {"id": "digitalwalker", "name": "Digital Walker", "url": "https://digitalwalker.ph", "shopify": "digitalwalker.ph"},
]
CHECKED = DATA / "gadgets-checked.json"
APPLE_BASE = "https://www.apple.com"

# Phones we track. Anything after the model name must be storage and/or color;
# accessories ("iPhone 17 Pro Silicone Case") are dropped by ACCESSORY and MIN_PRICE.
_MODEL = re.compile(
    r"^(?:\[(?P<tag>[^\]]*)\]\s*)?"
    r"(?P<model>iPhone\s+(?:\d{2}e?|Air|Duo)(?:\s+Pro\s+Max|\s+Pro|\s+Plus)?"
    r"|Galaxy\s+(?:S\d{2}(?:\s+Ultra|\s+FE|\s+Edge|\+)?|Z\s*(?:Fold|Flip)\s*\d+(?:\s+FE)?|A\d{2}))"
    r"(?=\s|$)(?P<rest>.*)$",
    re.I,
)
ACCESSORY = re.compile(r"case|wallet|bumper|battery|voucher|cover|glass|protector|charger|cable|strap|band|skin",
                       re.I)
MIN_PRICE = 5000
_STORAGE = re.compile(r"(\d+)\s*(GB|TB)\b", re.I)


def manila_today() -> str:
    return datetime.now(ZoneInfo("Asia/Manila")).date().isoformat()


def model_name(raw: str) -> str:
    """Canonical spelling: "iphone 17 pro max" -> "iPhone 17 Pro Max", "Galaxy Z Fold 6" -> "Galaxy Z Fold6"."""
    words = raw.split()
    out = []
    for w in words:
        lw = w.lower()
        if lw == "iphone":
            out.append("iPhone")
        elif re.fullmatch(r"\d+e", lw) or re.fullmatch(r"[sa]\d+\+?", lw):
            out.append(lw.upper() if lw[0] in "sa" else lw)
        elif lw in ("fe",):
            out.append("FE")
        else:
            out.append(w[:1].upper() + w[1:].lower())
    name = " ".join(out)
    return re.sub(r"\b(Fold|Flip) (\d+)", r"\1\2", re.sub(r"\bZ(Fold|Flip)", r"Z \1", name))


def model_key(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower().replace("+", " plus")).strip("-")


def brand_of(name: str) -> str:
    return "Apple" if name.startswith("iPhone") else "Samsung"


_TIERS = ["Pro Max", "Ultra", "Pro", "Fold", "Duo", "Air", "Flip", "Plus", "+", "Edge"]


def sort_key(name: str) -> tuple:
    """Newest generation first, then Pro Max > Pro > Duo > Air > Plus > base > e / FE."""
    m = re.search(r"(\d+)", name)
    gen = int(m.group(1)) if m else {"iPhone Air": 17, "iPhone Duo": 18}.get(name, 0)
    if re.search(r"\d+e$|\bFE$", name):
        tier = len(_TIERS) + 1
    else:
        tier = next((i for i, t in enumerate(_TIERS) if t in name), len(_TIERS))
    return (brand_of(name) != "Apple", -gen, tier, name)


def storage(text: str) -> str | None:
    """"12GB + 256GB" -> "256GB" (the last size is storage, the first RAM); "1 TB" -> "1TB"."""
    found = _STORAGE.findall(text or "")
    if not found:
        return None
    n, unit = found[-1]
    return f"{int(n)}{unit.upper()}"


def parse_title(title: str) -> tuple[str, str, bool] | None:
    """(model, rest, pre-order) for a phone listing, None for anything else."""
    m = _MODEL.match(title.replace("\xa0", " ").strip())
    if not m:
        return None
    rest = m.group("rest").strip(" -–")
    if ACCESSORY.search(rest):
        return None
    pre = bool(m.group("tag") and "pre" in m.group("tag").lower())
    return model_name(m.group("model")), rest, pre


# ---------------------------------------------------------------- Shopify

def shopify_variants(products: list[dict], host: str) -> list[dict]:
    """[{model, spec, color, price, was, available, url, pre}] for the phones in a catalog."""
    out = []
    for p in products:
        parsed = parse_title(p.get("title", ""))
        if not parsed:
            continue
        model, rest, pre = parsed
        names = [o["name"].strip().lower() for o in p.get("options", [])]
        s_idx = next((i for i, n in enumerate(names) if n in ("capacity", "storage", "storage capacity", "size", "memory")), None)
        c_idx = next((i for i, n in enumerate(names) if n in ("color", "colour")), None)
        for v in p.get("variants", []):
            price = float(v["price"])
            if price < MIN_PRICE:
                continue
            opts = [v.get(f"option{i + 1}") for i in range(3)]
            spec = storage(opts[s_idx]) if s_idx is not None else None
            spec = spec or storage(rest) or storage(v.get("title", ""))
            if not spec:
                continue
            if c_idx is not None:
                color = opts[c_idx]
            else:
                color = _STORAGE.sub("", rest).strip(" -–/") or None
            was = float(v["compare_at_price"]) if v.get("compare_at_price") else None
            out.append({
                "model": model, "spec": spec, "color": color, "price": price,
                "was": was if was and was > price else None,
                "available": bool(v.get("available")),
                "url": f"https://{host}/products/{p['handle']}?variant={v['id']}",
                "pre": pre,
            })
    return out


def fetch_shopify(host: str) -> list[dict]:
    products: list[dict] = []
    for page in range(1, 30):
        r = net.get(f"https://{host}/products.json", params={"limit": 250, "page": page})
        batch = r.json().get("products", [])
        if not batch:
            break
        products += batch
    return products


# ---------------------------------------------------------------- Apple

def apple_name(family: str) -> str | None:
    """"iphone18promax" -> "iPhone 18 Pro Max", "iphoneair" -> "iPhone Air"."""
    m = re.fullmatch(r"iphone(\d+e?|air|duo)(promax|pro|plus)?", family.lower())
    if not m:
        return None
    base = m.group(1)
    base = base.capitalize() if base in ("air", "duo") else base
    return f"iPhone {base}" + {"promax": " Pro Max", "pro": " Pro", "plus": " Plus", None: ""}[m.group(2)]


def apple_family_pages(html: str) -> list[str]:
    paths = sorted(set(re.findall(r"/ph/shop/buy-iphone/(iphone-[a-z0-9-]+)", html)))
    return [f"{APPLE_BASE}/ph/shop/buy-iphone/{p}" for p in paths]


def apple_variants(html: str, url: str) -> list[dict]:
    i = html.find("productSelectionData:")
    if i < 0:
        return []
    data, _ = json.JSONDecoder().raw_decode(html[i + len("productSelectionData:"):].lstrip())
    prices = data.get("displayValues", {}).get("prices", {})
    out = []
    for p in data.get("products", []):
        name = apple_name(p.get("familyType", ""))
        spec = storage(p.get("dimensionCapacity", ""))
        price = (prices.get(p.get("fullPrice")) or {}).get("amountBeforeTradeIn")
        if not name or not spec or not price:
            continue
        out.append({"model": name, "spec": spec, "color": p.get("dimensionColor"), "price": float(price),
                    "was": None, "available": None, "url": url, "pre": False})
    return out


def fetch_apple() -> list[dict]:
    index = net.get(STORES[0]["url"]).text
    out = []
    for url in apple_family_pages(index):
        out += apple_variants(net.get(url).text, url)
    return out


# ---------------------------------------------------------------- rows + history

def rows_for(store_id: str, variants: list[dict]) -> list[dict]:
    """Collapse colors: one row per model × storage at a store."""
    groups: dict[tuple, list[dict]] = {}
    for v in variants:
        groups.setdefault((v["model"], v["spec"]), []).append(v)
    rows = []
    for (model, spec), vs in groups.items():
        # Apple's page has no stock flags (available=None): treat as buyable.
        in_stock = [v for v in vs if v["available"] is not False]
        pool = in_stock or vs
        best = min(pool, key=lambda v: v["price"])
        colors = sorted({v["color"] for v in in_stock if v["color"]})
        has_flags = any(v["available"] is not None for v in vs)
        rows.append({
            "item": model, "key": model_key(model), "spec": spec, "brand": store_id,
            "cat": "gadgets", "unit": "pc", "price": best["price"], "was": best["was"],
            "stock": bool(in_stock) if has_flags else None,
            "colors": colors if has_flags and colors else None,
            "pre": True if any(v["pre"] for v in pool) else None,
            "url": best["url"],
        })
    return rows


def save(store_id: str, rows: list[dict], url: str, today: str) -> bool:
    """Write today's document unless nothing changed since the last one."""
    source = f"gadgets_{store_id}"
    earlier = [d for d in store.read_all(source) if d["doc"]["period_start"] < today]
    if not store.exists(source, today) and earlier and earlier[-1]["rows"] == store.normalize(rows):
        return False
    store.write(source, today, {"url": url, "status": "ok", "period_start": today, "period_end": today}, rows)
    return True


def ingest(force: bool = False) -> None:
    today = manila_today()
    checked = json.loads(CHECKED.read_text()) if CHECKED.exists() else {}
    failed = []
    for st in STORES:
        try:
            variants = (shopify_variants(fetch_shopify(st["shopify"]), st["shopify"]) if "shopify" in st
                        else fetch_apple())
            rows = rows_for(st["id"], variants)
        except Exception as e:
            print(f"gadgets: {st['name']} failed: {e!r}")
            failed.append(st["name"])
            continue
        if not rows:
            # A store that suddenly lists no phones has most likely changed its
            # site; keep the last prices instead of recording them all as gone.
            print(f"gadgets: {st['name']} listed no phones; keeping the last prices")
            failed.append(st["name"])
            continue
        changed = save(st["id"], rows, st["url"], today)
        checked[st["id"]] = today
        print(f"gadgets: {st['name']}: {len(rows)} model/storage prices{' (changed)' if changed else ''}")
    CHECKED.write_text(json.dumps(dict(sorted(checked.items())), indent=1) + "\n")
    if failed:
        raise RuntimeError(f"gadgets: no prices from {', '.join(failed)}")
