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


def test_gadget_titles():
    from presyo_ingest.sources.gadgets import apple_name, model_key, parse_title, sort_key, storage

    assert parse_title("iPhone 17 Pro Max 256GB Silver") == ("iPhone 17 Pro Max", "256GB Silver", False)
    assert parse_title("[PRE-ORDER] iPhone Duo") == ("iPhone Duo", "", True)
    assert parse_title("iPhone\xa016 Silicone Case with MagSafe") is None
    assert parse_title("iPhone Air MagSafe Battery") is None
    assert parse_title("iPhone 17e") == ("iPhone 17e", "", False)
    assert parse_title("Galaxy S24+") == ("Galaxy S24+", "", False)
    assert parse_title("Galaxy Z Fold 6") == ("Galaxy Z Fold6", "", False)
    assert parse_title("Galaxy Watch6 Classic") is None
    assert storage("12GB + 256GB") == "256GB" and storage("1 tb") == "1TB" and storage("Black") is None
    assert apple_name("iphone18promax") == "iPhone 18 Pro Max"
    assert apple_name("iphoneair") == "iPhone Air" and apple_name("iphone17e") == "iPhone 17e"
    assert model_key("Galaxy S24+") == "galaxy-s24-plus"
    order = ["iPhone 17e", "iPhone Air", "Galaxy S25 Ultra", "iPhone 17", "iPhone 18 Pro", "iPhone 17 Pro Max",
             "iPhone Duo", "iPhone 18 Pro Max"]
    assert sorted(order, key=sort_key) == ["iPhone 18 Pro Max", "iPhone 18 Pro", "iPhone Duo", "iPhone 17 Pro Max",
                                           "iPhone Air", "iPhone 17", "iPhone 17e", "Galaxy S25 Ultra"]


def test_gadget_rows_collapse_colors():
    from presyo_ingest.sources.gadgets import rows_for, shopify_variants

    product = {"title": "iPhone 17", "handle": "iphone-17",
               "options": [{"name": "Color"}, {"name": "Capacity"}],
               "variants": [
                   {"id": 1, "option1": "Black", "option2": "256GB", "price": "73990.00", "compare_at_price": None, "available": False},
                   {"id": 2, "option1": "Sage", "option2": "256GB", "price": "69990.00", "compare_at_price": "73990.00", "available": True},
                   {"id": 3, "option1": "White", "option2": "256GB", "price": "71990.00", "compare_at_price": None, "available": True},
                   {"id": 4, "option1": "Sage", "option2": "512GB", "price": "85990.00", "compare_at_price": None, "available": False},
               ]}
    rows = {r["spec"]: r for r in rows_for("x", shopify_variants([product], "shop.ph"))}
    assert rows["256GB"]["price"] == 69990 and rows["256GB"]["was"] == 73990
    assert rows["256GB"]["colors"] == ["Sage", "White"] and rows["256GB"]["stock"] is True
    assert rows["256GB"]["url"] == "https://shop.ph/products/iphone-17?variant=2"
    assert rows["512GB"]["stock"] is False and rows["512GB"]["colors"] is None


