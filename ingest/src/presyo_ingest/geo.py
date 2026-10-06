"""Gazetteer: PSGC regions / provinces / cities / municipalities with centroids.

Names and hierarchy come from the PSGC mirror at psgc.gitlab.io; centroids are
computed from the 2023 PSGC boundary polygons in faeldon/philippines-json-maps
(MIT). The result is committed as data/areas.json, so this only re-runs when
the PSGC changes.
"""

import json
import re
import unicodedata

from shapely.geometry import shape

from . import net
from .paths import DATA

PSGC = "https://psgc.gitlab.io/api"
MAPS_TREE = "https://api.github.com/repos/faeldon/philippines-json-maps/git/trees/master?recursive=1"
MAPS_RAW = "https://raw.githubusercontent.com/faeldon/philippines-json-maps/master/"
NCR = "130000000"

AREAS_FILE = DATA / "areas.json"


def full_key(name: str) -> str:
    """Comparable place name that keeps "city" ("Cebu City" == "City of Cebu")."""
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\(.*?\)", " ", s)
    s = re.sub(r"\bsta\.?\s", "santa ", s)
    s = re.sub(r"\bsto\.?\s", "santo ", s)
    s = re.sub(r"\bgen\.?\s", "general ", s)
    s = re.sub(r"\bpres\.?\s", "president ", s)
    s = re.sub(r"\bcty\b", "city", s)
    s = re.sub(r"\bmunicipality of\b", " ", s)
    s = re.sub(r"[^a-z0-9]+", " ", s)
    s = " ".join(s.split())
    if s.startswith("city of "):
        s = s[len("city of "):] + " city"
    return s


def norm(name: str) -> str:
    """Looser key that also drops "city" ("Taguig" == "Taguig City")."""
    return re.sub(r"\s*\bcity\b\s*", " ", full_key(name)).strip()


def _centroids() -> tuple[dict[str, tuple[float, float]], dict[tuple[str, str], tuple[float, float]]]:
    """(10-digit PSGC -> (lat, lng), (region10, name key) -> (lat, lng))."""
    tree = net.get(MAPS_TREE).json()["tree"]
    files = [
        t["path"]
        for t in tree
        if t["path"].startswith("2023/geojson/provdists/lowres/") and t["type"] == "blob"
    ]
    by_code: dict[str, tuple[float, float]] = {}
    by_name: dict[tuple[str, str], tuple[float, float]] = {}
    for path in files:
        local = net.fetch_cached(MAPS_RAW + path, "maps/" + path.rsplit("/", 1)[1])
        # A few files are empty GeometryCollections (e.g. BARMM's SGA).
        for f in json.loads(local.read_text()).get("features", []):
            if not f.get("geometry"):
                continue
            c = shape(f["geometry"]).centroid
            props = f["properties"]
            ll = (round(c.y, 5), round(c.x, 5))
            by_code[str(props["adm3_psgc"]).zfill(10)] = ll
            by_name[(str(props["adm1_psgc"]).zfill(10), norm(props["adm3_en"]))] = ll
    return by_code, by_name


def build() -> list[dict]:
    regions = net.get(f"{PSGC}/regions/").json()
    provinces = net.get(f"{PSGC}/provinces/").json()
    districts = net.get(f"{PSGC}/districts/").json()
    lgus = net.get(f"{PSGC}/cities-municipalities/").json()
    by_code, by_name = _centroids()
    region10 = {r["code"]: r["psgc10DigitCode"] for r in regions}

    areas: list[dict] = []
    for r in regions:
        areas.append({"code": r["code"], "name": r["name"], "short": r["regionName"],
                      "level": "region", "region": r["code"]})
    for p in provinces:
        areas.append({"code": p["code"], "name": p["name"], "level": "province",
                      "region": p["regionCode"]})
    for d in districts:
        areas.append({"code": d["code"], "name": d["name"], "level": "district",
                      "region": d["regionCode"]})

    missing = []
    for m in lgus:
        # HUCs carry different codes in the 2023 boundary set; fall back to name.
        c = by_code.get(m["psgc10DigitCode"]) or by_name.get(
            (region10[m["regionCode"]], norm(m["name"]))
        )
        if c is None:
            missing.append(m["name"])
        areas.append({
            "code": m["code"],
            "name": m["name"],
            "level": "city" if m["isCity"] else "municipality",
            "region": m["regionCode"],
            # HUCs and NCR cities have no province.
            "province": m["provinceCode"] or None,
            "district": m["districtCode"] or None,
            "lat": c[0] if c else None,
            "lng": c[1] if c else None,
        })
    _fill_from_overrides(areas)
    missing = [a["name"] for a in areas if a["level"] in ("city", "municipality") and a["lat"] is None]
    if missing:
        print(f"geo: {len(missing)} LGUs without a centroid: {missing}")
    return areas


