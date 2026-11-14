"""Tests for NVIDIA Nemotron AI Intelligence integration."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.ai import AiChatRequest, AiLocationContext
from app.services.ai_nemotron import NvidiaNemotronService


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def test_ai_health_endpoint(client: TestClient) -> None:
    res = client.get("/api/ai/health")
    assert res.status_code == 200
    data = res.json()
    assert "status" in data
    assert "nvidia/nemotron-3.5-super-vl-120b-a12b" in data["model"]
    assert len(data["services_connected"]) >= 3


def test_language_detection() -> None:
    service = NvidiaNemotronService(MagicMock(), MagicMock())
    
    # Darija in Arabic script
    assert service.detect_language("واش رطوبة التربة كافية للقمح فمكناس؟") == "darija"
    assert service.detect_language("شنو هي حالة الخزان المائي ديال الأرض؟") == "darija"
    assert service.detect_language("kifach nesqi l-fella7a dial zra3?") == "darija"

    # French
    assert service.detect_language("Quel est le niveau d'humidité du sol pour l'irrigation ?") == "fr"
    assert service.detect_language("Analyse le profil thermique des couches du sol") == "fr"

    # English
    assert service.detect_language("What is the root-zone soil moisture and drought percentile?") == "en"
    assert service.detect_language("Explain water balance and evapotranspiration") == "en"


def test_ai_chat_mocked_success(client: TestClient) -> None:
    mock_nvidia_reply = {
        "id": "chatcmpl-test",
        "choices": [
            {
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": "على حساب بيانات قمر NASA SMAP فمكناس لسنة 2025، رطوبة منطقة الجذور هي 0.299 m³/m³ ومعدل الشتا واصل لـ 420 ملم.",
                },
                "finish_reason": "stop",
            }
        ],
        "usage": {"total_tokens": 120},
    }

    req_payload = {
        "message": "واش كاين إجهاد مائي فمكناس لسنة 2025؟",
        "location": {"name": "Meknes, Morocco", "latitude": 33.89, "longitude": -5.55},
        "year": 2025,
        "mode": "agricultural",
        "language": "darija",
    }

    with patch("httpx.AsyncClient.post") as mock_post:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = mock_nvidia_reply
        mock_post.return_value = mock_resp

        res = client.post("/api/ai/chat", json=req_payload)
        assert res.status_code == 200
        data = res.json()

        assert "0.299" in data["reply"]
        assert data["language_detected"] == "darija"
        assert "NASA SMAP Level-4 SPL4SMGP V008 (~9-11 km)" in data["sources_used"]
        assert len(data["specialists_consulted"]) == 4
        assert data["validation_status"] == "validated"


def test_ai_chat_chart_focus(client: TestClient) -> None:
    mock_nvidia_reply = {
        "choices": [
            {
                "message": {
                    "role": "assistant",
                    "content": "Ce graphique montre l'évolution de l'humidité racinaire (sm_rootzone).",
                }
            }
        ]
    }

    req_payload = {
        "message": "Explique-moi ce graphique de l'humidité",
        "location": {"name": "Tanger, Maroc", "latitude": 35.77, "longitude": -5.81},
        "year": 2025,
        "chart_id": "moisture",
        "variable_id": "sm_rootzone",
        "language": "fr",
    }

    with patch("httpx.AsyncClient.post") as mock_post:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = mock_nvidia_reply
        mock_post.return_value = mock_resp

        res = client.post("/api/ai/chat", json=req_payload)
        assert res.status_code == 200
        data = res.json()
        assert data["language_detected"] == "fr"


def test_ai_chat_fallback_when_api_error(client: TestClient) -> None:
    req_payload = {
        "message": "What is the drought situation in Meknes for 2025?",
        "location": {"name": "Meknes, Morocco", "latitude": 33.89, "longitude": -5.55},
        "year": 2025,
        "language": "en",
    }

    with patch("httpx.AsyncClient.post", side_effect=Exception("Connection refused")):
        res = client.post("/api/ai/chat", json=req_payload)
        assert res.status_code == 200
        data = res.json()
        # Fallback still returns evidence-grounded response
        assert "Root-zone soil moisture" in data["reply"]
        assert data["validation_status"] in ("validated", "partial")
        assert len(data["sources_used"]) >= 1


def test_ai_chat_stream_endpoint(client: TestClient) -> None:
    req_payload = {
        "message": "Tell me about Meknes soil moisture",
        "location": {"name": "Meknes, Morocco", "latitude": 33.89, "longitude": -5.55},
        "year": 2025,
    }

    # Stream should return SSE data lines
    with patch("httpx.AsyncClient.stream") as mock_stream:
        # Mock SSE streaming response context manager
        mock_response = MagicMock()
        mock_response.status_code = 200
        async def mock_lines():
            yield 'data: {"choices": [{"delta": {"content": "Meknes soil moisture "}}]}'
            yield 'data: {"choices": [{"delta": {"content": "is optimal in 2025."}}]}'
            yield 'data: [DONE]'
        mock_response.aiter_lines = mock_lines
        
        # Async context manager mock
        cm = MagicMock()
        cm.__aenter__ = AsyncMock(return_value=mock_response)
        cm.__aexit__ = AsyncMock(return_value=None)
        mock_stream.return_value = cm

        res = client.post("/api/ai/chat/stream", json=req_payload)
        assert res.status_code == 200
        assert "text/event-stream" in res.headers["content-type"]
        text = res.text
        assert "meta" in text
        assert "delta" in text


def test_simulation_endpoint_baseline(client: TestClient) -> None:
    req_payload = {
        "location": {"name": "Meknes, Morocco", "latitude": 33.89, "longitude": -5.55},
        "year": 2025,
        "soil_type": "limoneux_profond",
        "water_access": "appoint",
        "budget": "moyen",
        "climate_shock": "none",
    }
    res = client.post("/api/ai/simulate", json=req_payload)
    assert res.status_code == 200
    data = res.json()
    assert len(data["plans"]) == 3
    assert data["winner_plan_id"] in ["plan_rotation_triennale", "plan_agroecologie", "plan_monoculture"]
    assert len(data["tribunal_verdicts"]) == 4
    assert "الخطة" in data["overall_synthesis_darija"]
    assert len(data["radar_dimensions"]) == 5


def test_simulation_endpoint_climate_shock(client: TestClient) -> None:
    req_payload = {
        "location": {"name": "Meknes, Morocco", "latitude": 33.89, "longitude": -5.55},
        "year": 2025,
        "soil_type": "argileux_lourd",
        "water_access": "bour",
        "budget": "faible",
        "climate_shock": "drought",
    }
    res = client.post("/api/ai/simulate", json=req_payload)
    assert res.status_code == 200
    data = res.json()
    assert data["shock_applied"] == "drought"
    # Plan 1 (monoculture) water stress should be elevated under drought
    p1 = next(p for p in data["plans"] if p["id"] == "plan_monoculture")
    assert p1["water_stress_risk_pct"] > 30.0

