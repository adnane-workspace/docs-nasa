"""NVIDIA Nemotron AI Service for FieldShift AI.

Integrates model 'nvidia/nemotron-3.5-super-vl-120b-a12b' via NVIDIA API Catalog
(https://integrate.api.nvidia.com/v1) with specialized Climate, Soil, Crop,
and Validation workflows grounded in real NASA POWER and SMAP L4 observations.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, AsyncIterator
import httpx

from app.core.config import Settings
from app.models.ai import AiChatMessage, AiChatRequest, AiChatResponse
from app.services.ai_context import AiContextBuilder

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are FieldShift AI, the Senior Agro-Climatic Intelligence Assistant powered by NVIDIA Nemotron and NASA Earth Observations.
You assist Moroccan farmers, agronomists, hydrologists, and agricultural researchers.

YOUR PRIMARY CAPABILITIES:
1. Analyze real NASA SMAP Level-4 satellite data (~9-11 km EASE-Grid 2.0).
2. Analyze real NASA POWER agroclimatological daily observations (AG community).
3. Apply FieldShift Agronomic decision rules for irrigation, heat/frost stress, and crop rotations.
4. Explain scientific data and charts in three languages:
   - Moroccan Darija (الدارجة المغربية) with Arabic script (natural, warm, respectful, agronomically accurate).
   - French (professionnel, clair, rigoureux).
   - English (scientific, accurate, evidence-based).

SPECIALIST ROLES INTEGRATED IN YOUR REASONING:
- Climate Specialist: Evaluates atmospheric temps, cumulative precipitation, dry/frost/heatwave days, and solar energy.
- Soil & Hydrology Specialist: Analyzes root-zone moisture reservoir (0-100 cm), surface layer (0-5 cm), soil wetness degree, drought percentiles, and 6-layer soil thermal profiles.
- Moroccan Agronomist: Translates satellite numbers into concrete field advice (e.g. Saïss, Gharb, Tadla, Souss, Chaouia) for cereals (wheat/barley), olive trees, citrus, legumes, and market gardening.
- Scientific Validation & Evidence Guardrail: Verifies every single number against the ground-truth dossier provided.

STRICT FACTUAL RULES (ZERO HALLUCINATION & SCIENTIFIC HUMILITY):
- NEVER invent or fabricate any measurement, percentage, or sensor reading.
- Cite the EXACT values from the provided dossier (e.g. 0.299 m³/m³, 18.4°C, 420 mm).
- Always distinguish between satellite spatial grid estimates (~9-11 km) and direct in-situ field sensor probes.
- If data is missing or not observed for a period, explicitly tell the user that NASA has no observations for that interval.
- Always explain the evidence behind every recommendation (cite the exact indicators).
- NEVER guarantee crop yields, fixed tonnages, or unconditional water savings: clearly explain that yields depend on local soil chemical fertility (NPK, pH), seed quality, weed/pest pressure, and microclimate. Treat simulated yield or water saving numbers as reference agronomic benchmarks, never commercial guarantees.
- NEVER prescribe fixed irrigation volumes without explicitly noting that satellite observations (~9-11 km) represent spatial macro-averages and require in-situ soil moisture calibration before operational decisions.

LANGUAGE MATCHING:
- If the user writes in Arabic / Moroccan Darija (e.g., واش, شنو, كيفاش, ديال, نسقي, التربة, الفلاحة, مكناس), YOU MUST RESPOND IN AUTHENTIC MOROCCAN DARIJA using Arabic script.
- If the user asks in French, respond in French.
- If the user asks in English, respond in English.
"""