OVERRIDES_FILE = DATA / "geo-overrides.json"
NOMINATIM = "https://nominatim.openstreetmap.org/search"


def _fill_from_overrides(areas: list[dict]) -> None:
    """Centroids for LGUs absent from the boundary set (mostly HUCs).

    Geocoded once via OpenStreetMap Nominatim and committed, so builds never
    hit Nominatim again unless a new LGU appears.
    """
    import time

    overrides = json.loads(OVERRIDES_FILE.read_text()) if OVERRIDES_FILE.exists() else {}
    by_code = {a["code"]: a for a in areas}
    changed = False
    for a in areas:
        if a["level"] not in ("city", "municipality") or a["lat"] is not None:
            continue
        if a["code"] not in overrides:
            # Free-text search matches museums and roads; the structured
            # `city=` search restricted to settlements is reliable. "Zamboanga"
            # alone hits a barangay in Laoag, hence the "X City" retry.
            base = re.sub(r"^City of ", "", a["name"])
            hit = None
            for city in (base, f"{base} City"):
                r = net.get(NOMINATIM, params={
                    "city": city, "country": "Philippines", "featureType": "settlement",
                    "format": "jsonv2", "limit": 3})
                time.sleep(1.1)  # Nominatim usage policy: max 1 request/second
                hit = next((h for h in r.json()
                            if h["addresstype"] in ("city", "town", "municipality")), None)
                if hit:
                    break
            overrides[a["code"]] = (
                {"name": a["name"], "lat": round(float(hit["lat"]), 5),
                 "lng": round(float(hit["lon"]), 5), "source": "nominatim"}
                if hit else {"name": a["name"], "lat": None, "lng": None})
            changed = True
        a["lat"], a["lng"] = overrides[a["code"]]["lat"], overrides[a["code"]]["lng"]
    if changed:
        OVERRIDES_FILE.write_text(json.dumps(overrides, ensure_ascii=False, indent=1) + "\n")


def save(areas: list[dict]) -> None:
    DATA.mkdir(parents=True, exist_ok=True)
    AREAS_FILE.write_text(json.dumps(areas, ensure_ascii=False, indent=0) + "\n")


def load() -> list[dict]:
    return json.loads(AREAS_FILE.read_text())


class Gazetteer:
    """Name -> PSGC code lookups used by every parser."""

    def __init__(self, areas: list[dict] | None = None):
        self.areas = areas or load()
        self.by_code = {a["code"]: a for a in self.areas}
        self.lgus = [a for a in self.areas if a["level"] in ("city", "municipality")]
        self.provinces = [a for a in self.areas if a["level"] == "province"]

    def region_of(self, code: str) -> str:
        return self.by_code[code]["region"]

    def province(self, name: str, region: str | None = None) -> str | None:
        key = norm(name)
        hits = [p for p in self.provinces if norm(p["name"]) == key
                and (region is None or p["region"] == region)]
        return hits[0]["code"] if len(hits) == 1 else None

    def lgu(self, name: str, *, province: str | None = None,
            regions: set[str] | None = None) -> str | None:
        """Unique city/municipality matching `name` inside the given scope.

        Tries the exact key first ("Quezon City" must not collide with the
        towns named Quezon), then the looser one ("Taguig" -> City of Taguig).
        """
        for keyf in (full_key, norm):
            key = keyf(name)
            hits = [a for a in self.lgus if keyf(a["name"]) == key]
            if province:
                hits = [a for a in hits if a["province"] == province] or hits
            if regions:
                hits = [a for a in hits if a["region"] in regions]
            if len(hits) == 1:
                return hits[0]["code"]
        return None
