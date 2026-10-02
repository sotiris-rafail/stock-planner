#!/usr/bin/env python3
"""Create application.yml, properties.yml, and values.yml with dummy defaults."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from settings import prepare_config_files  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Create application.yml, properties.yml, and values.yml with dummy defaults."
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite existing .yml files (destroys local SMTP and secret edits).",
    )
    args = parser.parse_args()
    created = prepare_config_files(overwrite=args.force)
    if created:
        for path in created:
            print(f"Created {path.name}")
    else:
        print("Config files already exist. Use --force to replace them with dummy defaults.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