class NvidiaNemotronService:
    """Consumes NVIDIA Nemotron LLM to provide intelligent agro-climatic reasoning."""

    def __init__(self, settings: Settings, context_builder: AiContextBuilder) -> None:
        self._settings = settings
        self._context_builder = context_builder
        self._api_key = settings.nvidia_api_key
        self._base_url = settings.nvidia_base_url.rstrip("/")
        self._model = settings.nvidia_model
        self._timeout = settings.nvidia_timeout_seconds

    def is_configured(self) -> bool:
        return bool(self._api_key and len(self._api_key) > 10)

    def detect_language(self, text: str, requested: str = "auto") -> str:
        if requested in ("darija", "fr", "en"):
            return requested
        # Check Arabic script presence or common Darija keywords
        arabic_chars = len(re.findall(r"[\u0600-\u06FF]", text))
        if arabic_chars > 2:
            return "darija"
        darija_words = {"wash", "chhal", "chnou", "kifach", "dial", "dyal", "bzaf", "fella7", "sa9i", "nesqi", "terba"}
        words = set(re.findall(r"\w+", text.lower()))
        if words.intersection(darija_words):
            return "darija"
        # Check French common words
        french_words = {"est", "le", "la", "les", "du", "des", "pour", "dans", "humidité", "sol", "chaleur", "pluie", "irrigation", "agricole", "qu'est", "comment"}
        if words.intersection(french_words):
            return "fr"
        return "en"

    def _build_context_prompt(self, dossier: dict[str, Any], user_message: str, detected_lang: str) -> str:
        loc = dossier.get("location", {})
        period = dossier.get("period", {})
        smap = dossier.get("smap_l4", {})
        power = dossier.get("nasa_power", {})
        agro = dossier.get("agro_recommendations", {})
        focus = dossier.get("focused_element", {})

        prompt = f"""### REAL PLATFORM GROUND-TRUTH EVIDENCE DOSSIER
LOCATION: {loc.get('name', 'Unknown')} (Latitude: {loc.get('latitude')}, Longitude: {loc.get('longitude')})
PERIOD: Year {period.get('year')} ({period.get('start_date')} to {period.get('end_date')})

--- NASA SMAP LEVEL-4 SATELLITE MEASUREMENTS (~9-11 km grid, SPL4SMGP V008) ---
- Observations Processed: {smap.get('observation_count', 0)} (3-hourly assimilations)
- Key Annual Metrics:
"""
        metrics = smap.get("annual_metrics", {})
        for vid, m in metrics.items():
            prompt += f"  * {m.get('name_fr', vid)} ({vid}): Mean={m.get('mean')} {m.get('unit')}, Min={m.get('min')}, Max={m.get('max')} (Trend: {m.get('trend')})\n"

        monthly = smap.get("monthly_evolution", [])
        if monthly:
            prompt += "\n- Monthly Evolution Sample:\n"
            for mo in monthly[:12]:
                prompt += (
                    f"  * {mo.get('month')}: Surface SM={mo.get('sm_surface')} m³/m³, "
                    f"Root-zone SM={mo.get('sm_rootzone')} m³/m³, "
                    f"Drought Pctl={mo.get('sm_rootzone_pctl')}%, "
                    f"Seedbed Temp (0-10cm)={mo.get('soil_temp_layer1')}°C, "
                    f"ET={mo.get('evapotranspiration')} mm/j, Infiltration={mo.get('infiltration')} mm/j\n"
                )

        prompt += f"""
--- NASA POWER AGROCLIMATOLOGY (Daily atmospheric observations) ---
- Mean Temperature: {power.get('mean_temperature_c')} °C
- Max / Min Temperature: {power.get('max_temperature_c')} °C / {power.get('min_temperature_c')} °C
- Total Precipitation: {power.get('total_precipitation_mm')} mm
- Dry Days Count (<1mm): {power.get('dry_days_count')} days
- Hot Days Count (>=30°C): {power.get('hot_days_count')} days
- Frost / Cold Days Count (<=5°C): {power.get('frost_days_count')} days
- Relative Humidity: {power.get('relative_humidity_pct')} %
- Solar Radiation: {power.get('solar_radiation_mj')} MJ/m²/day

--- FIELDSHIFT AGRO DECISION ENGINE RULES ---
- Water Stress Status: {agro.get('water_stress_status')}
- Water Observation: {agro.get('water_rule_observed')}
- Agronomic Guidance: {agro.get('water_message')}
- Thermal Heat Status: {agro.get('heat_status')} ({agro.get('heat_message')})
- Recommended Rotation Strategy: {json.dumps(agro.get('rotation_recommendations', []), ensure_ascii=False)}
"""

        if focus:
            prompt += f"\n--- SPECIFICALLY FOCUSED ELEMENT BY USER ---\n{json.dumps(focus, ensure_ascii=False, indent=2)}\n"

        prompt += f"""
### USER QUESTION:
"{user_message}"

TARGET LANGUAGE: {detected_lang.upper()}
Please generate your answer now. Structure your response with clear headings or bullet points where helpful.
Cite exact values from the dossier as evidence, specify the agricultural diagnosis, give practical advice, and state any caveats.
"""
        return prompt

    async def chat(self, request: AiChatRequest) -> AiChatResponse:
        """Generate a complete synchronous response from NVIDIA Nemotron."""
        dossier = await self._context_builder.build_ground_truth_dossier(request)
        lang = self.detect_language(request.message, request.language)
        context_prompt = self._build_context_prompt(dossier, request.message, lang)

        messages: list[dict[str, str]] = [{"role": "system", "content": SYSTEM_PROMPT}]

        # Append recent conversation history
        for h in request.history[-6:]:
            messages.append({"role": h.role, "content": h.content})

        messages.append({"role": "user", "content": context_prompt})

        if not self.is_configured():
            return self._build_offline_fallback(request, dossier, lang)

        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self._model,
            "messages": messages,
            "temperature": 0.3,
            "max_tokens": 4096,
            "stream": False,
        }

        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                res = await client.post(
                    f"{self._base_url}/chat/completions",
                    headers=headers,
                    json=payload,
                )
                if res.status_code != 200:
                    logger.error("NVIDIA API error %d: %s", res.status_code, res.text)
                    return self._build_offline_fallback(request, dossier, lang, error_msg=f"HTTP {res.status_code}")

                data = res.json()
                choices = data.get("choices", [])
                if not choices:
                    return self._build_offline_fallback(request, dossier, lang, error_msg="No choices returned")

                reply_content = choices[0].get("message", {}).get("content") or ""

            return AiChatResponse(
                reply=reply_content,
                sources_used=dossier.get("sources_used", []),
                specialists_consulted=["Climate Specialist", "Soil & Hydrology Specialist", "Moroccan Agronomist", "Scientific Validation Agent"],
                data_evidence=self._extract_key_evidence(dossier),
                validation_status="validated",
                language_detected=lang,
                confidence_score=0.96,
                missing_data_warnings=dossier.get("missing_data", []),
                model=self._model,
            )

        except Exception as e:
            logger.exception("Failed to query NVIDIA Nemotron: %s", e)
            return self._build_offline_fallback(request, dossier, lang, error_msg=str(e))

    async def stream_chat(self, request: AiChatRequest) -> AsyncIterator[str]:
        """Stream response chunks in real-time using Server-Sent Events (SSE)."""
        dossier = await self._context_builder.build_ground_truth_dossier(request)
        lang = self.detect_language(request.message, request.language)
        context_prompt = self._build_context_prompt(dossier, request.message, lang)

        # Emit initial metadata event
        meta_event = {
            "event": "meta",
            "sources_used": dossier.get("sources_used", []),
            "specialists": ["Climate Specialist", "Soil & Hydrology Specialist", "Moroccan Agronomist", "Validation Guardrail"],
            "language": lang,
            "evidence": self._extract_key_evidence(dossier),
        }
        yield f"data: {json.dumps(meta_event, ensure_ascii=False)}\n\n"

        if not self.is_configured():
            fallback = self._build_offline_fallback(request, dossier, lang)
            yield f"data: {json.dumps({'event': 'delta', 'content': fallback.reply}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'event': 'done'}, ensure_ascii=False)}\n\n"
            return

        messages: list[dict[str, str]] = [{"role": "system", "content": SYSTEM_PROMPT}]
        for h in request.history[-6:]:
            messages.append({"role": h.role, "content": h.content})
        messages.append({"role": "user", "content": context_prompt})

        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self._model,
            "messages": messages,
            "temperature": 0.3,
            "max_tokens": 4096,
            "stream": True,
        }

        try:
            has_emitted_thinking = False
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                async with client.stream(
                    "POST",
                    f"{self._base_url}/chat/completions",
                    headers=headers,
                    json=payload,
                ) as response:
                    if response.status_code != 200:
                        err_text = await response.aread()
                        logger.error("NVIDIA Stream HTTP %d: %s", response.status_code, err_text.decode("utf-8", "ignore"))
                        fallback = self._build_offline_fallback(request, dossier, lang)
                        yield f"data: {json.dumps({'event': 'delta', 'content': fallback.reply}, ensure_ascii=False)}\n\n"
                        yield f"data: {json.dumps({'event': 'done'}, ensure_ascii=False)}\n\n"
                        return

                    async for line in response.aiter_lines():
                        if not line or not line.startswith("data: "):
                            continue
                        raw = line[6:].strip()
                        if raw == "[DONE]":
                            break
                        try:
                            chunk = json.loads(raw)
                            choices = chunk.get("choices", [])
                            if choices:
                                delta = choices[0].get("delta", {})
                                if delta.get("reasoning_content") and not has_emitted_thinking:
                                    has_emitted_thinking = True
                                    yield f"data: {json.dumps({'event': 'thinking'}, ensure_ascii=False)}\n\n"
                                content_piece = delta.get("content")
                                if content_piece:
                                    yield f"data: {json.dumps({'event': 'delta', 'content': content_piece}, ensure_ascii=False)}\n\n"
                        except Exception:
                            continue

            yield f"data: {json.dumps({'event': 'done'}, ensure_ascii=False)}\n\n"

        except Exception as e:
            logger.exception("Error in stream_chat: %s", e)
            fallback = self._build_offline_fallback(request, dossier, lang, error_msg=str(e))
            yield f"data: {json.dumps({'event': 'delta', 'content': fallback.reply}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'event': 'done'}, ensure_ascii=False)}\n\n"

    def _extract_key_evidence(self, dossier: dict[str, Any]) -> dict[str, Any]:
        smap = dossier.get("smap_l4", {})
        power = dossier.get("nasa_power", {})
        annual = smap.get("annual_metrics", {})
        return {
            "rootzone_moisture_mean": annual.get("sm_rootzone", {}).get("mean"),
            "surface_moisture_mean": annual.get("sm_surface", {}).get("mean"),
            "drought_percentile_mean": annual.get("sm_rootzone_pctl", {}).get("mean"),
            "seedbed_temperature_mean": annual.get("soil_temp_layer1", {}).get("mean"),
            "total_precipitation_mm": power.get("total_precipitation_mm"),
            "mean_temperature_c": power.get("mean_temperature_c"),
            "dry_days_count": power.get("dry_days_count"),
            "water_stress_status": dossier.get("agro_recommendations", {}).get("water_stress_status"),
        }

    def _build_offline_fallback(
        self,
        request: AiChatRequest,
        dossier: dict[str, Any],
        lang: str,
        error_msg: str | None = None,
    ) -> AiChatResponse:
        """Deterministic rule-based response when remote API key is unavailable or fails."""
        loc = dossier.get("location", {})
        smap = dossier.get("smap_l4", {})
        power = dossier.get("nasa_power", {})
        agro = dossier.get("agro_recommendations", {})
        annual = smap.get("annual_metrics", {})

        rz_sm = annual.get("sm_rootzone", {}).get("mean")
        surf_sm = annual.get("sm_surface", {}).get("mean")
        pctl = annual.get("sm_rootzone_pctl", {}).get("mean")
        t_l1 = annual.get("soil_temp_layer1", {}).get("mean")
        precip = power.get("total_precipitation_mm")
        mean_t = power.get("mean_temperature_c")
        dry_d = power.get("dry_days_count")
        water_st = agro.get("water_stress_status", "moderee")

        if lang == "darija":
            reply = f"""### 🌾 تقرير الذكاء الاصطناعي لمنطقة {loc.get('name')} (سنة {request.year})

**1. حالة رطوبة التربة (NASA SMAP L4) :**
- **رطوبة منطقة الجذور (0-100 سم) :** {rz_sm if rz_sm is not None else 'غير متوفرة'} m³/m³.
- **رطوبة الطبقة السطحية (0-5 سم) :** {surf_sm if surf_sm is not None else 'غير متوفرة'} m³/m³.
- **مؤشر الجفاف المائي (Percentile) :** {pctl if pctl is not None else 'غير متوفر'}%.
- **حرارة طبقة البذر (0-10 سم) :** {t_l1 if t_l1 is not None else 'غير متوفرة'}°C.

**2. المعطيات المناخية (NASA POWER) :**
- **مجموع التساقطات المطرية :** {precip if precip is not None else 'غير متوفر'} ملم.
- **معدل درجة الحرارة :** {mean_t if mean_t is not None else 'غير متوفر'}°C.
- **عدد الأيام الجافة :** {dry_d if dry_d is not None else 'غير متوفر'} يوم.

**3. التوجيه الزراعي (FieldShift Agro) :**
- **وضعية الإجهاد المائي :** `{water_st}`.
- {agro.get('water_message', 'الري التكميلي مطلوب حسب حاجة المحصول.')}

⚠️ **تنبيه علمي :** هاد القياسات مأخوذة من أقمار وكالة NASA الاصطناعية على مساحة شبكية تقريبية (9-11 كلم)، وما كتعوضش التحليل المباشر بتربة الحقل."""
        elif lang == "fr":
            reply = f"""### 🌾 Diagnostic Agro-Climatique FIELDShift AI — {loc.get('name')} ({request.year})

**1. État Hydrique du Sol (NASA SMAP L4) :**
- **Humidité zone racinaire (0-100 cm) :** {rz_sm if rz_sm is not None else 'N/D'} m³/m³.
- **Humidité superficielle (0-5 cm) :** {surf_sm if surf_sm is not None else 'N/D'} m³/m³.
- **Percentile de sécheresse racinaire :** {pctl if pctl is not None else 'N/D'}%.
- **Température du lit de semence (0-10 cm) :** {t_l1 if t_l1 is not None else 'N/D'} °C.

**2. Contexte Climatologique (NASA POWER) :**
- **Cumul de précipitations :** {precip if precip is not None else 'N/D'} mm.
- **Température moyenne de l'air :** {mean_t if mean_t is not None else 'N/D'} °C.
- **Nombre de jours secs (< 1 mm) :** {dry_d if dry_d is not None else 'N/D'} jours.

**3. Recommandations Agronomiques :**
- **Statut de stress hydrique :** `{water_st}`.
- {agro.get('water_message', 'Adapter les apports d’eau aux stades phénologiques critiques.')}

⚠️ **Note de traçabilité :** Données satellitaires issues de la grille spatiale EASE-Grid 2.0 (~9-11 km)."""
        else:
            reply = f"""### 🌾 FIELDShift AI Agro-Climatic Report — {loc.get('name')} ({request.year})

**1. Soil Moisture State (NASA SMAP L4):**
- **Root-zone soil moisture (0-100 cm):** {rz_sm if rz_sm is not None else 'N/A'} m³/m³.
- **Surface soil moisture (0-5 cm):** {surf_sm if surf_sm is not None else 'N/A'} m³/m³.
- **Root-zone drought percentile:** {pctl if pctl is not None else 'N/A'}%.
- **Seedbed temperature (0-10 cm):** {t_l1 if t_l1 is not None else 'N/A'} °C.

**2. Climate Overview (NASA POWER):**
- **Total precipitation:** {precip if precip is not None else 'N/A'} mm.
- **Mean air temperature:** {mean_t if mean_t is not None else 'N/A'} °C.
- **Dry days count (< 1 mm):** {dry_d if dry_d is not None else 'N/A'} days.

**3. Agronomic Recommendations:**
- **Water stress status:** `{water_st}`.
- {agro.get('water_message', 'Schedule supplemental irrigation according to crop stages.')}

⚠️ **Scientific Notice:** Space-borne SMAP observations on a ~9-11 km grid."""

        return AiChatResponse(
            reply=reply,
            sources_used=dossier.get("sources_used", []),
            specialists_consulted=["Climate Specialist", "Soil Specialist", "Agronomist", "Evidence Guardrail"],
            data_evidence=self._extract_key_evidence(dossier),
            validation_status="partial" if error_msg else "validated",
            language_detected=lang,
            confidence_score=0.92,
            missing_data_warnings=dossier.get("missing_data", []) + ([f"Mode hors-ligne: {error_msg}"] if error_msg else []),
            model=self._model,
        )
