from datetime import date

from presyo_ingest.catalog import key_for
from presyo_ingest.geo import full_key, norm
from presyo_ingest.sources.da import _date_from_name, _range, market_id
from presyo_ingest.sources.doe import period_from_text
from presyo_ingest.sources.forex import parse_bulletin
from presyo_ingest.sources.meralco import links
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


def test_forex_bulletin():
    items = [
        {"Title": "UNITED STATES", "Unit": "DOLLAR*", "Symbol": "USD", "PHPequivalent": "62.7930", "Group": "1"},
        {"Title": "KUWAIT", "Unit": "DINAR", "Symbol": "KWD", "PHPequivalent": "N/A", "Group": "1"},
        {"Title": "PHILIPPINES", "Unit": "BSP Reference Rate:         PHP", "Symbol": "PHP", "PHPequivalent": "62.800", "Group": "3"},
        {"Title": "PHILIPPINES", "Unit": "PDS Closing Rate (09-Oct-2026): PHP", "Symbol": "PHP", "PHPequivalent": "62.801", "Group": "3"},
        {"Title": "PHILIPPINES", "Unit": "GOLD BUYING:      $", "Symbol": "USD", "PHPequivalent": "4,200.50", "Group": "3"},
    ]
    day, rows = parse_bulletin(items)
    assert day == "2026-10-09"
    got = {r["item"]: (r["price"], r["unit"]) for r in rows}
    assert got == {"USD": (62.793, "PHP"), "BSP_REF": (62.8, "PHP"), "GOLD_USD": (4200.5, "USD")}
    assert parse_bulletin(items[:1]) == (None, [])


def test_meralco_links():
    html = ('<a href="https://meralcomain.s3.ap-southeast-1.amazonaws.com/2026-08/08-2026_residential_bills.pdf">'
            '<a href="https://meralcomain.s3.ap-southeast-1.amazonaws.com/2026-08/08-2026_rate_schedule_0.pdf">'
            '<a href="https://meralcomain.s3.ap-southeast-1.amazonaws.com/2026-09/09-2026_residential_bills_0.pdf">')
    assert links(html) == {
        "2026-08": "https://meralcomain.s3.ap-southeast-1.amazonaws.com/2026-08/08-2026_residential_bills.pdf",
        "2026-09": "https://meralcomain.s3.ap-southeast-1.amazonaws.com/2026-09/09-2026_residential_bills_0.pdf",
    }
