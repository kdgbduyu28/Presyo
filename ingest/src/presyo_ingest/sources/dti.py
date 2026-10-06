"""DTI — Suggested Retail Prices (SRP) of basic necessities and prime commodities.

A national price guide (not observed prices) published as a one-page A3 PDF
bulletin: three column groups of NAME | UNIT | SRP, bold section headers
("CANNED SARDINES IN TOMATO SAUCE"), regular-weight items. Long names wrap
above and below the line carrying the unit and price, so each name-only line
is attached to the vertically nearest price line.
"""

import re
from datetime import date
from pathlib import Path

import pdfplumber

from .. import net, store

PAGE = "https://www.dti.gov.ph/dti-consumer-space/dti-latest-srps-basic-necessities-prime-commodities/"
SOURCE = "dti_srp"

_MON = ["january", "february", "march", "april", "may", "june", "july", "august",
        "september", "october", "november", "december"]


def latest_url() -> str | None:
    html = net.get(PAGE).text
    links = re.findall(r'href="(https://dtiwebfiles[^"]+SRP[^"]+\.pdf)"', html)
    return links[0] if links else None


def parse(path: Path) -> tuple[list[dict], date | None]:
    pdf = pdfplumber.open(path)
    page = pdf.pages[0]
    words = page.extract_words(extra_attrs=["fontname", "size"])
    text = page.extract_text() or ""
    m = re.search(r"effective\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})", text, re.I)
    effective = (date(int(m.group(3)), _MON.index(m.group(2).lower()) + 1, int(m.group(1)))
                 if m and m.group(2).lower() in _MON else None)

    units = sorted(w["x0"] for w in words if w["text"] == "UNIT")
    srps = sorted(w["x0"] for w in words if w["text"] == "SRP")
    head_y = max(w["bottom"] for w in words if w["text"] in ("UNIT", "SRP"))
    body_size = max(set(round(w["size"], 1) for w in words),
                    key=lambda s: sum(1 for w in words if round(w["size"], 1) == s))
    bounds = [0.0] + [srps[i] + 30 for i in range(len(srps) - 1)] + [page.width]

    items: list[dict] = []
    section = ""  # a column can start mid-section (continued from the previous column)
    for col, (unit_x, srp_x) in enumerate(zip(units, srps)):
        lo, hi = bounds[col], bounds[col + 1]
        ws = [w for w in words if lo <= w["x0"] < hi and w["top"] > head_y
              and abs(round(w["size"], 1) - body_size) < 0.5]
        # lines
        lines: list[dict] = []
        for w in sorted(ws, key=lambda w: (w["top"], w["x0"])):
            ln = next((l for l in lines if abs(l["top"] - w["top"]) < 2.5), None)
            if ln is None:
                ln = {"top": w["top"], "words": []}
                lines.append(ln)
            ln["words"].append(w)
        lines.sort(key=lambda l: l["top"])
        for ln in lines:
            ws_ = sorted(ln["words"], key=lambda w: w["x0"])
            ln["name"] = " ".join(w["text"] for w in ws_ if w["x1"] < unit_x - 6)
            ln["unit"] = " ".join(w["text"] for w in ws_ if unit_x - 6 <= w["x1"] and w["x0"] < srp_x - 12)
            price = [w["text"] for w in ws_ if w["x0"] >= srp_x - 12 and re.fullmatch(r"[\d,]+\.\d{2}", w["text"])]
            ln["price"] = float(price[-1].replace(",", "")) if price else None
            ln["bold"] = all("F1" in w["fontname"] for w in ws_) and ln["price"] is None

        # assign name-only lines to the nearest price line within the same section
        block: list[dict] = []

        def flush():
            priced = [l for l in block if l["price"] is not None]
            for l in block:
                if l["price"] is None:
                    l["owner"] = min(priced, key=lambda p: abs(p["top"] - l["top"])) if priced else None
            for p in priced:
                parts = sorted([l for l in block if l is p or l.get("owner") is p], key=lambda l: l["top"])
                name = re.sub(r"\s+", " ", " ".join(l["name"] for l in parts if l["name"])).strip()
                unit = " ".join(l["unit"] for l in parts if l["unit"]).strip()
                # some sizes sit left of the UNIT column ("Café Puro 17g")
                m = re.search(r"\s(\d+(?:\.\d+)?\s?(?:g|kg|ml|mL|L|pcs?))$", name)
                if m and not unit:
                    name, unit = name[: m.start()].strip(), m.group(1)
                if name:
                    items.append({"section": p["section"], "name": name, "unit": unit, "srp": p["price"]})

        for ln in lines:
            if ln["bold"]:
                flush()
                block = []
                if not re.fullmatch(r"(BASIC NECESSITIES|PRIME COMMODITIES)", ln["name"].strip()):
                    section = ln["name"] + (" " + ln["unit"] if ln["unit"] else "")
                continue
            ln["section"] = section
            block.append(ln)
        flush()
    return items, effective


def ingest(force: bool = False) -> None:
    url = latest_url()
    if not url:
        print("dti: no SRP bulletin link found")
        return
    name = url.rsplit("/", 1)[1]
    path = net.fetch_cached(url, f"dti/{name}")
    items, effective = parse(path)
    start = (effective or date.today()).isoformat()
    # "n" keeps the bulletin's reading order (sardines, milk, coffee, ...);
    # the store sorts rows, so the order has to be explicit.
    rows = [{"item": it["name"], "spec": it["unit"] or None, "cat": "grocery", "unit": "pc",
             "brand": it["section"].title() or None, "area": "PH", "start": start, "end": start,
             "price": it["srp"], "n": i} for i, it in enumerate(items)]
    store.write(SOURCE, start, {
        "url": url, "sha256": net.sha256(path), "period_start": start, "period_end": start,
        "status": "ok" if rows else "empty", "effective": start,
    }, rows)
    print(f"dti: {len(rows)} SRP items, effective {start}")
