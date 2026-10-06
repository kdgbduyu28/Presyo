"""HTTP access to the government sources.

PSA's OpenSTAT answers 403 to non-browser user agents, so every request goes
out with a browser-like UA.
"""

import hashlib
import time
from pathlib import Path

import httpx

from .paths import CACHE

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0 Safari/537.36 presyo-ingest"
)

_client = httpx.Client(
    headers={"User-Agent": UA}, timeout=90, follow_redirects=True
)


def request(method: str, url: str, **kw) -> httpx.Response:
    last: Exception | None = None
    for attempt in range(4):
        try:
            r = _client.request(method, url, **kw)
            if r.status_code in (429, 500, 502, 503, 504):
                raise httpx.HTTPStatusError(
                    f"{r.status_code}", request=r.request, response=r
                )
            r.raise_for_status()
            return r
        except (httpx.TransportError, httpx.HTTPStatusError) as e:
            if isinstance(e, httpx.HTTPStatusError) and e.response.status_code == 404:
                raise
            last = e
            time.sleep(2**attempt)
    raise RuntimeError(f"{method} {url} failed: {last}")


def get(url: str, **kw) -> httpx.Response:
    return request("GET", url, **kw)


def fetch_cached(url: str, name: str, refresh: bool = False) -> Path:
    """Download `url` into the cache as `name` (unless already there)."""
    path = CACHE / name
    if path.exists() and not refresh:
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    body = get(url).content
    tmp = path.with_suffix(path.suffix + ".part")
    tmp.write_bytes(body)
    tmp.rename(path)
    return path


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()
