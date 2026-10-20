"""Gadget prices — phones, tablets, Macs, watches, AirPods, consoles and new
games at official stores and big PH resellers, plus Apple's prices abroad.

Unlike the government sources there is no report to download: each run reads
the stores' current prices and records a new document only when something
changed, so the history is a list of price changes (and the day each store
was last checked is kept in data/gadgets-checked.json).

Stores:
- Apple Store PH: every iPhone / iPad page under /ph/shop/buy-iphone and
  /ph/shop/buy-ipad embeds `PRODUCT_SELECTION_BOOTSTRAP` (one product per part
  number with its color, capacity, screen size and connection; prices under
  displayValues.prices keyed by `fullPrice`). The same pages exist in other
  countries' stores (us, jp, sg, hk, ae, sa-en), which gives "price abroad".
- Samsung PH: the site's product finder API (searchapi.samsung.com) lists
  every phone with each color × RAM/storage, its price, sale price and stock.
- Power Mac Center, Beyond the Box, iStore (Apple resellers), Digital Walker
  and Datablitz (games) run Shopify, whose open `/products.json` lists the
  catalog with variant price, compare-at price and availability. Power Mac
  Center lists one product per variant ("iPhone 17 Pro Max 256GB Silver");
  the others use Color/Capacity options. Datablitz's catalog is huge, so only
  its console collections and the newest games are read.

One row per model × variant × store: the lowest price among in-stock colors
(any color when none is in stock), the colors in stock and a link.
"""

import json
import re
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from .. import net, store
from ..paths import DATA

CATEGORIES = [("phones", "Phones"), ("tablets", "Tablets"), ("laptops", "Macs"), ("watches", "Watches"),
              ("audio", "AirPods"), ("consoles", "Consoles"), ("games", "New games")]

# `slot` = the store's fixed chart color (theme s1..s8), so a store keeps its
# color everywhere; stores that share models get adjacent validated slots.
STORES: list[dict] = [
    {"id": "apple", "name": "Apple Store", "url": "https://www.apple.com/ph/shop/buy-iphone", "official": True,
     "kind": "apple", "slot": 1},
    {"id": "powermac", "name": "Power Mac Center", "url": "https://powermaccenter.com", "kind": "shopify",
     "host": "powermaccenter.com", "slot": 2},
    {"id": "beyondthebox", "name": "Beyond the Box", "url": "https://www.beyondthebox.ph", "kind": "shopify",
     "host": "www.beyondthebox.ph", "slot": 3},
    {"id": "istore", "name": "iStore", "url": "https://istore.ph", "kind": "shopify", "host": "istore.ph", "slot": 4},
    {"id": "digitalwalker", "name": "Digital Walker", "url": "https://digitalwalker.ph", "kind": "shopify",
     "host": "digitalwalker.ph", "slot": 5},
    {"id": "samsung", "name": "Samsung Store", "url": "https://www.samsung.com/ph/smartphones/all-smartphones/",
     "official": True, "kind": "samsung", "slot": 6},
    {"id": "datablitz", "name": "Datablitz", "url": "https://www.datablitz.com.ph", "kind": "datablitz",
     "host": "www.datablitz.com.ph", "slot": 7},
]
CHECKED = DATA / "gadgets-checked.json"
APPLE_BASE = "https://www.apple.com"

# Apple stores abroad for "price abroad" (BSP has a reference rate for each).
ABROAD = [
    {"cc": "US", "name": "United States", "path": "", "cur": "USD", "note": "before sales tax; US iPhones are eSIM-only"},
    {"cc": "JP", "name": "Japan", "path": "/jp", "cur": "JPY", "note": "incl. 10% tax (tourists can shop tax-free); camera shutter sound can't be turned off"},
    {"cc": "SG", "name": "Singapore", "path": "/sg", "cur": "SGD", "note": "incl. 9% GST"},
    {"cc": "HK", "name": "Hong Kong", "path": "/hk", "cur": "HKD", "note": "no sales tax"},
    {"cc": "AE", "name": "UAE", "path": "/ae", "cur": "AED", "note": "incl. 5% VAT"},
    {"cc": "SA", "name": "Saudi Arabia", "path": "/sa-en", "cur": "SAR", "note": "incl. 15% VAT"},
]

