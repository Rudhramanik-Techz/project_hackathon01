import json

from common.log import REDACTED_KEYS, log_event, redact


def test_redacts_sensitive_keys_at_every_level():
    payload = {
        "requestId": "r1",
        "text": "CBI calling, stay on video call",
        "notes": "my notes",
        "images": ["aGVsbG8="],
        "transactions": [{"amount": 48000, "utr": "412345678901", "vpa": "x@ybl", "flags": ["ok"]}],
        "nested": {"deeper": {"TEXT": "upper-case key", "keep": 1}},
    }
    out = redact(payload)
    assert out == {
        "requestId": "r1",
        "transactions": [{"flags": ["ok"]}],
        "nested": {"deeper": {"keep": 1}},
    }


def test_log_event_never_prints_sensitive_values(capsys):
    log_event(requestId="r2", route="POST /api/check", body={"text": "secret message", "lang": "hi"},
              amount=48000, utr="412345678901")
    line = capsys.readouterr().out.strip()
    record = json.loads(line)
    assert record == {"requestId": "r2", "route": "POST /api/check", "body": {"lang": "hi"}}
    for word in ("secret message", "48000", "412345678901"):
        assert word not in line


def test_redacted_keys_match_spec():
    assert REDACTED_KEYS == {"text", "images", "notes", "amount", "utr", "vpa"}
