"""Categories, display names and cross-source keys for commodities.

Each source keeps its own item names (tidied for display). Categories come
from the source's own grouping (DA section headers, PSA tables). A `key` is
attached only to headline items people compare across sources, e.g. the
well-milled rice price at your palengke vs. your province's average.
"""

import re

CATEGORIES = ("rice", "fuel", "meat", "vegetables", "seafood", "fruits", "pantry", "other")

# (key, category, pattern on the lower-cased "<item> | <spec>" label)
KEYS: list[tuple[str, str, str]] = [
    ("rice_regular", "rice", r"regular[- ]milled"),
    ("rice_well_milled", "rice", r"well[- ]milled"),
    ("rice_premium", "rice", r"^premium"),
    ("rice_special", "rice", r"special"),
    ("pork_kasim", "meat", r"kasim"),
    ("pork_liempo", "meat", r"liempo"),
    ("chicken_whole", "meat", r"whole chicken|fully dressed|chicken.*whole"),
    ("egg_medium", "meat", r"^(?!.*(native|duck|quail)).*\begg\b.*\bmedium\b"),
    ("beef_brisket", "meat", r"beef.*brisket"),
    ("bangus", "seafood", r"bangus"),
    ("tilapia", "seafood", r"tilapia"),
    ("galunggong", "seafood", r"galunggong"),
    ("tomato", "vegetables", r"^tomato"),
    ("onion_red", "vegetables", r"red onion|onion red"),
    ("garlic", "vegetables", r"^garlic"),
    ("cabbage", "vegetables", r"^cabbage"),
    ("carrots", "vegetables", r"^carrot"),
    ("potato", "vegetables", r"^(?!.*(sweet|camote)).*potato"),
    ("eggplant", "vegetables", r"^eggplant"),
    ("ampalaya", "vegetables", r"ampalaya"),
    ("pechay", "vegetables", r"pechay"),
    ("banana_lakatan", "fruits", r"lakatan"),
    ("banana_saba", "fruits", r"saba|cardava"),
    ("mango", "fruits", r"mango.*(carabao|kalabaw)"),
    ("calamansi", "fruits", r"calamansi"),
    ("sugar_refined", "pantry", r"sugar.*refined"),
    ("sugar_washed", "pantry", r"sugar.*washed"),
    ("cooking_oil_palm_1l", "pantry", r"cooking oil \(palm\).*1 liter"),
    ("salt_iodized", "pantry", r"salt.*iodized"),
]


def key_for(category: str, item: str, spec: str = "") -> str | None:
    label = f"{item} | {spec}".lower()
    for key, cat, pat in KEYS:
        if cat == category and re.search(pat, label):
            return key
    return None


_SMALL = {"of", "and", "or", "with", "ng", "de", "del", "sa"}


def titlecase(s: str) -> str:
    words = s.lower().split()
    return " ".join(
        w if (i and w in _SMALL) else (w[0].upper() + w[1:] if w else w)
        for i, w in enumerate(words)
    )


def origin_of(label: str) -> str | None:
    low = label.lower()
    if "imported" in low:
        return "imported"
    if re.search(r"\blocal\b|\bnative\b", low):
        return "local"
    return None