def test_gadget_categories():
    from presyo_ingest.sources.gadgets import apple_ipad_name, classify, console, game, mac_detail, variant_spec

    assert classify("11-inch iPad Air Wi-Fi + Cellular 128GB - Blue (M4)") == ("tablets", "iPad Air 11-inch (M4)", False)
    assert classify("iPad mini A17 Pro 7th Gen") == ("tablets", "iPad mini (A17 Pro)", False)
    assert classify("Magic Keyboard for iPad Pro 13-inch (M5)") is None
    assert classify("13-inch MacBook Air: Apple M5 chip with 10-core CPU and 10-core GPU, 1TB SSD - Midnight") == \
        ("laptops", "MacBook Air 13-inch (M5)", False)
    assert classify("Apple Watch Series 11 GPS Aluminum Case Sport Band") == ("watches", "Apple Watch Series 11", False)
    assert classify("Apple Watch SE 3 GPS 40mm Midnight Aluminium Case with Midnight Sport Band - M/L")[1] == "Apple Watch SE 3"
    assert classify("AirPods 4 with Active Noise Cancellation")[1] == "AirPods 4 with ANC"
    assert classify("AirPods Pro (2nd generation) with MagSafe Case (USB_C)")[1] == "AirPods Pro 2"
    assert variant_spec("tablets", "iPad Air 256GB Wi-Fi + Cellular") == "256GB Wi-Fi + Cellular"
    assert variant_spec("laptops", "M5 chip 10-core GPU 16GB unified memory 512GB SSD") == "512GB SSD"
    assert mac_detail("M5 chip with 10‑core CPU and 10‑core GPU, 16GB, 512GB SSD") == "16GB · 10-core GPU"
    assert variant_spec("watches", "Series 11 GPS + Cellular 46mm Titanium") == "46mm GPS + Cellular Titanium"
    assert apple_ipad_name("ipadpro11_m5_2025") == "iPad Pro 11-inch (M5)"
    assert apple_ipad_name("ipadmini_a17pro_2024") == "iPad mini (A17 Pro)"
    assert apple_ipad_name("ipada16_2025") == "iPad (A16)"
    assert console("Sony Playstation PS5 Pro Console Digital Version 2TB") == ("PlayStation 5 Pro", "Digital")
    assert console("Nintendo Switch 2 Console Mario Kart World Bundle") == ("Nintendo Switch 2", "Mario Kart World bundle")
    assert console("Steam Deck OLED (512GB, 1TB)", "512GB NVME SSD") == ("Steam Deck OLED", "512GB")
    assert console("Retroid Pocket 5 Handheld Retro Gaming System") is None
    assert game("PS5 Ghost of Yotei (Asian)") == ("Ghost of Yotei", "PS5 · Asian")
    assert game("Nintendo Switch 2 Absolum (US) (Eng/FR)") == ("Absolum", "Switch 2 · US")
    assert game("PS5 Edge of Memories Pre-Order Downpayment") is None


def test_samsung_variants():
    from presyo_ingest.sources.gadgets import samsung_variants

    products = [
        {"fmyMarketingName": "Galaxy S26 Ultra (Samsung.com only)", "modelList": [
            {"price": 96990, "promotionPrice": 89990, "stockStatusText": "inStock", "pdpUrl": "/ph/x/",
             "fmyChipList": [{"fmyChipName": "Black"}, {"fmyChipName": "12GB/256GB"}]},
            {"price": None, "promotionPrice": None, "fmyChipList": [{"fmyChipName": "White"}, {"fmyChipName": "16GB/1TB"}]},
        ]},
        {"fmyMarketingName": "Galaxy S26+ 256GB & Buds4 Pro Silver pack", "modelList": []},
    ]
    (v,) = samsung_variants(products)
    assert (v["model"], v["spec"], v["price"], v["was"], v["available"]) == ("Galaxy S26 Ultra", "256GB", 89990, 96990, True)


def test_medicine_names():
    from presyo_ingest.sources.dpri import edition_date, split_name

    assert split_name("CAPTOPRIL 25 mg tablet") == ("Captopril", "25 mg tablet")
    assert split_name("0.9% SODIUM CHLORIDE 1 L bag") == ("0.9% Sodium Chloride", "1 L bag")
    assert split_name("5% DEXTROSE IN 0.3% SODIUM CHLORIDE 1 L bottle") == ("5% Dextrose in 0.3% Sodium Chloride", "1 L bottle")
    assert edition_date("2026_DPRI_Booklet_asofJuly29.pdf") == "2026-07-29"
    assert edition_date("MRP-MWP List 22June2026.pdf") == "2026-06-22"


def test_gadget_offer_stats():
    from presyo_ingest.build import _offer_stats

    h = [["2026-10-01", 100.0], ["2026-10-10", 120.0], ["2026-10-18", 90.0]]
    assert _offer_stats(h, "2026-10-20") == {"drop": 30.0, "since": "2026-10-18", "low30": True}
    # two days of history: a drop, but no "30-day low" claim yet
    assert _offer_stats([["2026-10-19", 120.0], ["2026-10-20", 90.0]], "2026-10-20") == {"drop": 30.0, "since": "2026-10-20"}
    assert _offer_stats([["2026-10-01", 90.0], ["2026-10-20", None]], "2026-10-20") == {}
