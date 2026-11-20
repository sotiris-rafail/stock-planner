#!/usr/bin/env python3
"""List or restore SQLite backups on this machine. Stop the web app first."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from backup import cli  # noqa: E402

if __name__ == "__main__":
    raise SystemExit(cli())
