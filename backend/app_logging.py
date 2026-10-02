"""Application file + console logging with daily rotate and monthly zip archives."""

from __future__ import annotations

import logging
import re
import zipfile
from datetime import datetime
from logging.handlers import TimedRotatingFileHandler
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
LOG_DIR = PROJECT_ROOT / "data" / "logs"
LOG_FILE = LOG_DIR / "app.log"
LOGGER_NAME = "sbp"
DAILY_LOG_RE = re.compile(r"^app\.log\.(\d{4})-(\d{2})-(\d{2})$")
MONTH_NAMES = (
    "",
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
)


class DailyLogHandler(TimedRotatingFileHandler):
    """Rotate at midnight and never delete daily files; monthly zip is separate."""

    def doRollover(self) -> None:
        super().doRollover()
        archive_completed_months(Path(self.baseFilename).parent)


def monthly_archive_name(year: int, month: int) -> str:
    return f"{MONTH_NAMES[month]}_{year}.log.archive.zip"


def archive_completed_months(log_dir: Path) -> None:
    """Zip each finished month's daily logs; keep monthly archives forever."""
    log_dir.mkdir(parents=True, exist_ok=True)
    now = datetime.now()
    grouped: dict[tuple[int, int], list[Path]] = {}
    for path in log_dir.iterdir():
        match = DAILY_LOG_RE.match(path.name)
        if not match:
            continue
        year, month = int(match.group(1)), int(match.group(2))
        if (year, month) >= (now.year, now.month):
            continue
        grouped.setdefault((year, month), []).append(path)

    logger = logging.getLogger(LOGGER_NAME)
    for (year, month), files in grouped.items():
        archive_path = log_dir / monthly_archive_name(year, month)
        files = sorted(files)
        if not archive_path.exists():
            with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
                for daily in files:
                    archive.write(daily, daily.name)
            logger.info("Archived %s daily logs into %s", len(files), archive_path.name)
        for daily in files:
            daily.unlink(missing_ok=True)


def setup_logging() -> logging.Logger:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    logger = logging.getLogger(LOGGER_NAME)
    if logger.handlers:
        archive_completed_months(LOG_DIR)
        return logger

    logger.setLevel(logging.DEBUG)
    formatter = logging.Formatter(
        "%(asctime)s %(levelname)s [%(name)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    file_handler = DailyLogHandler(
        LOG_FILE,
        when="midnight",
        interval=1,
        backupCount=0,
        encoding="utf-8",
        utc=False,
    )
    file_handler.suffix = "%Y-%m-%d"
    file_handler.extMatch = re.compile(r"^\d{4}-\d{2}-\d{2}$")
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(formatter)
    stream_handler = logging.StreamHandler()
    stream_handler.setLevel(logging.INFO)
    stream_handler.setFormatter(formatter)

    logger.addHandler(file_handler)
    logger.addHandler(stream_handler)
    logger.propagate = False
    archive_completed_months(LOG_DIR)
    logger.info(
        "Logging to %s (daily rotate; monthly zip as <Month>_<year>.log.archive.zip)",
        LOG_FILE,
    )
    return logger


def get_logger(name: str | None = None) -> logging.Logger:
    if name:
        return logging.getLogger(f"{LOGGER_NAME}.{name}")
    return logging.getLogger(LOGGER_NAME)
