import base64
import gzip
import importlib.util
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture
def site(tmp_path, monkeypatch):
    spec = importlib.util.spec_from_file_location("static_site_handler", ROOT / "static_site" / "handler.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<html>1930 shell</html>" + " " * 2000, encoding="utf-8")
    (dist / "assets" / "app-abc.js").write_text("console.log(1);" * 200, encoding="utf-8")
    (dist / "samples").mkdir()
    (dist / "samples" / "a.jpg").write_bytes(b"\xff\xd8\xff" + b"\0" * 50)
    (tmp_path / "secret.txt").write_text("outside dist", encoding="utf-8")
    monkeypatch.setattr(mod, "ROOT", dist.resolve())
    mod._read.cache_clear()
    return mod


def get(site, path, gzip_ok=False):
    event = {"rawPath": path, "headers": {"accept-encoding": "gzip"} if gzip_ok else {}}
    r = site.handler(event, None)
    body = base64.b64decode(r["body"]) if r.get("isBase64Encoded") else r["body"].encode()
    if r["headers"].get("content-encoding") == "gzip":
        body = gzip.decompress(body)
    return r["statusCode"], r["headers"], body


def test_index_and_spa_fallback(site):
    for path in ("/", "/paid", "/some/route"):
        status, headers, body = get(site, path)
        assert status == 200 and b"1930 shell" in body
        assert headers["cache-control"] == "no-cache"
        assert "frame-ancestors 'none'" in headers["content-security-policy"]


def test_hashed_asset_is_immutable_and_gzipped(site):
    status, headers, body = get(site, "/assets/app-abc.js", gzip_ok=True)
    assert status == 200 and headers["content-encoding"] == "gzip" and body.startswith(b"console.log")
    assert "immutable" in headers["cache-control"] and headers["content-type"].startswith("text/javascript")


def test_binary_asset(site):
    status, headers, body = get(site, "/samples/a.jpg")
    assert status == 200 and headers["content-type"] == "image/jpeg" and body.startswith(b"\xff\xd8\xff")


def test_missing_asset_is_404_not_shell(site):
    status, _, body = get(site, "/assets/missing-chunk.js")
    assert status == 404 and b"shell" not in body


def test_path_traversal_blocked(site):
    status, _, body = get(site, "/../secret.txt")
    assert status == 404 and b"outside" not in body


def test_api_paths_get_json_404(site):
    r = site.handler({"rawPath": "/api/v3/nope", "headers": {}}, None)
    assert r["statusCode"] == 404 and json.loads(r["body"])["error"]["code"] == "UNKNOWN_ROUTE"


def test_head_matches_get_without_a_body(site):
    for path, status in (("/", 200), ("/assets/app-abc.js", 200), ("/assets/missing.js", 404)):
        event = {"rawPath": path, "headers": {"accept-encoding": "gzip"}, "requestContext": {"http": {"method": "HEAD"}}}
        r = site.handler(event, None)
        assert r["statusCode"] == status and r["body"] == ""
        assert "content-encoding" not in r["headers"]
        assert "frame-ancestors 'none'" in r["headers"]["content-security-policy"]
