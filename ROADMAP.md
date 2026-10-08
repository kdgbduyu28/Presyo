# Presyo roadmap

Planned work, roughly in priority order. Done items move to the changelog / git history.

## Next up

- **Language**: English / Filipino for labels and headings (and Filipino item names where
  DA/PSA give them), as a Settings option.
- **Variant preferences on Today**: the Today card shows one variant per item (local first);
  respect Settings → "Local or imported" there too (Basket and lists already do).

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
- **North Luzon fuel & LPG**: DOE uploads scanned PDFs; add OCR (tesseract) with
  sanity checks (prices within range, brand columns from header positions).
- **Fuel history before late Aug 2026** from legacy.doe.gov.ph.
- **Ambiguous DOE place names** (San Jose, Sogod, Roxas, Sta. Cruz without province).
- **NIR / BARMM boundary changes**: newer PSGC list (current mirror predates NIR).
- **More DTI bulletins**: school supplies, Noche Buena, construction materials (seasonal).

## Features
- **Price alerts** ("tell me when rice drops below ₱45"): needs push notifications and a
  small backend (Supabase + Expo push) — the first thing that would need an account.
- **Market map** with prices on pins.
- **Share as image** (price card for Facebook groups) instead of text only.
- **Basket history**: what your usual list cost each week.
- **Compare two places** (e.g. home vs. work city).

## Infra
- Push touching `ingest/` also fetches (not only rebuilds).
- Health check: warn when a source hasn't produced a new document for N days
  (e.g. DA format change) via a GitHub Actions annotation or issue.
- Store builds (EAS) once native features (push, widgets) are needed.
