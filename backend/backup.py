"""Periodic SQLite backups driven by config-server properties."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from app_logging import get_logger

logger = get_logger("backup")

BACKUP_GLOB = "portfolio-*.db"

_last_ok: bool | None = None
_last_error: str | None = None
_last_at: datetime | None = None


def _backup_files(directory: Path) -> list[Path]:
    if not directory.is_dir():
        return []
    return sorted(
        [path for path in directory.glob(BACKUP_GLOB) if path.is_file()],
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )


def rotate_backups(directory: Path, *, keep: int) -> None:
    keep = max(1, int(keep))
    extras = _backup_files(directory)[keep:]
    for path in extras:
        try:
            path.unlink()
            logger.info("Removed old database backup %s", path)
        except OSError:
            logger.exception("Could not remove old database backup %s", path)


def _record_ok(path: Path) -> None:
    global _last_ok, _last_error, _last_at
    _last_ok = True
    _last_error = None
    _last_at = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)


def _record_fail(exc: BaseException) -> None:
    global _last_ok, _last_error
    _last_ok = False
    _last_error = str(exc)[:400]


def list_backup_files() -> list[dict[str, object]]:
    from settings import backup_directory

    rows = []
    for path in _backup_files(backup_directory()):
        stat = path.stat()
        rows.append(
            {
                "name": path.name,
                "size": stat.st_size,
                "modified_at": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
            }
        )
    return rows


def backup_status() -> dict[str, object]:
    from settings import backup_directory, backup_enabled, backup_interval_hours

    enabled = backup_enabled()
    newest = _backup_files(backup_directory())
    last_at = _last_at
    if last_at is None and newest:
        last_at = datetime.fromtimestamp(newest[0].stat().st_mtime, tz=timezone.utc)
    ok = True
    if enabled:
        ok = _last_error is None and bool(newest or _last_ok)
    return {
        "backup_enabled": enabled,
        "backup_ok": ok,
        "backup_interval_hours": backup_interval_hours(),
        "last_backup_at": last_at.isoformat() if last_at else None,
        "backup_error": _last_error,
        "backup_whole_database": True,
    }


def resolve_backup_file(name: str) -> Path:
    from settings import backup_directory

    directory = backup_directory().resolve()
    candidate = (directory / Path(name).name).resolve()
    if candidate.parent != directory:
        raise ValueError("Invalid backup file")
    if not candidate.name.startswith("portfolio-") or not candidate.name.endswith(".db"):
        raise ValueError("Invalid backup file")
    if not candidate.is_file():
        raise FileNotFoundError("Backup file not found")
    return candidate


def restore_backup_source(target: str) -> Path:
    """Replace the live database. Call this from the machine CLI with the app stopped."""
    from db import restore_database_from

    path = Path(target).expanduser()
    source = path.resolve() if path.is_file() else resolve_backup_file(target)
    restore_database_from(source)
    logger.info("Restored database from backup %s", source)
    return source


def restore_named_backup(name: str) -> Path:
    return restore_backup_source(name)


def maybe_initial_database_backup() -> Path | None:
    from settings import backup_directory, backup_enabled

    if not backup_enabled():
        return None
    if _backup_files(backup_directory()):
        return None
    return run_due_database_backup(force=True)


def run_due_database_backup(*, force: bool = False) -> Path | None:
    from db import DB_PATH, create_database_backup
    from settings import (
        backup_directory,
        backup_enabled,
        backup_interval_hours,
        backup_keep,
    )

    if not force and not backup_enabled():
        return None
    if not DB_PATH.exists():
        return None

    directory = backup_directory()
    interval_seconds = backup_interval_hours() * 3600
    newest = _backup_files(directory)
    if not force and newest:
        age = datetime.now(timezone.utc).timestamp() - newest[0].stat().st_mtime
        if age < interval_seconds:
            return None

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    dest = directory / f"portfolio-{stamp}-{uuid4().hex[:6]}.db"
    try:
        path = create_database_backup(dest)
        rotate_backups(directory, keep=backup_keep())
        _record_ok(path)
        logger.info("Wrote database backup %s", path)
        return path
    except Exception as exc:
        _record_fail(exc)
        logger.exception("Database backup failed")
        raise


def cli(argv: list[str] | None = None) -> int:
    import argparse

    parser = argparse.ArgumentParser(
        description="List or restore SQLite backups on this machine. Stop the app before restore."
    )
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("list", help="List backup files in the configured directory")
    restore = sub.add_parser("restore", help="Replace data/portfolio.db with a backup file")
    restore.add_argument("file", help="Backup filename in the backup directory, or a path to a .db file")
    args = parser.parse_args(argv)
    if args.command == "list":
        rows = list_backup_files()
        if not rows:
            print("No backup files found.")
            return 0
        for row in rows:
            print(f"{row['modified_at']}  {row['name']}  {row['size']} bytes")
        return 0
    source = restore_backup_source(args.file)
    print(f"Restored {source}. Start the app again.")
    return 0


if __name__ == "__main__":
    raise SystemExit(cli())
