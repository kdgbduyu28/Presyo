"""Normalized price history on disk.

One JSON file per source document: data/prices/<source>/<period_start>[-<part>].json
holding the document's provenance and its rows. Re-ingesting a document
overwrites its file, so runs are idempotent and git diffs show real changes.

Row fields (absent = null):
  item, spec, cat, unit, key, origin   what was priced
  area                                 PSGC code the price applies to
  market                               DA market id (NCR per-market reports)
  brand                                fuel brand
  start, end                           period covered (ISO dates, inclusive)
  price | min, max                     single price, or a range
"""

import json
from datetime import datetime, timezone

from .paths import PRICES

PARSER_VERSION = 1


def doc_path(source: str, name: str):
    return PRICES / source / f"{name}.json"


def exists(source: str, name: str) -> bool:
    return doc_path(source, name).exists()


def write(source: str, name: str, doc: dict, rows: list[dict]) -> None:
    path = doc_path(source, name)
    path.parent.mkdir(parents=True, exist_ok=True)
    clean = [{k: v for k, v in r.items() if v is not None} for r in rows]
    clean.sort(key=lambda r: json.dumps(r, sort_keys=True, ensure_ascii=False))
    # Sources re-read every run (PSA, electricity, DTI) mostly return the
    # same data; keep the file untouched so the daily job doesn't commit
    # timestamp-only changes.
    if path.exists():
        old = json.loads(path.read_text())
        same_doc = {k: v for k, v in old["doc"].items() if k not in ("parsed_at", "rows")} == \
            {"source": source, **doc, "parser_version": PARSER_VERSION}
        if same_doc and old["rows"] == clean:
            return
    body = {
        "doc": {
            "source": source,
            **doc,
            "parser_version": PARSER_VERSION,
            "parsed_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "rows": len(clean),
        },
        "rows": clean,
    }
    path.write_text(
        "{\n"
        f' "doc": {json.dumps(body["doc"], ensure_ascii=False)},\n'
        ' "rows": [\n'
        + ",\n".join("  " + json.dumps(r, ensure_ascii=False) for r in clean)
        + "\n ]\n}\n"
    )


def read_all(source: str) -> list[dict]:
    """Every document of a source, oldest first."""
    folder = PRICES / source
    if not folder.exists():
        return []
    return [json.loads(p.read_text()) for p in sorted(folder.glob("*.json"))]
