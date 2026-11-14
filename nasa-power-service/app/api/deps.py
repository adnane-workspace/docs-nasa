"""FastAPI dependencies."""

from __future__ import annotations

import httpx
from fastapi import Request

from app.core.config import Settings, get_settings
from app.services.cache import FileCache
from app.services.climate_service import ClimateDataService
from app.services.geocoding import GeocodingService
from app.services.nasa_power import NasaPowerClient
from app.services.smap import SmapService


def build_climate_service(settings: Settings, http_client: httpx.AsyncClient) -> ClimateDataService:
    cache = FileCache(settings.cache_dir)
    return ClimateDataService(
        settings,
        NasaPowerClient(settings, cache, http_client),
        GeocodingService(settings, cache, http_client),
    )


def build_smap_service(settings: Settings, http_client: httpx.AsyncClient) -> SmapService:
    cache = FileCache(settings.cache_dir)
    return SmapService(
        settings,
        cache,
        http_client,
        GeocodingService(settings, cache, http_client),
    )


def get_climate_service(request: Request) -> ClimateDataService:
    service = getattr(request.app.state, "climate_service", None)
    if service is None:
        raise RuntimeError("Climate service is not initialized.")
    return service


def get_smap_service(request: Request) -> SmapService:
    service = getattr(request.app.state, "smap_service", None)
    if service is None:
        raise RuntimeError("SMAP service is not initialized.")
    return service


def build_http_client(settings: Settings) -> httpx.AsyncClient:
    timeout = httpx.Timeout(
        settings.nasa_power_timeout_seconds,
        connect=settings.http_connect_timeout_seconds,
    )
    return httpx.AsyncClient(
        timeout=timeout,
        follow_redirects=True,
        headers={"User-Agent": settings.http_user_agent},
    )


def get_app_settings(request: Request) -> Settings:
    settings = getattr(request.app.state, "settings", None)
    if settings is None:
        return get_settings()
    return settings
