"""DOH medicine prices: the Drug Price Reference Index (DPRI) and the
Maximum Retail Price (MRP) list.

- DPRI booklet (`downloads/<year>_DPRI_Booklet_asof<Month><Day>.pdf`): the
  lowest, median and highest price government hospitals paid per unit of
  each medicine (generic name + strength + form), from procurement records.
  It's a guide to what a medicine should cost, not a retail price. Tables
  have a "Drug Name / Description | Lowest | Median | Highest" header; long
  names wrap inside the cell.
- MRP-MWP list (`downloads/MRP-MWP List <date>.pdf`): medicines under price
  regulation (EO 104 and later orders) with the legal Maximum Retail Price a
  drugstore may charge and the Maximum Wholesale Price. Plain text in
  columns: indication | medicine | MRP | MWP.

dpri.doh.gov.ph sits behind Cloudflare, which rejects non-browser clients,
so downloads go through net.get_as_browser.
"""

import io
import re
from datetime import date

from .. import net, store
from ..paths import CACHE

SITE = "https://dpri.doh.gov.ph"
DOWNLOADS = f"{SITE}/download"
MONTHS = {m: i + 1 for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct",
                                          "nov", "dec"])}


def _num(s: str) -> float | None:
    s = (s or "").replace(",", "").replace("₱", "").strip()
    return float(s) if re.fullmatch(r"\d+(?:\.\d+)?", s) else None


def edition_date(name: str) -> str | None:
    """"2026_DPRI_Booklet_asofJuly29.pdf" -> "2026-07-29"; "MRP-MWP List 22June2026.pdf" -> "2026-06-22"."""
    n = name.replace("%20", " ")
    m = re.search(r"(\d{4})_DPRI_Booklet_asof([A-Za-z]+?)(\d{1,2})\b", n)
    if m:
        y, mon, d = int(m.group(1)), m.group(2)[:3].lower(), int(m.group(3))
    else:
        m = re.search(r"(\d{1,2})\s*([A-Za-z]+?)\s*(\d{4})", n)
        if not m:
            return None
        d, mon, y = int(m.group(1)), m.group(2)[:3].lower(), int(m.group(3))
    return date(y, MONTHS[mon], d).isoformat() if mon in MONTHS else None


def split_name(text: str) -> tuple[str, str]:
    """"CAPTOPRIL 25 mg tablet" -> ("Captopril", "25 mg tablet"): the generic name is the upper-case lead."""
    t = re.sub(r"\s+", " ", text).strip()
    words = t.split(" ")
    i = 0
    # upper-case words, "+" and percent strengths ("0.9% SODIUM CHLORIDE") make up the name
    while i < len(words) and (words[i] in ("+", "&") or re.fullmatch(r"\d+(?:\.\d+)?%", words[i])
                              or (not re.search(r"[a-z]", words[i]) and not re.match(r"^\d", words[i]))):
        i += 1
    generic = " ".join(words[:i]).strip(" ,")
    desc = " ".join(words[i:]).strip(" ,")
    name = re.sub(r"\b(In|And|Of|With|For)\b", lambda m: m.group(1).lower(), generic.title()) if generic else t
    return name, desc


def parse_dpri(pdf) -> list[dict]:
    rows = []
    for page in pdf.pages:
        for table in page.extract_tables():
            if not table or not table[0] or "Drug Name" not in (table[0][0] or ""):
                continue
            for r in table[1:]:
                if len(r) < 4:
                    continue
                if (r[0] or "").startswith("Drug Name"):
                    continue
                lo, med, hi = (_num(x) for x in r[1:4])
                if med is None:
                    continue
                generic, desc = split_name(r[0] or "")
                rows.append({"item": generic, "spec": desc or None, "cat": "medicine", "unit": "unit",
                             "price": med, "min": lo, "max": hi})
    return rows


def parse_mrp(pdf) -> list[dict]:
    rows = []
    for page in pdf.pages:
        words = page.extract_words(use_text_flow=True)
        lines: dict[int, list] = {}
        for w in words:
            lines.setdefault(round(w["top"]), []).append(w)
        cols = None
        for top in sorted(lines):
            ws = sorted(lines[top], key=lambda w: w["x0"])
            texts = [w["text"] for w in ws]
            if "Indication" in texts:
                mrp = [w["x0"] for w in ws if w["text"] == "MRP"]
                cols = (mrp[0] - 5, mrp[-1] - 20) if len(mrp) >= 2 else None
                continue
            if cols is None:
                cols = (240, 470)  # header only on the first page
            indication = " ".join(w["text"] for w in ws if w["x0"] < cols[0])
            drug = " ".join(w["text"] for w in ws if cols[0] <= w["x0"] < cols[1])
            nums = [_num(w["text"]) for w in ws if w["x0"] >= cols[1]]
            if len(nums) < 2 or None in nums[:2] or not drug:
                continue
            m = re.match(r"^(.*?)(\s\d.*)$", drug)
            generic, desc = (m.group(1), m.group(2).strip()) if m else (drug, "")
            rows.append({"item": generic.strip(), "spec": desc or None, "cat": "medicine", "unit": "unit",
                         "price": nums[0], "max": nums[1], "brand": indication or None})
    return rows


def ingest(force: bool = False) -> None:
    import pdfplumber

    # the download page lists the booklets; the latest MRP list is only on the home page
    html = "".join(net.get_as_browser(u).decode("utf-8", "replace") for u in (DOWNLOADS, SITE + "/"))
    links = sorted(set(re.findall(r'href="(https://dpri\.doh\.gov\.ph/downloads/[^"]+\.pdf)"', html)))
    # (older booklets lay their tables out differently and parse to nothing; those
    # are kept as "empty" documents so they aren't downloaded again)
    booklets = [(edition_date(u), u) for u in links if "DPRI_Booklet" in u and edition_date(u)]
    mrps = [(edition_date(u), u) for u in links if "MRP" in u and edition_date(u)]
    # 2026 editions onwards (product decision: history from 2026)
    for source, items, parse in (("doh_dpri", booklets, parse_dpri), ("doh_mrp", mrps, parse_mrp)):
        for day, url in sorted(items):
            if day < "2026-01-01" or (store.exists(source, day) and not force):
                continue
            path = CACHE / "dpri" / url.rsplit("/", 1)[1].replace(" ", "_")
            if not path.exists():
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(net.get_as_browser(url.replace(" ", "%20")))
            with pdfplumber.open(io.BytesIO(path.read_bytes())) as pdf:
                rows = parse(pdf)
            store.write(source, day, {"url": url, "status": "ok" if rows else "empty", "period_start": day,
                                      "period_end": day}, rows)
            print(f"dpri: {source} {day}: {len(rows)} medicines")
