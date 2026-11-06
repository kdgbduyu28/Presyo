"""Warn when a source stops producing new documents (format change, site move).

Reads the built app/public/data/meta.json and compares each source's latest
period with how often it normally publishes. In GitHub Actions the warnings
show as annotations on the run; locally they print as plain lines.
"""

import json
import os
from datetime import date

from .paths import APP_DATA

# Days a source may go without a new document before we warn. Monthly sources
# are dated by the month they cover, which they publish weeks later.
MAX_AGE: dict[str, int] = {
    "da_index": 5,            # daily on working days
    "da_market": 5,
    "psa": 100,               # monthly, about two months behind
    "doe_ncr": 14,            # weekly
    "doe_south_luzon": 14,
    "doe_visayas": 14,
    "doe_mindanao": 14,
    "doe_north_luzon": 90,    # scanned PDFs: often unreadable
    "doe_lpg": 60,            # monthly
    "doe_power": 75,
    "meralco_bills": 45,
    "dti_srp": 240,           # when DTI updates
    "bsp_forex": 6,           # trading days
    "gadgets": 3,             # checked twice a day, stored on change
    "doh_dpri": 400,          # yearly-ish
    "water_table": 120,       # hand-checked each quarter
    "fares_table": 120,
}


def _as_date(period: str) -> date:
    """"2026-10-05" or "2026-10" (start of month)."""
    return date.fromisoformat(period if len(period) == 10 else f"{period[:7]}-01")


def stale(sources: dict[str, dict], today: date) -> list[tuple[str, str, int, int]]:
    """(source, latest, days old, limit) for every source past its limit."""
    out = []
    for name, info in sorted(sources.items()):
        limit = MAX_AGE.get(name)
        latest = info.get("latest")
        if limit is None or not latest:
            continue
        age = (today - _as_date(latest)).days
        if age > limit:
            out.append((name, latest, age, limit))
    return out


def check(today: date | None = None) -> int:
    meta = json.loads((APP_DATA / "meta.json").read_text())
    found = stale(meta.get("sources", {}), today or date.today())
    gha = os.environ.get("GITHUB_ACTIONS") == "true"
    for name, latest, age, limit in found:
        msg = f"{name}: latest document is {latest} ({age} days old; expected within {limit})"
        print(f"::warning title=Stale source::{msg}" if gha else f"stale  {msg}")
    if not found:
        print("All sources are current.")
    return len(found)
