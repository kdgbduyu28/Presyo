from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
DATA = ROOT / "data"
PRICES = DATA / "prices"
CACHE = ROOT / "ingest" / ".cache"
APP_DATA = ROOT / "app" / "public" / "data"

# History before this date is out of scope (product decision, 2026-10-06).
HISTORY_START = "2026-01-01"