ACCESSORY = re.compile(
    r"case|wallet|bumper|battery|voucher|cover|glass|protector|charger|cable|strap|\bband\b|skin|folio|keyboard"
    r"|pencil|adapter|stand|mount|sleeve|film|dock|grip|bag|applecare|warranty|trade.?in|downpayment|gift card",
    re.I)
MIN_PRICE = {"phones": 5000, "tablets": 10000, "laptops": 20000, "watches": 8000, "audio": 4000,
             "consoles": 8000, "games": 900}
_STORAGE = re.compile(r"(\d+(?:\.\d+)?)\s*(GB|TB)\b", re.I)


def manila_today() -> str:
    return datetime.now(ZoneInfo("Asia/Manila")).date().isoformat()


def model_key(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower().replace("+", " plus")).strip("-")


def storage(text: str) -> str | None:
    """"12GB + 256GB" -> "256GB" (the last size is storage, the first RAM); "1 TB" -> "1TB"."""
    found = _STORAGE.findall(text or "")
    if not found:
        return None
    n, unit = found[-1]
    return f"{int(float(n))}{unit.upper()}"


def _gb(size: str) -> int:
    n, unit = _STORAGE.match(size).groups()
    return int(float(n)) * (1024 if unit.upper() == "TB" else 1)


