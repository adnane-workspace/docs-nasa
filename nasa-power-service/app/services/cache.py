"""File cache for raw NASA JSON, normalized CSV, and geocoding results."""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import date
from pathlib import Path

logger = logging.getLogger(__name__)


class FileCache:
    """Store cache files under ``data/raw``, ``data/processed``, and ``data/geocode``."""

    def __init__(self, root: Path) -> None:
        self.root = root
        self.raw_dir = root / "raw"
        self.processed_dir = root / "processed"
        self.geocode_dir = root / "geocode"
        self.smap_dir = root / "smap"
        self.smap_gee_dir = root / "smap_gee"
        for directory in (self.raw_dir, self.processed_dir, self.geocode_dir, self.smap_dir, self.smap_gee_dir):
            directory.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def climate_key(
        *,
        latitude: float,
        longitude: float,
        start_date: date,
        end_date: date,
        parameters: tuple[str, ...] | list[str],
        community: str,
        time_standard: str,
    ) -> str:
        identity = "|".join(
            [
                community,
                time_standard,
                f"{latitude:.4f}",
                f"{longitude:.4f}",
                start_date.isoformat(),
                end_date.isoformat(),
                ",".join(parameters),
            ]
        )
        digest = hashlib.sha256(identity.encode("utf-8")).hexdigest()[:16]
        return (
            f"{latitude:.4f}_{longitude:.4f}_"
            f"{start_date.strftime('%Y%m%d')}_{end_date.strftime('%Y%m%d')}_{digest}"
        )

    @staticmethod
    def geocode_key(city: str) -> str:
        normalized = " ".join(city.casefold().split())
        return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:24]

    def raw_path(self, key: str) -> Path:
        return self.raw_dir / f"{key}.json"

    def meta_path(self, key: str) -> Path:
        return self.raw_dir / f"{key}.meta.json"

    def csv_path(self, key: str) -> Path:
        return self.processed_dir / f"{key}.csv"

    def geocode_path(self, city: str) -> Path:
        return self.geocode_dir / f"{self.geocode_key(city)}.json"

    @staticmethod
    def reverse_geocode_key(latitude: float, longitude: float) -> str:
        return f"rev_{latitude:.4f}_{longitude:.4f}"

    def reverse_geocode_path(self, latitude: float, longitude: float) -> Path:
        return self.geocode_dir / f"{self.reverse_geocode_key(latitude, longitude)}.json"

    def smap_path(self, key: str) -> Path:
        return self.smap_dir / f"{key}.json"

    def smap_gee_path(self, key: str) -> Path:
        return self.smap_gee_dir / f"{key}.json"

    @staticmethod
    def smap_gee_key(
        *,
        latitude: float,
        longitude: float,
        start_date: date,
        end_date: date,
        mode: str,
        scale: int,
    ) -> str:
        identity = f"{latitude:.4f}|{longitude:.4f}|{start_date.isoformat()}|{end_date.isoformat()}|{mode}|{scale}"
        digest = hashlib.sha256(identity.encode("utf-8")).hexdigest()[:16]
        return f"smap_gee_{latitude:.4f}_{longitude:.4f}_{start_date.strftime('%Y%m%d')}_{end_date.strftime('%Y%m%d')}_{mode}_{digest}"

    def read_json(self, path: Path) -> dict | None:
        if not path.is_file():
            return None
        try:
            payload = json.loads(path.read_text(encoding="utf-8-sig"))
        except (OSError, json.JSONDecodeError):
            logger.warning("Ignoring unreadable cache file %s", path.name)
            return None
        if not isinstance(payload, dict):
            logger.warning("Ignoring cache file %s because it is not a JSON object", path.name)
            return None
        return payload

    def read_text(self, path: Path) -> str | None:
        if not path.is_file():
            return None
        try:
            return path.read_text(encoding="utf-8")
        except OSError:
            logger.warning("Ignoring unreadable cache file %s", path.name)
            return None

    def write_bytes(self, path: Path, data: bytes) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_name(path.name + ".tmp")
        temporary.write_bytes(data)
        temporary.replace(path)

    def write_json(self, path: Path, payload: dict) -> None:
        encoded = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
        self.write_bytes(path, encoded)

    def write_text(self, path: Path, text: str) -> None:
        self.write_bytes(path, text.encode("utf-8"))
