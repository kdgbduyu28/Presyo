# Presyo roadmap

Planned work, roughly in priority order. Done items move to the changelog / git history.

## Next up

- **Language**: done 2026-11-02. Settings → Language switches labels and headings (`src/i18n`, `t()`
  keyed by English) and shows Filipino item names (`src/i18n/items.ts`: the local name DA/PSA give, else
  the everyday word). Search matches both. Translated so far: home, Settings, Today, Basket, food tabs,
  search; Fuel/LPG details, Electricity, Water, Fares, Forex, Gadgets and Medicine still show English.
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
- **Market map** with prices on pins.
- **Share as image**: done on web 2026-11-02 (item detail → "Share as image" / "Save as image": a 1080×1080
  PNG card from `src/lib/card.ts`, shared as a file on phones, downloaded on desktop). Native builds still
  share text; an image there needs `expo-sharing` + `expo-file-system` (or `react-native-view-shot`).
- **Basket history**: done 2026-11-02. Basket shows what the list cost each week (Metro Manila: DA daily
  averages, last report of each week) or month (PSA elsewhere), from the history files the app already has
  (`basketHistory` in `src/lib/basket.ts`). It reprices today's list; it doesn't remember past lists.
- **Compare two places** (e.g. home vs. work city).

## Infra
- Push touching `ingest/` also fetches (not only rebuilds).
- Health check: warn when a source hasn't produced a new document for N days
  (e.g. DA format change) via a GitHub Actions annotation or issue.
- Store builds (EAS) once native features (push, widgets) are needed.
