from datetime import date

from presyo_ingest.health import stale


def test_stale_flags_only_sources_past_their_limit():
    today = date(2026, 11, 6)
    sources = {
        "da_index": {"latest": "2026-11-05"},       # 1 day: fine
        "doe_ncr": {"latest": "2026-10-13"},        # 24 days > 14
        "psa": {"latest": "2026-09"},               # from Sep 1: 66 days, fine
        "doe_power": {"latest": "2026-07"},         # from Jul 1: 128 days > 75
        "unknown_source": {"latest": "2020-01-01"}, # no limit: ignored
        "gadgets": {},                              # no date: ignored
    }
    assert stale(sources, today) == [
        ("doe_ncr", "2026-10-13", 24, 14),
        ("doe_power", "2026-07", 128, 75),
    ]
