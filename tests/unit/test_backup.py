from __future__ import annotations

import os
import time

import pytest

from backup import (
    backup_status,
    cli,
    list_backup_files,
    maybe_initial_database_backup,
    resolve_backup_file,
    restore_backup_source,
    run_due_database_backup,
)


def test_backup_skipped_when_disabled(isolated_db, monkeypatch, tmp_path):
    monkeypatch.setattr("settings.backup_enabled", lambda: False)
    monkeypatch.setattr("settings.backup_directory", lambda: tmp_path / "backups")
    assert run_due_database_backup() is None
    assert list((tmp_path / "backups").glob("portfolio-*.db")) == []


def test_backup_writes_and_rotates(isolated_db, monkeypatch, tmp_path):
    dest = tmp_path / "backups"
    monkeypatch.setattr("settings.backup_enabled", lambda: True)
    monkeypatch.setattr("settings.backup_interval_hours", lambda: 24)
    monkeypatch.setattr("settings.backup_keep", lambda: 2)
    monkeypatch.setattr("settings.backup_directory", lambda: dest)

    first = run_due_database_backup(force=True)
    assert first is not None and first.exists()
    assert run_due_database_backup() is None

    old = time.time() - 25 * 3600
    os.utime(first, (old, old))
    second = run_due_database_backup()
    assert second is not None and second.exists()
    third = run_due_database_backup(force=True)
    assert third is not None
    files = list(dest.glob("portfolio-*.db"))
    assert len(files) == 2


def test_backup_settings_from_application_data(monkeypatch):
    from settings import backup_directory, backup_enabled, backup_interval_hours, backup_keep

    monkeypatch.setattr(
        "settings._application_data",
        lambda: {
            "backup": {
                "enabled": "true",
                "interval_hours": "12",
                "keep": "3",
                "directory": "tmp-backups",
            }
        },
    )
    assert backup_enabled() is True
    assert backup_interval_hours() == 12
    assert backup_keep() == 3
    assert backup_directory().name == "tmp-backups"


def test_initial_backup_when_folder_empty(isolated_db, monkeypatch, tmp_path):
    dest = tmp_path / "backups"
    monkeypatch.setattr("settings.backup_enabled", lambda: True)
    monkeypatch.setattr("settings.backup_interval_hours", lambda: 24)
    monkeypatch.setattr("settings.backup_keep", lambda: 2)
    monkeypatch.setattr("settings.backup_directory", lambda: dest)
    first = maybe_initial_database_backup()
    assert first is not None and first.exists()
    assert maybe_initial_database_backup() is None
    status = backup_status()
    assert status["backup_ok"] is True
    assert status["last_backup_at"]
    assert status["backup_whole_database"] is True


def test_restore_named_backup_round_trip(isolated_db, monkeypatch, tmp_path):
    dest = tmp_path / "backups"
    monkeypatch.setattr("settings.backup_directory", lambda: dest)
    from db import _connect, init_db

    init_db()
    with _connect() as conn:
        conn.execute("CREATE TABLE restore_probe (id INTEGER PRIMARY KEY)")
    path = run_due_database_backup(force=True)
    with _connect() as conn:
        conn.execute("DROP TABLE restore_probe")
    restore_backup_source(path.name)
    with _connect() as conn:
        names = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert "restore_probe" in names
    with pytest.raises(ValueError):
        resolve_backup_file("../secret.db")
    assert list_backup_files()
    assert cli(["list"]) == 0