def _clean(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").replace("\xa0", " ").replace("‑", "-").replace("‐", "-")).strip()


# ---------------------------------------------------------------- phones

_PHONE = re.compile(
    r"^(?:\[(?P<tag>[^\]]*)\]\s*)?"
    r"(?P<model>iPhone\s+(?:\d{2}e?|Air|Duo)(?:\s+Pro\s+Max|\s+Pro|\s+Plus)?"
    r"|Galaxy\s+(?:S\d{2}(?:\s+Ultra|\s+FE|\s+Edge|\+)?|Z\s*(?:Fold|Flip)\s*\d+(?:\s+Ultra|\s+FE)?"
    r"|A\d{2}[es]?(?:\s+5G|\s+LTE)?))"
    r"(?=\s|$)(?P<rest>.*)$",
    re.I,
)


def model_name(raw: str) -> str:
    """Canonical spelling: "iphone 17 pro max" -> "iPhone 17 Pro Max", "Galaxy Z Fold 6" -> "Galaxy Z Fold6"."""
    out = []
    for w in raw.split():
        lw = w.lower()
        if lw == "iphone":
            out.append("iPhone")
        elif re.fullmatch(r"\d+e", lw):
            out.append(lw)
        elif re.fullmatch(r"[sa]\d+[es]?\+?", lw):
            out.append(lw[0].upper() + lw[1:])
        elif lw in ("fe", "5g", "lte"):
            out.append(lw.upper())
        else:
            out.append(w[:1].upper() + w[1:].lower())
    name = " ".join(out)
    return re.sub(r"\b(Fold|Flip) (\d+)", r"\1\2", re.sub(r"\bZ(Fold|Flip)", r"Z \1", name))


def parse_title(title: str) -> tuple[str, str, bool] | None:
    """(model, rest, pre-order) for a phone listing, None for anything else."""
    m = _PHONE.match(_clean(title))
    if not m:
        return None
    rest = m.group("rest").strip(" -–")
    if ACCESSORY.search(rest):
        return None
    pre = bool(m.group("tag") and "pre" in m.group("tag").lower())
    return model_name(m.group("model")), rest, pre


def make_of(name: str) -> str:
    for prefix, make in (("iPhone", "Apple"), ("iPad", "Apple"), ("Mac", "Apple"), ("iMac", "Apple"),
                         ("Apple", "Apple"), ("AirPods", "Apple"), ("Galaxy", "Samsung"),
                         ("PlayStation", "Sony"), ("Nintendo", "Nintendo"), ("Xbox", "Microsoft"),
                         ("ROG", "Microsoft"), ("Steam", "Valve"), ("Meta", "Meta"), ("Lenovo", "Lenovo"),
                         ("MSI", "MSI")):
        if name.startswith(prefix):
            return make
    return "Other"


brand_of = make_of  # older name, used by build

_TIERS = ["Pro Max", "Ultra", "Pro", "Fold", "Duo", "Air", "Flip", "Plus", "+", "Edge"]


def sort_key(name: str) -> tuple:
    """Phones: newest generation first, then Pro Max > Pro > Duo > Air > Plus > base > e / FE."""
    m = re.search(r"(\d+)", name)
    gen = int(m.group(1)) if m else {"iPhone Air": 17, "iPhone Duo": 18}.get(name, 0)
    if re.search(r"\d+e$|\bFE$", name):
        tier = len(_TIERS) + 1
    else:
        tier = next((i for i, t in enumerate(_TIERS) if t in name), len(_TIERS))
    # Galaxy lines: Z (foldables) and S flagships before the A series
    line = 0 if " Z " in f" {name} " else 2 if re.match(r"Galaxy A", name) else 1
    return (make_of(name) != "Apple", line, -gen, tier, name)


# ---------------------------------------------------------------- tablets, Macs, watches, AirPods

_CHIP = re.compile(r"\b(M\d(?:\s+(?:Pro|Max|Ultra))?|A\d{2}(?:\s+Pro)?)\b")


def _chip(text: str) -> str | None:
    m = _CHIP.search(text)
    if m:
        return m.group(1)
    g = re.search(r"\b(\d+)(?:st|nd|rd|th)\s+gen", text, re.I)
    return f"{g.group(1)}th gen" if g else None


def _size(text: str) -> str | None:
    m = re.search(r"\b(\d{2}(?:\.\d)?)\s*(?:-?\s*inch|\"|”|in\b)", text, re.I)
    return m.group(1) if m else None


def tablet(text: str) -> tuple[str, str] | None:
    """("iPad Pro 11-inch (M5)", rest) from a listing title, or None."""
    m = re.search(r"\biPad(?:\s+(Pro|Air|mini))?\b", text, re.I)
    if not m:
        return None
    family = (m.group(1) or "").lower()
    family = {"pro": "Pro", "air": "Air", "mini": "mini"}.get(family, "")
    chip, size = _chip(text), _size(text)
    if family in ("Pro", "Air") and size:
        name = f"iPad {family} {size}-inch"
    else:
        name = f"iPad {family}".strip()
    return (f"{name} ({chip})" if chip else name), text


def mac(text: str) -> tuple[str, str] | None:
    m = re.search(r"\b(MacBook\s+(?:Air|Pro|Neo)|Macbook\s*Pro|iMac|Mac\s+mini|Mac\s+Studio)\b", text, re.I)
    if not m:
        return None
    family = re.sub(r"(?i)macbook\s*", "MacBook ", m.group(1))
    family = {"imac": "iMac", "mac mini": "Mac mini", "mac studio": "Mac Studio"}.get(family.lower(), family.title()
                                                                                  .replace("Macbook", "MacBook"))
    chip, size = _chip(text), _size(text)
    name = f"{family} {size}-inch" if size and family.startswith(("MacBook", "iMac")) else family
    return (f"{name} ({chip})" if chip else name), text


def watch(text: str) -> tuple[str, str] | None:
    m = re.search(r"\bApple Watch\s+(Series\s+\d+|SE(?:\s+\d)?|Ultra(?:\s+\d)?)", text, re.I)
    if not m or re.search(r"herm", text, re.I):
        return None
    kind = " ".join("SE" if w.lower() == "se" else w.capitalize() for w in m.group(1).split())
    return f"Apple Watch {kind}", text


def airpods(text: str) -> tuple[str, str] | None:
    m = re.search(r"\bAirPods(?:\s+(Pro|Max))?(?:\s*\((\d)(?:st|nd|rd|th) gen\w*\)|\s+(\d))?", text, re.I)
    if not m:
        return None
    family = f"AirPods {m.group(1).title()}" if m.group(1) else "AirPods"
    gen = m.group(2) or m.group(3)
    name = f"{family} {gen}" if gen else family
    if re.search(r"active noise|\bANC\b", text, re.I):
        name += " with ANC"
    return name, text


def variant_spec(cat: str, text: str) -> str | None:
    """The part of a listing that changes the price within a model."""
    t = _clean(text)
    if cat == "phones":
        return storage(t)
    sizes = [s for s in (f"{int(float(n))}{u.upper()}" for n, u in _STORAGE.findall(t))]
    cell = bool(re.search(r"cellular|\bcell\b|wificell", t, re.I))
    if cat == "tablets":
        st = storage(t)
        return f"{st} {'Wi-Fi + Cellular' if cell else 'Wi-Fi'}" if st else None
    if cat == "laptops":
        # Stores describe Mac configs differently (GPU cores, memory or both),
        # so models compare by SSD; mac_detail() keeps the rest as a note.
        big = [s for s in sizes if _gb(s) >= 256]
        return f"{big[-1]} SSD" if big else None
    if cat == "watches":
        mm = re.search(r"(\d{2})\s*mm", t, re.I)
        if not mm:
            return None
        spec = f"{mm.group(1)}mm {'GPS + Cellular' if cell else 'GPS'}"
        return spec + (" Titanium" if re.search(r"titanium", t, re.I) and "Ultra" not in t else "")
    if cat == "audio":
        return "Standard"
    return None


def mac_detail(text: str) -> str | None:
    """"... 10-core GPU, 16GB unified memory, 512GB SSD" -> "16GB · 10-core GPU"."""
    t = _clean(text)
    ram = [f"{int(float(n))}GB" for n, u in _STORAGE.findall(t) if u.upper() == "GB" and float(n) <= 128]
    gpu = re.search(r"(\d+)-core GPU", t, re.I)
    parts = ram[:1] + ([f"{gpu.group(1)}-core GPU"] if gpu else [])
    return " · ".join(parts) or None


# ---------------------------------------------------------------- consoles and games (Datablitz)

CONSOLES: list[tuple[str, str]] = [
    (r"PlayStation Portal", "PlayStation Portal"),
    (r"PS5 Pro", "PlayStation 5 Pro"),
    (r"PS5.*Slim|Slim.*PS5", "PlayStation 5 Slim"),
    (r"\bPS5\b.*Console", "PlayStation 5"),
    (r"Switch 2 Console", "Nintendo Switch 2"),
    (r"Switch.*OLED", "Nintendo Switch OLED"),
    (r"Switch Lite", "Nintendo Switch Lite"),
    (r"Xbox Series X", "Xbox Series X"),
    (r"Xbox Series S", "Xbox Series S"),
    (r"ROG (?:Xbox )?Ally X\b", "ROG Xbox Ally X"),
    (r"ROG (?:Xbox )?Ally", "ROG Xbox Ally"),
    (r"Steam Deck OLED", "Steam Deck OLED"),
    (r"Steam Machine", "Steam Machine"),
    (r"Legion Go", "Lenovo Legion Go"),
    (r"MSI.*Claw", "MSI Claw"),
    (r"Meta Quest 3S", "Meta Quest 3S"),
    (r"Meta Quest 3\b", "Meta Quest 3"),
]


def console(title: str, option: str = "") -> tuple[str, str] | None:
    t = _clean(title)
    for pat, name in CONSOLES:
        if re.search(pat, t, re.I):
            parts = []
            if re.search(r"digital", t, re.I):
                parts.append("Digital")
            elif name.startswith(("PlayStation 5", "Xbox Series X")):
                parts.append("Disc")
            st = storage(option) or (storage(t) if name.startswith(("Steam", "Meta", "ROG", "MSI", "Lenovo")) else None)
            if st:
                parts.append(st)
            if re.search(r"mario kart", t, re.I):
                parts.append("Mario Kart World bundle")
            elif re.search(r"bundle|limited edition|anniversary|edition\)", t, re.I) and "Digital Edition" not in t:
                parts.append("bundle")
            return name, " · ".join(parts) or "Standard"
    return None


_REGION = re.compile(r"\s*\((?:asian|us|eu|eng[^)]*|sea|mde|jpn|jp|reg\.?\s*\d|chinese[^)]*|kor[^)]*|[a-z]{2,3}/[^)]*)\)",
                     re.I)


def game(title: str) -> tuple[str, str] | None:
    """("Ghost of Yotei", "PS5 · Asian") for a new-game listing."""
    t = _clean(title)
    m = re.match(r"^(PS5|Nintendo Switch 2|NSW2|Xbox Series X)\s+(.+)$", t, re.I)
    if not m or re.search(r"pre-?order|downpayment|amiibo|controller|joy-?con|case\b|bundle", t, re.I):
        return None
    platform = {"ps5": "PS5", "nintendo switch 2": "Switch 2", "nsw2": "Switch 2"}.get(m.group(1).lower(), "Xbox")
    regions = [r.strip(" ()") for r in _REGION.findall(m.group(2))]
    name = _REGION.sub("", m.group(2)).strip(" -")
    return name, " · ".join([platform] + regions[:1])


# ---------------------------------------------------------------- classification

def classify(title: str, product_type: str = "") -> tuple[str, str, bool] | None:
    """(category, model, pre-order) for a store listing, None for anything we don't track."""
    t = _clean(title)
    pre = bool(re.match(r"\[[^\]]*pre", t, re.I))
    phone = parse_title(t)
    if phone:
        return "phones", phone[0], phone[2]
    if ACCESSORY.search(re.sub(r"(?i)with (active noise cancellation|magsafe|wireless) charging case|"
                               r"(?:magsafe|charging) case|sport band|sport loop|alpine loop|ocean band|trail loop|"
                               r"milanese loop|(?:with|,)\s+magic keyboard|link bracelet|(?:alumini?um|titanium|stainless steel)\s+case|\bcase\b(?= with)", "", t)):
        return None
    for cat, fn in (("tablets", tablet), ("laptops", mac), ("watches", watch), ("audio", airpods)):
        hit = fn(t)
        if hit:
            return cat, hit[0], pre
    return None


# ---------------------------------------------------------------- Shopify

def shopify_variants(products: list[dict], host: str) -> list[dict]:
    """[{cat, model, spec, color, price, was, available, url, pre}] for the tracked items in a catalog."""
    out = []
    for p in products:
        title = _clean(p.get("title", ""))
        hit = classify(title, p.get("product_type", ""))
        if not hit:
            continue
        cat, model, pre = hit
        names = [o["name"].strip().lower() for o in p.get("options", [])]
        c_idx = next((i for i, n in enumerate(names) if "color" in n or "colour" in n or n == "case"), None)
        for v in p.get("variants", []):
            price = float(v["price"])
            if price < MIN_PRICE[cat]:
                continue
            opts = [v.get(f"option{i + 1}") or "" for i in range(3)]
            others = " ".join(o for i, o in enumerate(opts) if i != c_idx and o != "Default Title")
            if cat == "phones":
                rest = parse_title(title)[1]
                spec = variant_spec(cat, others) or variant_spec(cat, rest) or variant_spec(cat, v.get("title", ""))
            else:
                spec = variant_spec(cat, f"{title} {others}")
            if not spec:
                continue
            if c_idx is not None:
                color = opts[c_idx] or None
            else:
                tail = re.split(r"\s[-–]\s", title)
                color = tail[-1].strip() if len(tail) > 1 and not _STORAGE.search(tail[-1]) else None
                if cat == "phones" and not color:
                    color = _STORAGE.sub("", parse_title(title)[1]).strip(" -–/") or None
            was = float(v["compare_at_price"]) if v.get("compare_at_price") else None
            out.append({
                "cat": cat, "model": model, "spec": spec, "color": color, "price": price,
                "was": was if was and was > price else None,
                "available": bool(v.get("available")),
                "url": f"https://{host}/products/{p['handle']}?variant={v['id']}",
                "pre": pre,
                "note": mac_detail(f"{title} {others}") if cat == "laptops" else None,
            })
    return out


def fetch_shopify(host: str, path: str = "products.json", pages: int = 30) -> list[dict]:
    products: list[dict] = []
    for page in range(1, pages + 1):
        r = net.get(f"https://{host}/{path}", params={"limit": 250, "page": page})
        batch = r.json().get("products", [])
        if not batch:
            break
        products += batch
    return products


DATABLITZ_CONSOLES = ["playstation-5-consoles", "nintendo-switch-2-consoles", "featured-gaming-consoles",
                      "handheld-consoles"]
DATABLITZ_GAMES = ["ps5-games", "category-nintendo-switch-games"]
NEW_GAME_DAYS = 120


def datablitz_variants(consoles: list[dict], games: list[dict], host: str, today: str) -> list[dict]:
    out, seen = [], set()
    since = (date.fromisoformat(today) - timedelta(days=NEW_GAME_DAYS)).isoformat()
    for cat, products in (("consoles", consoles), ("games", games)):
        for p in products:
            if p["id"] in seen:
                continue
            seen.add(p["id"])
            for v in p.get("variants", []):
                opt = " ".join(v.get(f"option{i + 1}") or "" for i in range(3)).replace("Default Title", "")
                if cat == "consoles":
                    hit = console(p["title"], opt)
                else:
                    if (p.get("published_at") or "")[:10] < since:
                        continue
                    hit = game(p["title"])
                price = float(v["price"])
                if not hit or price < MIN_PRICE[cat]:
                    continue
                was = float(v["compare_at_price"]) if v.get("compare_at_price") else None
                out.append({"cat": cat, "model": hit[0], "spec": hit[1], "color": None, "price": price,
                            "was": was if was and was > price else None, "available": bool(v.get("available")),
                            "url": f"https://{host}/products/{p['handle']}?variant={v['id']}", "pre": False})
    return out


def fetch_datablitz(host: str, today: str) -> list[dict]:
    consoles = [p for c in DATABLITZ_CONSOLES for p in fetch_shopify(host, f"collections/{c}/products.json", 2)]
    games = [p for c in DATABLITZ_GAMES for p in fetch_shopify(host, f"collections/{c}/products.json", 2)]
    return datablitz_variants(consoles, games, host, today)


# ---------------------------------------------------------------- Samsung

SAMSUNG_API = "https://searchapi.samsung.com/v6/front/b2c/product/finder/newhybris"


def samsung_variants(products: list[dict]) -> list[dict]:
    out = []
    for p in products:
        fam = _clean(p.get("fmyMarketingName", ""))
        if re.search(r"bundle|pack\b|special edition|student edition|bespoke", fam, re.I):
            continue
        fam = re.sub(r"\s*\((?:Samsung\.com only|Online Exclusive)\)", "", fam)
        hit = parse_title(fam)
        if not hit or hit[1]:
            continue
        for m in p.get("modelList", []):
            price = m.get("promotionPrice") or m.get("price")
            if not price:
                continue  # listed but not sold online
            chips = [c.get("fmyChipName") or "" for c in m.get("fmyChipList") or []]
            spec = next((storage(c) for c in chips if storage(c)), None) or storage(m.get("pdpUrl", ""))
            color = next((c for c in chips if c and not storage(c)), None)
            if not spec:
                continue
            full = float(m.get("price") or price)
            out.append({"cat": "phones", "model": hit[0], "spec": spec, "color": color, "price": float(price),
                        "was": full if full > float(price) else None,
                        "available": m.get("stockStatusText") == "inStock",
                        "url": "https://www.samsung.com" + (m.get("pdpUrl") or "/ph/smartphones/"), "pre": False})
    return out


def fetch_samsung() -> list[dict]:
    products: list[dict] = []
    for start in range(1, 1000, 100):
        r = net.get(SAMSUNG_API, params={"type": "01010000", "siteCode": "ph", "start": start, "num": 100,
                                         "sort": "newest", "onlyFilterInfoYN": "N", "keySummaryYN": "N"})
        batch = r.json()["response"]["resultData"]["productList"]
        products += batch
        if len(batch) < 100:
            break
    return samsung_variants(products)


# ---------------------------------------------------------------- Apple

def apple_name(family: str) -> str | None:
    """"iphone18promax" -> "iPhone 18 Pro Max", "iphoneair" -> "iPhone Air"."""
    m = re.fullmatch(r"iphone(\d+e?|air|duo)(promax|pro|plus)?", family.lower())
    if not m:
        return None
    base = m.group(1)
    base = base.capitalize() if base in ("air", "duo") else base
    return f"iPhone {base}" + {"promax": " Pro Max", "pro": " Pro", "plus": " Plus", None: ""}[m.group(2)]


def apple_ipad_name(family: str) -> str | None:
    """"ipadpro11_m5_2025" -> "iPad Pro 11-inch (M5)", "ipadmini_a17pro_2024" -> "iPad mini (A17 Pro)"."""
    m = re.fullmatch(r"ipad(pro|air|mini)?(\d+)?_?([am]\d+(?:pro)?)(?:_\d{4})?", family.lower())
    if not m:
        return None
    kind = {"pro": "Pro", "air": "Air", "mini": "mini", None: ""}[m.group(1)]
    chip = m.group(3).upper().replace("PRO", " Pro")
    name = f"iPad {kind}".strip() + (f" {m.group(2)}-inch" if m.group(2) else "")
    return f"{name} ({chip})"


def apple_family_pages(html: str, section: str = "buy-iphone", base: str = "/ph") -> list[str]:
    slug = "iphone" if section == "buy-iphone" else "ipad"
    paths = sorted(set(re.findall(rf"{base}/shop/{section}/({slug}[a-z0-9-]*)", html)))
    return [f"{APPLE_BASE}{base}/shop/{section}/{p}" for p in paths]


def apple_variants(html: str, url: str) -> list[dict]:
    i = html.find("productSelectionData:")
    if i < 0:
        return []
    data, _ = json.JSONDecoder().raw_decode(html[i + len("productSelectionData:"):].lstrip())
    prices = data.get("displayValues", {}).get("prices", {})
    out = []
    for p in data.get("products", []):
        if p.get("isCarrierDevice"):
            continue  # US carrier-locked models
        fam = p.get("familyType", "")
        if fam.startswith("iphone"):
            cat, name, spec = "phones", apple_name(fam), storage(p.get("dimensionCapacity", ""))
        else:
            st = storage(p.get("dimensionCapacity", ""))
            cat, name = "tablets", apple_ipad_name(fam)
            spec = f"{st} {'Wi-Fi + Cellular' if 'cell' in (p.get('dimensionConnection') or '') else 'Wi-Fi'}" if st else None
        pr = prices.get(p.get("fullPrice")) or {}
        price = pr.get("amountBeforeTradeIn")
        if not name or not spec or not price:
            continue
        out.append({"cat": cat, "model": name, "spec": spec, "color": p.get("dimensionColor"), "price": float(price),
                    "was": None, "available": None, "url": url, "pre": False, "cur": pr.get("priceCurrency")})
    return out


def fetch_apple(base: str = "/ph") -> list[dict]:
    out = []
    for section in ("buy-iphone", "buy-ipad"):
        try:
            index = net.get(f"{APPLE_BASE}{base}/shop/{section}").text
        except Exception:
            continue
        for url in apple_family_pages(index, section, base):
            try:
                out += apple_variants(net.get(url).text, url)
            except Exception as e:  # one discontinued page must not drop the rest
                print(f"gadgets: {url}: {e!r}")
    return out


# ---------------------------------------------------------------- rows + history

def rows_for(store_id: str, variants: list[dict]) -> list[dict]:
    """Collapse colors: one row per model × variant at a store."""
    groups: dict[tuple, list[dict]] = {}
    for v in variants:
        groups.setdefault((v.get("cat", "phones"), v["model"], v["spec"]), []).append(v)
    rows = []
    for (cat, model, spec), vs in groups.items():
        # Apple's page has no stock flags (available=None): treat as buyable.
        in_stock = [v for v in vs if v["available"] is not False]
        pool = in_stock or vs
        best = min(pool, key=lambda v: v["price"])
        colors = sorted({v["color"] for v in in_stock if v["color"]})
        has_flags = any(v["available"] is not None for v in vs)
        rows.append({
            "item": model, "key": model_key(model), "spec": spec, "brand": store_id,
            "cat": cat, "unit": "pc", "price": best["price"], "was": best["was"],
            "stock": bool(in_stock) if has_flags else None,
            "colors": colors if has_flags and colors else None,
            "pre": True if any(v["pre"] for v in pool) else None,
            "url": best["url"],
            "cur": best.get("cur") if best.get("cur") not in (None, "PHP") else None,
            "note": best.get("note"),
        })
    return rows


def save(source: str, rows: list[dict], url: str, today: str) -> bool:
    """Write today's document unless nothing changed since the last one."""
    earlier = [d for d in store.read_all(source) if d["doc"]["period_start"] < today]
    if not store.exists(source, today) and earlier and earlier[-1]["rows"] == store.normalize(rows):
        return False
    store.write(source, today, {"url": url, "status": "ok", "period_start": today, "period_end": today}, rows)
    return True


def fetch_store(st: dict, today: str) -> list[dict]:
    if st["kind"] == "apple":
        return fetch_apple()
    if st["kind"] == "samsung":
        return fetch_samsung()
    if st["kind"] == "datablitz":
        return fetch_datablitz(st["host"], today)
    return shopify_variants(fetch_shopify(st["host"]), st["host"])


def ingest(force: bool = False) -> None:
    today = manila_today()
    checked = json.loads(CHECKED.read_text()) if CHECKED.exists() else {}
    failed = []
    for st in STORES:
        try:
            rows = rows_for(st["id"], fetch_store(st, today))
        except Exception as e:
            print(f"gadgets: {st['name']} failed: {e!r}")
            failed.append(st["name"])
            continue
        if not rows:
            # A store that suddenly lists nothing has most likely changed its
            # site; keep the last prices instead of recording them all as gone.
            print(f"gadgets: {st['name']} listed nothing we track; keeping the last prices")
            failed.append(st["name"])
            continue
        changed = save(f"gadgets_{st['id']}", rows, st["url"], today)
        checked[st["id"]] = today
        print(f"gadgets: {st['name']}: {len(rows)} prices{' (changed)' if changed else ''}")

    # Apple's prices abroad (iPhone + iPad), in local currency
    for c in ABROAD:
        try:
            rows = rows_for(f"abroad_{c['cc'].lower()}", fetch_apple(c["path"]))
        except Exception as e:
            print(f"gadgets: Apple {c['name']} failed: {e!r}")
            continue
        if rows:
            for r in rows:
                r["cur"] = r.get("cur") or c["cur"]
            save(f"gadgets_abroad_{c['cc'].lower()}", rows, f"{APPLE_BASE}{c['path']}/shop/buy-iphone", today)
            checked[f"abroad_{c['cc'].lower()}"] = today
            print(f"gadgets: Apple {c['name']}: {len(rows)} prices")

    CHECKED.write_text(json.dumps(dict(sorted(checked.items())), indent=1) + "\n")
    if failed:
        raise RuntimeError(f"gadgets: no prices from {', '.join(failed)}")
