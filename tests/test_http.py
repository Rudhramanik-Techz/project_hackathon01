from common.errors import ApiError
from common.http import api_handler


@api_handler("POST /api/test")
def _boom(req):
    raise RuntimeError("internal detail with user text: CBI calling")


@api_handler("POST /api/test")
def _api_error(req):
    raise ApiError(422, "INVALID_IMAGE")


@api_handler("POST /api/test")
def _echo(req):
    return 200, {"keys": sorted(req.json_body(1024).keys()), "requestId": req.request_id}


def test_unexpected_error_returns_v3_envelope_without_details(call, capsys):
    status, body, _ = call(_boom, "POST", "/api/test", json_body={})
    assert status == 500 and body["v"] == 3 and body["error"]["code"] == "INTERNAL"
    assert set(body["error"]) == {"code", "requestId"}
    assert "CBI" not in capsys.readouterr().out


def test_api_error_uses_envelope_and_fresh_request_id(call):
    status, body, headers = call(_api_error, "POST", "/api/test", json_body={})
    assert status == 422 and body == {"v": 3, "error": {"code": "INVALID_IMAGE", "requestId": headers["x-request-id"]}}


def test_invalid_or_oversized_json_is_400(call):
    assert call(_echo, "POST", "/api/test", raw_body=b"{not json")[0] == 400
    assert call(_echo, "POST", "/api/test", raw_body=b'{"a":"' + b"x" * 2000 + b'"}')[0] == 400


def test_valid_body(call):
    status, body, _ = call(_echo, "POST", "/api/test", json_body={"b": 1, "a": 2})
    assert status == 200 and body["keys"] == ["a", "b"]
