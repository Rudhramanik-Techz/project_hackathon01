"""Per-request stage timings. Returned in the OCR response and logged; never stored (v3 has no trace lookup)."""
from __future__ import annotations

import time
from contextlib import contextmanager
from typing import Iterator


class Tracer:
    def __init__(self) -> None:
        self.stages: dict[str, int] = {}
        self._start = time.monotonic()

    @contextmanager
    def stage(self, name: str) -> Iterator[None]:
        t0 = time.monotonic()
        try:
            yield
        finally:
            self.stages[name] = self.stages.get(name, 0) + int((time.monotonic() - t0) * 1000)

    def total_ms(self) -> int:
        return int((time.monotonic() - self._start) * 1000)
