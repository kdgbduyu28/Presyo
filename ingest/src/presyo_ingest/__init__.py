"""presyo-ingest: fetch PH government price reports and build the app's data.

    presyo-ingest geo            rebuild data/areas.json (rarely needed)
    presyo-ingest psa|da|doe     fetch new reports for one source
    presyo-ingest lpg            DOE household LPG reports
    presyo-ingest adjust         DOE weekly fuel price adjustment notices
    presyo-ingest power          DOE residential electricity rates (Google Sheet)
    presyo-ingest dti            DTI suggested retail prices (grocery SRP bulletin)
    presyo-ingest markets        geocode DA markets missing coordinates
    presyo-ingest all            everything above + build
    presyo-ingest build          write app/public/data from data/
    (add --force to re-parse documents already on disk)
"""

import sys


def main() -> None:
    from . import build, geo
    from .sources import da, doe, dti, lpg, power, psa

    cmd = sys.argv[1] if len(sys.argv) > 1 else "all"
    force = "--force" in sys.argv
    if cmd == "geo":
        geo.save(geo.build())
    elif cmd == "psa":
        psa.ingest(geo.Gazetteer(), force=force)
    elif cmd == "da":
        da.ingest(force=force)
    elif cmd == "doe":
        doe.ingest(geo.Gazetteer(), force=force)
    elif cmd == "lpg":
        lpg.ingest(geo.Gazetteer(), force=force)
    elif cmd == "adjust":
        doe.ingest_adjustments(force=force)
    elif cmd == "power":
        power.ingest(force=force)
    elif cmd == "dti":
        dti.ingest(force=force)
    elif cmd == "markets":
        da.geocode_markets(geo.Gazetteer())
    elif cmd == "build":
        build.build()
    elif cmd == "all":
        # One government site being down must not block the others (or the
        # build): run every source, report failures, and still build.
        import traceback

        gz = geo.Gazetteer()
        steps = [
            ("psa", lambda: psa.ingest(gz, force=force)),
            ("da", lambda: da.ingest(force=force)),
            ("markets", lambda: da.geocode_markets(gz)),
            ("doe", lambda: doe.ingest(gz, force=force)),
            ("lpg", lambda: lpg.ingest(gz, force=force)),
            ("adjust", lambda: doe.ingest_adjustments(force=force)),
            ("power", lambda: power.ingest(force=force)),
            ("dti", lambda: dti.ingest(force=force)),
        ]
        failed = []
        for name, step in steps:
            try:
                step()
            except Exception as e:
                failed.append(name)
                traceback.print_exc()
                # GitHub Actions annotation; harmless in a terminal
                print(f"::warning title=presyo-ingest {name} failed::{e!r}")
        build.build()
        if failed:
            print(f"presyo-ingest: finished with failures in {', '.join(failed)}")
    else:
        print(__doc__)
        sys.exit(2)
