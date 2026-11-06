# Presyo roadmap

Planned work, roughly in priority order. Done items move to the changelog / git history.

## Next up

- **Language**: done 2026-11-02, all tabs by 2026-11-06. Settings → Language switches labels and headings
  (`src/i18n`, `t()` keyed by English) and shows Filipino item names (`src/i18n/items.ts`: the local name DA/PSA
  give, else the everyday word). Search matches both. Still English: text that comes from the data files
  (fare notice, DTI section and item names, medicine names, store notes).
- **Variant preferences on Today**: done 2026-10-28 (summary rows carry `variants`; Today follows Settings → local / imported / cheapest).

## Done (2026-10-08)

- **Settings & personal preferences** (`src/app/settings.tsx`, `src/lib/prefs.tsx`): theme,
  GPS on open, recent places, start tab, hide tabs, fuel type + mileage, monthly kWh,
  electricity utility (moved from its own key), LPG brand, eggs per piece/tray,
  local/imported/cheapest, Basket radius + favourite markets, per-source "last updated",
  clear saved data.
- **Dark mode**: Light / Dark / Follow phone. Palettes in `src/theme.ts`; styles are
  `themed()` sheets and the root remounts under the new palette.
- **Desktop / landscape**: ≥ 1024 px gets a sidebar, two-column Today / Basket / Fuel and
  item details in a side panel; `/` focuses search, Esc closes panels; landscape allowed.

## Data
- **Gadgets**: history starts 2026-10-19 (stores only show today's price). Next: Xiaomi / realme /
  OPPO official stores, Abenson and SM Store (bot-check pages), Apple's own Mac/Watch/AirPods
  prices (different page format), Samsung tablets and watches.
- **Medicine**: older DPRI booklets (June 2026 and earlier) use a different table layout and
  parse to nothing; a text-based parser would add history across editions.
- **Water and fares upkeep**: quarterly check of MWSS-RO FCDA announcements (Jan/Apr/Jul/Oct)
  and LTFRB fare orders; edit `data/static/*.json`. Possible next: provincial water districts
  (LWUA), LRT/MRT fares, taxi/TNVS/UV Express, tricycle (set per LGU).
- **Other Meralco-style bill tables**: VECO, Davao Light, other big utilities publish similar
  rate schedules.
- **North Luzon fuel & LPG**: DOE uploads scanned PDFs; add OCR (tesseract) with
  sanity checks (prices within range, brand columns from header positions).
- **Fuel history before late Aug 2026** from legacy.doe.gov.ph.
- **Ambiguous DOE place names** (San Jose, Sogod, Roxas, Sta. Cruz without province).
- **NIR / BARMM boundary changes**: newer PSGC list (current mirror predates NIR).
- **More DTI bulletins**: school supplies, Noche Buena, construction materials (seasonal).

## Features
- **Push price alerts**: alerts work on-device now (set a target on a gadget or food item; Today
  shows a banner once it's met). Notifications while the app is closed need a small backend
  (Supabase + Expo push / web push) — the first thing that would need an account.
- **Market map**: done 2026-11-02 for the Basket (Metro Manila): your list's total on a pin at each nearby DA
  market, cheapest in green, on OpenStreetMap tiles placed by hand (`src/lib/map.ts`, no map library).
  Item details show the same map for the item's "Within 8 km" markets. Next: spread out pins that overlap; pan/zoom.
- **Share as image**: done on web 2026-11-02 (item detail → "Share as image" / "Save as image": a 1080×1080
  PNG card from `src/lib/card.ts`, shared as a file on phones, downloaded on desktop). Native builds still
  share text; an image there needs `expo-sharing` + `expo-file-system` (or `react-native-view-shot`).
- **Basket history**: done 2026-11-02. Basket shows what the list cost each week (Metro Manila: DA daily
  averages, last report of each week) or month (PSA elsewhere), from the history files the app already has
  (`basketHistory` in `src/lib/basket.ts`). It reprices today's list; it doesn't remember past lists.
- **Compare two places**: done 2026-11-02. New Compare tab (hideable): pick a second place; your Basket
  list total, fuel, LPG and every headline food item side by side, cheaper side in green
  (`src/components/CompareView.tsx`, `src/lib/compare.ts`), plus electricity (your utility's rate) and Metro
  Manila water.

## Infra
- Push touching `ingest/` also fetches: done 2026-11-06 (`update.yml` diffs the push against its base).
- Health check: done 2026-11-06. `presyo-ingest health` warns (GitHub Actions annotation) when a source's latest
  document is older than its usual cadence (`ingest/src/presyo_ingest/health.py`). Next: open an issue instead.
- Store builds (EAS) once native features (push, widgets) are needed.
