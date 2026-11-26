"""The browser checker (TypeScript) and the evaluation engine (Python) must agree exactly."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

from common.rules import engine

ROOT = Path(__file__).resolve().parents[1]
CASES = json.loads((ROOT / "tests" / "parity_cases.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def ts_results():
    node = shutil.which("node")
    if not node or not (ROOT / "frontend" / "node_modules" / "esbuild").is_dir():
        pytest.skip("node or frontend/node_modules not available")
    out = subprocess.run([node, str(ROOT / "scripts" / "parity.mjs")], capture_output=True, check=True, timeout=120)
    return json.loads(out.stdout.decode("utf-8"))


@pytest.mark.parametrize("i", range(len(CASES)))
def test_same_verdict(ts_results, i):
    e = engine()
    norm = e.normalise(CASES[i])
    v = e.evaluate(norm)
    py = {"normalised": norm, "tier": v.tier, "score": v.score, "family": v.family, "matched": [m.id for m in v.matched]}
    assert ts_results[i] == py
