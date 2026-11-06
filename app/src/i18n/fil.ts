// Filipino translations, keyed by the English text shown in the app.
// Words people already say in Taglish at the palengke or pump (kg, LPG, RON,
// SRP, basket, medium) stay as they are. {name} placeholders are filled in by t().

export const fil: Record<string, string> = {
  // Home and navigation
  'Palengke & pump prices near you': 'Presyo sa palengke at gasolinahan malapit sa iyo',
  Settings: 'Mga Setting',
  Back: 'Bumalik',
  Change: 'Palitan',
  'Change location': 'Palitan ang lokasyon',
  'Location: {place}. Change': 'Lokasyon: {place}. Palitan',
  'Where do you buy?': 'Saan ka namimili?',
  'Presyo shows the latest government-monitored prices of rice, fuel, meat, vegetables, seafood, groceries, LPG, electricity, water and fares for your area, plus exchange rates, medicine reference prices and gadget prices across stores.':
    'Ipinapakita ng Presyo ang pinakabagong presyong binabantayan ng gobyerno para sa bigas, gasolina, karne, gulay, isda, grocery, LPG, kuryente, tubig at pamasahe sa lugar mo, pati palitan ng pera, reference price ng gamot at presyo ng gadget sa iba\'t ibang tindahan.',
  "Couldn't load data: {error}": 'Hindi ma-load ang data: {error}',
  'Data from DA Bantay Presyo, PSA OpenSTAT, DOE (pump prices, LPG, price notices, electricity), DTI (SRP), Meralco, MWSS, LTFRB, BSP (exchange rates), DOH (medicine) and store websites (gadgets)':
    'Data mula sa DA Bantay Presyo, PSA OpenSTAT, DOE (presyo sa pump, LPG, abiso sa presyo, kuryente), DTI (SRP), Meralco, MWSS, LTFRB, BSP (palitan ng pera), DOH (gamot) at mga website ng tindahan (gadget)',
  'updated {date}': 'na-update noong {date}',
  'Presyo is not affiliated with the government.': 'Hindi kaanib ng gobyerno ang Presyo.',

  // Tabs
  Today: 'Ngayon',
  Basket: 'Basket',
  Compare: 'Ikumpara',
  Rice: 'Bigas',
  Fuel: 'Gasolina',
  'Meat & Eggs': 'Karne at Itlog',
  Vegetables: 'Gulay',
  Seafood: 'Isda at Lamang-dagat',
  Fruits: 'Prutas',
  Pantry: 'Pantry',
  'Grocery SRP': 'Grocery SRP',
  Electricity: 'Kuryente',
  Water: 'Tubig',
  Fares: 'Pamasahe',
  Forex: 'Palitan ng Pera',
  Gadgets: 'Gadgets',
  Medicine: 'Gamot',

  // Today
  'Fuel & cooking gas': 'Gasolina at LPG',
  'LPG, 11 kg tank': 'LPG, 11 kg na tangke',
  'Gasoline RON {n}': 'Gasolina RON {n}',
  Diesel: 'Diesel',
  'Diesel Plus': 'Diesel Plus',
  'My items': 'Mga item ko',
  'Tip: open any item and tap “☆ Add to my items” to pin it here.':
    'Tip: buksan ang kahit anong item at i-tap ang “☆ Idagdag sa mga item ko” para lumabas ito rito.',
  'No food price data covers {place} yet.': 'Wala pang presyo ng pagkain para sa {place}.',
  'Metro Manila average (DA, daily)': 'Average sa Metro Manila (DA, araw-araw)',
  '{area} average (PSA, monthly)': 'Average sa {area} (PSA, buwanan)',
  'latest {date}. Tap an item for the full list.': 'pinakabago {date}. I-tap ang item para sa buong listahan.',
  '{amount} since your last visit': '{amount} mula noong huling bisita mo',
  Imported: 'Imported',
  Local: 'Lokal',
  imported: 'imported',
  local: 'lokal',

  // Today: gadgets and pump price changes
  'Price alert': 'Abiso sa presyo',
  'Price alerts': 'Mga abiso sa presyo',
  'is {price} — at or below your {target} target': 'ay {price} na — pasok sa target mong {target}',
  'My gadgets': 'Mga gadget ko',
  'Out of stock': 'Ubos na',
  'Gadget price drops': 'Bumabang presyo ng gadget',
  'Pump price changes · week of {dates}': 'Galaw ng presyo sa pump · linggo ng {dates}',
  Gasoline: 'Gasolina',
  Kerosene: 'Gaas',
  'Per liter, typical across {n} oil companies (DOE prior notices).': 'Bawat litro, karaniwan sa {n} oil company (abiso ng DOE).',

  // Rows and buttons
  'no change': 'walang pagbabago',
  'Add to my items': 'Idagdag sa mga item ko',
  'Remove from my items': 'Alisin sa mga item ko',
  'My item': 'Item ko',
  'Share this price': 'I-share ang presyong ito',
  'Share as image': 'I-share bilang larawan',
  'Save as image': 'I-save bilang larawan',
  'Making image…': 'Ginagawa ang larawan…',
  'vs previous report': 'mula sa nakaraang ulat',
  'vs previous month': 'mula sa nakaraang buwan',

  // Search
  'Search any price: galunggong, sibuyas, kape…': 'Hanapin ang presyo: galunggong, sibuyas, kape…',
  'Search prices': 'Maghanap ng presyo',
  'No matches for “{q}”.': 'Walang tugma para sa “{q}”.',

  // Food lists
  'Metro Manila average': 'Average sa Metro Manila',
  'all items · {n} markets': 'lahat ng item · {n} palengke',
  'in {city}': 'sa {city}',
  '{km} km away': '{km} km ang layo',
  "Couldn't load prices ({error}).": 'Hindi ma-load ang presyo ({error}).',
  'Prevailing price across NCR wet markets · DA Bantay Presyo': 'Karaniwang presyo sa mga palengke ng NCR · DA Bantay Presyo',
  'DA Bantay Presyo daily monitoring': 'araw-araw na monitoring ng DA Bantay Presyo',
  'DA tracks fewer items per market. Try “Metro Manila average” for the full list.':
    'Mas kaunti ang item na binabantayan ng DA bawat palengke. Subukan ang “Average sa Metro Manila” para sa buong listahan.',
  city: 'lungsod',
  province: 'lalawigan',
  region: 'rehiyon',
  "Average retail prices for {area} {what} from the Philippine Statistics Authority. They're published monthly, about a month late. Prices at your own palengke may differ.":
    'Average na presyo sa {what} ng {area} mula sa Philippine Statistics Authority. Buwanan itong inilalabas, mga isang buwang huli. Maaaring iba ang presyo sa palengke mo.',
  '{area} {what} average': 'Average sa {what} ng {area}',
  'No prices reported for this category recently.': 'Walang naiulat na presyo sa kategoryang ito kamakailan.',
  'As of {date}': 'Noong {date}',
  'For {date}': 'Para sa {date}',
  'as of {date}': 'noong {date}',
  '{amount} per tray of 30': '{amount} bawat tray (30 piraso)',
  'change vs previous report': 'pagbabago mula sa nakaraang ulat',
  'change vs previous month': 'pagbabago mula sa nakaraang buwan',
  'Within {km} km': 'Sa loob ng {km} km',
  'approx.': 'tantiya',

  // Basket
  'My palengke list': 'Listahan ko sa palengke',
  pcs: 'piraso',
  tray: 'tray',
  trays: 'tray',
  'Less {item}': 'Bawasan ang {item}',
  'More {item}': 'Dagdagan ang {item}',
  'Add {item}': 'Idagdag ang {item}',
  'Your list is empty. Add items below.': 'Wala pang laman ang listahan mo. Magdagdag sa ibaba.',
  'Cost at markets within {km} km': 'Halaga sa mga palengke sa loob ng {km} km',
  favourites: 'mga paborito',
  'location approx.': 'tantiyang lokasyon',
  'no price for {items}': 'walang presyo ng {items}',
  'No DA-monitored market within {km} km reports these items. Raise the distance or add favourite markets in Settings.':
    'Walang palengkeng binabantayan ng DA sa loob ng {km} km na may presyo ng mga ito. Lakihan ang layo o magdagdag ng paboritong palengke sa Mga Setting.',
  'Estimated cost': 'Tantiyang halaga',
  'At {area} average prices': 'Sa average na presyo sa {area}',
  'Not included: {items}.': 'Hindi kasama: {items}.',
  'Per-market prices are only monitored in Metro Manila for now.': 'Sa Metro Manila lang muna may presyo bawat palengke.',
  'Buying at the cheapest market saves about {amount} vs. the dearest one listed.':
    'Makakatipid ka ng mga {amount} kung sa pinakamurang palengke ka mamimili kaysa sa pinakamahal sa listahan.',

  'What your list cost each week': 'Halaga ng listahan mo bawat linggo',
  'What your list cost each month': 'Halaga ng listahan mo bawat buwan',
  '{amount} more than {when}': 'Mas mahal ng {amount} kaysa {when}',
  '{amount} less than {when}': 'Mas mura ng {amount} kaysa {when}',
  'About the same as {when}': 'Halos pareho noong {when}',
  '{n} weeks ago': '{n} linggo na ang nakaraan',
  'Metro Manila average prices (DA), last report of each week.': 'Average na presyo sa Metro Manila (DA), huling ulat bawat linggo.',
  'Average prices (PSA), by month.': 'Average na presyo (PSA), bawat buwan.',

  // Fuel and LPG
  'No DOE fuel monitoring near you yet.': 'Wala pang monitoring ng DOE sa gasolina malapit sa iyo.',
  "Couldn't load fuel prices ({error}).": 'Hindi ma-load ang presyo ng gasolina ({error}).',
  "DOE doesn't monitor pump prices in {place}. Showing {area}, the nearest monitored area ({km} km away).":
    'Hindi binabantayan ng DOE ang presyo sa pump sa {place}. Ipinapakita ang {area}, ang pinakamalapit na binabantayan ({km} km ang layo).',
  "The latest DOE report for this area is for {dates}. Newer weeks weren't readable (scanned PDFs), so these may be out of date.":
    'Ang pinakabagong ulat ng DOE para sa lugar na ito ay para sa {dates}. Hindi mabasa ang mas bagong linggo (scanned PDF), kaya baka luma na ang mga ito.',
  'Week of {dates}': 'Linggo ng {dates}',
  'Regular unleaded': 'Regular unleaded',
  Premium: 'Premium',
  'Super premium': 'Super premium',
  'Premium diesel': 'Premium diesel',
  Gaas: 'Gaas',
  '{range} across stations': '{range} sa iba-ibang gasolinahan',
  'DOE weekly retail pump price monitoring. Prices change every Tuesday.':
    'Lingguhang monitoring ng DOE sa presyo sa pump. Nagbabago ang presyo tuwing Martes.',
  'Common price in {area} · vs previous week': 'Karaniwang presyo sa {area} · kumpara sa nakaraang linggo',
  'By brand · lowest to highest': 'Bawat brand · mula pinakamura hanggang pinakamahal',
  'Cooking gas (LPG)': 'Gas sa pagluluto (LPG)',
  '{range} by brand': '{range} depende sa brand',
  'DOE monthly monitoring, {month}': 'buwanang monitoring ng DOE, {month}',
  "Metro Manila, 2026 (middle of DOE's price range)": 'Metro Manila, 2026 (gitna ng price range ng DOE)',
  'Trip cost': 'Gastos sa biyahe',
  'Distance (km)': 'Layo (km)',
  'Mileage (km/L)': 'Mileage (km/L)',
  'At {price}/L. Mileage: ~10–14 km/L for a small car, 30–40 for a motorcycle.':
    'Sa {price}/L. Mileage: ~10–14 km/L sa maliit na kotse, 30–40 sa motorsiklo.',

  // Electricity
  'No electricity rates for this region yet.': 'Wala pang singil sa kuryente para sa rehiyong ito.',
  'Your utility': 'Utility mo',
  'Private utility': 'Pribadong utility',
  'Electric cooperative': 'Electric cooperative',
  'Residential rate, all charges · vs previous month': 'Singil sa bahay, lahat ng bayarin · kumpara sa nakaraang buwan',
  'Monthly use': 'Gamit bawat buwan',
  'Monthly use in kWh': 'Gamit bawat buwan sa kWh',
  "{month} bill from Meralco's rate table: all charges, VAT and 0.5% franchise tax (varies by city).":
    'Bill noong {month} mula sa rate table ng Meralco: lahat ng bayarin, VAT at 0.5% franchise tax (iba-iba bawat lungsod).',
  'Check “kWh used” on your bill. A typical home uses 150–250 kWh a month.':
    'Tingnan ang “kWh used” sa bill mo. Karaniwang 150–250 kWh bawat buwan ang gamit ng isang bahay.',
  "Pick your electric utility below. It's printed at the top of your bill.":
    'Piliin ang electric utility mo sa ibaba. Nakasulat ito sa itaas ng bill mo.',
  '{region} utilities · lowest rate first': 'Mga utility sa {region} · pinakamura muna',
  'DOE electricity rates per distribution utility (residential). Tap a utility to make it yours.':
    'Singil sa kuryente ng DOE bawat distribution utility (pambahay). I-tap ang utility para gawin itong iyo.',

  // Water
  "Water rates aren't available right now.": 'Hindi available ang singil sa tubig ngayon.',
  "Presyo covers Metro Manila's two water concessionaires (and the Rizal and Cavite towns they serve). Elsewhere, your local water district sets its own rates; these are shown for reference.":
    'Sakop ng Presyo ang dalawang water concessionaire ng Metro Manila (at ang mga bayan sa Rizal at Cavite na sineserbisyuhan nila). Sa ibang lugar, ang local water district ang nagtatakda ng singil; pang-reference lang ang mga ito.',
  'Both concessionaires serve parts of {place}. Your bill says which one is yours.':
    'Parehong concessionaire ang nagseserbisyo sa ilang bahagi ng {place}. Nakasulat sa bill mo kung alin ang sa iyo.',
  'MWSS Regulatory Office rates as reported when announced (last checked {date}). Tap an adjustment for the announcement.':
    'Singil ng MWSS Regulatory Office ayon sa anunsiyo (huling sinuri noong {date}). I-tap ang adjustment para sa anunsiyo.',
  'Average all-in tariff since {month}': 'Average na all-in tariff mula {month}',
  'vs {year}': 'kumpara sa {year}',
  'Average across all customer types, before the quarterly adjustments below. Households pay less per cu.m: the first 10 cu.m is a minimum charge, and rates rise with use.':
    'Average ng lahat ng uri ng customer, bago ang quarterly adjustment sa ibaba. Mas mababa ang bayad ng bahay bawat cu.m: minimum charge ang unang 10 cu.m, at tumataas ang singil habang lumalaki ang gamit.',
  'Connected to the sewer line (sewerage charge on your bill)': 'Nakakonekta sa sewer line (may sewerage charge sa bill mo)',
  'Sewered connection': 'May sewer na koneksiyon',
  'Quarterly adjustments': 'Quarterly adjustment',
  Bill: 'Bill',
  '{amount} at {n} cu.m': '{amount} sa {n} cu.m',
  '4Ps beneficiaries and other qualified households using up to 20 cu.m a month get reduced rates and are exempt from the FCDA. Ask {company} about its lifeline program.':
    'Mas mababa ang singil sa mga benepisyaryo ng 4Ps at iba pang kuwalipikadong bahay na gumagamit ng hanggang 20 cu.m bawat buwan, at exempted sila sa FCDA. Magtanong sa {company} tungkol sa lifeline program nito.',

  // Fares
  "Fares aren't available right now.": 'Hindi available ang pamasahe ngayon.',
  'Your trip': 'Biyahe mo',
  Distance: 'Layo',
  'Trip distance in kilometers': 'Layo ng biyahe sa kilometro',
  'Students, senior citizens and persons with disabilities': 'Estudyante, senior citizen at PWD',
  '{n}% off': '{n}% diskuwento',
  'Discounted fare': 'May diskuwentong pamasahe',
  '{base} first {km} km, then {perKm}/km': '{base} sa unang {km} km, tapos {perKm}/km',
  'was {amount}': 'dating {amount}',
  "LTFRB fares effective {date}, {year}. Fares are rounded to the nearest 25 centavos, like the official fare matrix. Taxi, UV Express and TNVS fares aren't included yet.":
    'Pamasahe ng LTFRB mula {date}, {year}. Ini-round sa pinakamalapit na 25 sentimo, gaya ng opisyal na fare matrix. Hindi pa kasama ang taxi, UV Express at TNVS.',
  'Fare matrix': 'Fare matrix',
  Regular: 'Regular',
  Discounted: 'May diskuwento',
  'Jeepney (traditional)': 'Jeep (tradisyonal)',
  'Modern jeepney': 'Modern jeep',
  'City bus (ordinary)': 'City bus (ordinary)',
  'City bus (aircon)': 'City bus (aircon)',
  'Provincial bus (ordinary)': 'Provincial bus (ordinary)',

  // Location picker
  'Use my location': 'Gamitin ang lokasyon ko',
  'You can search for your city instead.': 'Puwede mong hanapin na lang ang lungsod mo.',
  'Use {place}': 'Gamitin ang {place}',
  'or choose your city / town': 'o piliin ang lungsod / bayan mo',
  'e.g. Quezon City, Cebu, Tagum': 'hal. Quezon City, Cebu, Tagum',
  'Search city or town': 'Hanapin ang lungsod o bayan',

  'You are here': 'Nandito ka',
  '* missing some items': '* kulang ang ilang item',

  // Compare
  'Compare prices here with a second place, like where you work or your province.':
    'Ikumpara ang presyo rito sa ibang lugar, gaya ng pinagtatrabahuhan mo o probinsiya mo.',
  'Compare with': 'Ikumpara sa',
  here: 'dito',
  'Change the second place': 'Palitan ang ikalawang lugar',
  'Your Basket list': 'Ang listahan mo sa Basket',
  '{amount} cheaper in {place}': 'Mas mura ng {amount} sa {place}',
  'About the same in both places': 'Halos pareho sa dalawang lugar',
  '{n} of your {total} items (priced in both)': '{n} sa {total} mong item (may presyo sa dalawa)',
  'Both places use the same food averages, so only fuel and LPG can differ.':
    'Iisang average ng pagkain ang gamit ng dalawang lugar, kaya gasolina at LPG lang ang puwedeng magkaiba.',
  'Metro Manila food prices are daily DA averages; elsewhere PSA monthly averages, about a month behind.':
    'Araw-araw na average ng DA ang presyo ng pagkain sa Metro Manila; sa ibang lugar, buwanang average ng PSA na mga isang buwang huli.',

  // Settings
  Language: 'Wika',
  'Labels and headings. Market items use their Filipino names where DA and PSA give them.':
    'Mga label at heading. Filipino ang pangalan ng mga paninda kapag mayroon ang DA at PSA.',
  Appearance: 'Itsura',
  'Follow phone': 'Gaya ng phone',
  Light: 'Maliwanag',
  Dark: 'Madilim',
  Location: 'Lokasyon',
  'Use GPS every time I open Presyo': 'Gamitin ang GPS tuwing bubuksan ang Presyo',
  "Only after you've used “Use my location” once. Otherwise your chosen city stays.":
    'Kapag nagamit mo na ang “Gamitin ang lokasyon ko” kahit minsan. Kung hindi, mananatili ang lungsod na pinili mo.',
  'Recent places: {list}': 'Mga huling lugar: {list}',
  Clear: 'Burahin',
  'Start on': 'Unang bubuksan',
  Tabs: 'Mga tab',
  'Hide the tabs you never use.': 'Itago ang mga tab na hindi mo ginagamit.',
  'Show {tab} tab': 'Ipakita ang tab na {tab}',
  'Your fuel shows first on Today; mileage fills the trip calculator.':
    'Una sa Ngayon ang gasolina mo; ang mileage ay para sa trip calculator.',
  'Mileage (km per liter)': 'Mileage (km bawat litro)',
  'Pick your utility in the Electricity tab.': 'Piliin ang utility mo sa tab na Kuryente.',
  'Usual monthly use (kWh)': 'Karaniwang gamit bawat buwan (kWh)',
  'LPG brand': 'Brand ng LPG',
  "Today shows this brand's price when DOE lists it near you.":
    'Ipapakita sa Ngayon ang presyo ng brand na ito kapag nakalista ito sa DOE malapit sa iyo.',
  'Any (common price)': 'Kahit ano (karaniwang presyo)',
  Eggs: 'Itlog',
  'Per piece': 'Bawat piraso',
  'Per tray (30)': 'Bawat tray (30)',
  'Local or imported': 'Lokal o imported',
  'Used for the Basket and to list your choice first.': 'Para sa Basket at para mauna sa listahan ang pinili mo.',
  Cheapest: 'Pinakamura',
  'Markets within this distance are compared; favourites always are.':
    'Ikinukumpara ang mga palengke sa loob ng layong ito; laging kasama ang mga paborito.',
  'Favourite markets (Metro Manila)': 'Mga paboritong palengke (Metro Manila)',
  'Favourite {market}': 'Paborito: {market}',
  Data: 'Data',
  'Tap again to erase everything': 'I-tap ulit para burahin lahat',
  'Clear saved data': 'Burahin ang naka-save na data',
  'Removes your location, starred items, basket, settings and offline copy from this device. Nothing is stored anywhere else.':
    'Buburahin sa device na ito ang lokasyon, mga naka-star na item, basket, setting at offline na kopya. Wala kaming iniimbak sa ibang lugar.',
  Contact: 'Makipag-ugnayan',
  'Contact me': 'Kontakin ako',
  'Wrong price, missing item or an idea?': 'Maling presyo, kulang na item o may mungkahi?',
  Email: 'Email',
  'Presyo shows prices published by DA (Bantay Presyo), PSA (OpenSTAT), DOE and DTI. It is not affiliated with the government. Data updates twice a day.':
    'Ipinapakita ng Presyo ang mga presyong inilalabas ng DA (Bantay Presyo), PSA (OpenSTAT), DOE at DTI. Hindi ito kaanib ng gobyerno. Dalawang beses sa isang araw nag-a-update ang data.',

  // Settings → Data: sources
  'DA daily price index (NCR)': 'Araw-araw na price index ng DA (NCR)',
  'DA per-market prices (NCR)': 'Presyo ng DA bawat palengke (NCR)',
  'PSA regional retail prices': 'Retail na presyo ng PSA bawat rehiyon',
  'DOE pump prices: NCR': 'Presyo sa pump ng DOE: NCR',
  'DOE pump prices: South Luzon': 'Presyo sa pump ng DOE: South Luzon',
  'DOE pump prices: North Luzon': 'Presyo sa pump ng DOE: North Luzon',
  'DOE pump prices: Visayas': 'Presyo sa pump ng DOE: Visayas',
  'DOE pump prices: Mindanao': 'Presyo sa pump ng DOE: Mindanao',
  'DOE LPG': 'LPG ng DOE',
  'DOE electricity rates': 'Singil sa kuryente ng DOE',
  'DTI suggested retail prices': 'Suggested retail price ng DTI',
  'Meralco bills': 'Bill ng Meralco',
  'BSP exchange rates': 'Palitan ng pera ng BSP',
  'Gadget store prices': 'Presyo ng gadget sa mga tindahan',
  'DOH medicine prices': 'Presyo ng gamot ng DOH',
  'Water rates (checked)': 'Singil sa tubig (sinuri)',
  'Jeepney & bus fares (checked)': 'Pamasahe sa jeep at bus (sinuri)',
};
