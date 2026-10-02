"""Cap concurrent Yahoo Finance HTTP sessions to avoid FD exhaustion."""

from __future__ import annotations

import threading
from contextlib import contextmanager

_YF_LOCK = threading.Semaphore(3)


@contextmanager
def yfinance_slot():
    _YF_LOCK.acquire()
    try:
        yield
    finally:
        _YF_LOCK.release()
