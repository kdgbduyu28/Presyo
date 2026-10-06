from datetime import date

from presyo_ingest.catalog import key_for
from presyo_ingest.geo import full_key, norm
from presyo_ingest.sources.da import _date_from_name, _range, market_id
from presyo_ingest.sources.doe import period_from_text
from presyo_ingest.sources.power import _month


def test_doe_week_formats():
    y = 2026
    assert period_from_text("(For the week of September 29 - October 5, 2026)", y) == (date(2026, 9, 29), date(2026, 10, 5))
    assert period_from_text("NCR Price Monitoring 15-21 September 2026", y) == (date(2026, 9, 15), date(2026, 9, 21))
    assert period_from_text("Region IV-A CALABARZON 29 Sep to 5 Oct 2026", y) == (date(2026, 9, 29), date(2026, 10, 5))
    assert period_from_text("List of North Luzon Pump Prices 28 July-03 August 2026", y) == (date(2026, 7, 28), date(2026, 8, 3))
    assert period_from_text("MFO LFRO Price Monitoring September 1-7-2026", y) == (date(2026, 9, 1), date(2026, 9, 7))
    assert period_from_text("SEPT 29 - OCT 5 2026", y) == (date(2026, 9, 29), date(2026, 10, 5))
    assert period_from_text("NCR Price Monitoring 09222026", y) == (date(2026, 9, 22), date(2026, 9, 28))
    assert period_from_text("NEW VFO PRICE MONITORING 092926", y) == (date(2026, 9, 29), date(2026, 10, 5))
    assert period_from_text("Region V Bicol 8 TO 14", y) is None


def test_da_names_and_ranges():
    assert _date_from_name("Daily-Price-Index-October-5-2026.pdf") == date(2026, 10, 5)
    assert _date_from_name("Price-Monitoring-Sept-2-2026.pdf") == date(2026, 9, 2)
    assert _range("45.00") == (45.0, 45.0)
    assert _range("150.00 -160.00") == (150.0, 160.0)
    assert _range("NOT  AVAILABLE") is None
    assert market_id("Muñoz Market/Quezon City") == "munoz-market"
    assert market_id("Balintawak (Cloverleaf) Market") == "balintawak-market"


def test_place_keys():
    assert full_key("City of Cebu") == full_key("Cebu City") == "cebu city"
    assert norm("Taguig Cty") == norm("City of Taguig") == "taguig"
    assert full_key("Sta. Rosa") == "santa rosa"
    assert full_key("Pres. Manuel A. Roxas") == "president manuel a roxas"


def test_catalog_keys():
    assert key_for("rice", "Well Milled Rice", "1-19% bran streak") == "rice_well_milled"
    assert key_for("vegetables", "Sweet Potato (camote), Native") is None
    assert key_for("vegetables", "White Potato") == "potato"
    assert key_for("meat", "Egg, Chicken, Native, Medium") is None
    assert key_for("meat", "Chicken Egg (White, Medium)") == "egg_medium"
    assert key_for("meat", "Eggplant") is None


def test_power_months():
    assert _month("Sep-26") == "2026-09"
    assert _month("Trend") is None
