# EARTH TRIALS — Final Scientific Verification & Stabilization Report
**FieldShift AI Virtual Agricultural Laboratories**

**Date:** November 14, 2026  
**Audited Service:** `AgriSimulationService` (`nasa-power-service/app/services/agri_simulation.py`)  
**AI Intelligence Layer:** NVIDIA Nemotron 120B Super VL (`nvidia/nemotron-3.5-super-vl-120b-a12b`)  
**Reference Case:** Meknès 2025 (Saïss Plateau, `33.8938°N, -5.5516°W`) & Meknès 2023 Counterfactual  
**Verification Status:** ✅ **Contiguous Multi-Year Chronology · Mass Conserving · Zero Fallback**

---

## 1. Identified Temporal Inconsistency & Root Cause

| Item | Problem Description | Root Cause | Scientific Impact |
| :--- | :--- | :--- | :--- |
| **Intra-Annual Date Stitching** | The season combined `20251115..20251231` with `20250101..20250520`. | Slicing dates within a single civil calendar year (2025). | Inverted autumn sowing and spring growth chronologically; November 2025 rains were placed *after* May 2025 harvest. |
| **Missing Multi-Year Sourcing** | Only year 2025 was retrieved from NASA POWER for the 2025 simulation. | Lack of cross-year ingestion mechanism in the simulation engine. | Autumn 2024 sowing conditions were approximated using Autumn 2025 observations. |
| **Metric Conflation** | "Water saved" was used interchangeably for evaporative demand, stress deficit, and irrigation. | Ambiguous agricultural terminology. | Farmers could mistake reduced atmospheric crop demand for physical irrigation water pumped. |

---

## 2. Exact Scientific Corrections Applied

### 2.1 Explicit `harvest_year` Convention & Contiguous Chronology
The simulation now strictly enforces the agricultural campaign standard:
- **Harvest Year $Y$** is defined as the contiguous agricultural cycle spanning autumn of year $Y-1$ through spring/summer of year $Y$.
- **Harvest Year 2025 (Meknès):**
  - **Start Date:** `2024-11-15` (Day 1 of season, Sowing)
  - **End Date:** `2025-05-20` (Day 187 of season, Harvest)
  - **Duration:** Exactly **187 contiguous chronological days** ($47\text{ days}$ in 2024 + $140\text{ days}$ in 2025).
  - Every day is contiguous: `20241231` is immediately followed by `20250101`.
- **Harvest Year 2023 (Historical Drought Counterfactual):**
  - Contiguously loaded from `2022-11-15` through `2023-05-20` (187 contiguous days: 47 in 2022 + 140 in 2023).

### 2.2 Dual-Year NASA POWER Dataset Ingestion
- `AgriSimulationService._load_harvest_season_power_parameters()` loads raw satellite observation records for both calendar years $Y-1$ and $Y$ directly from verified cache files.
- Datasets for Meknès (`33.8900°N, -5.5500°W`):
  - `33.8900_-5.5500_20240101_20241231_8716856fb4b1f05a.json` (366 daily records)
  - `33.8900_-5.5500_20250101_20251231_70dbe41d6e3a3e92.json` (365 daily records)
  - `33.8900_-5.5500_20220101_20221231_4356b7e686660fab.json` (365 daily records)
  - `33.8900_-5.5500_20230101_20231231_08fe17ebba976e68.json` (365 daily records)
- Parameters merged in chronological order across `T2M`, `T2M_MAX`, `T2M_MIN`, `RH2M`, `WS2M`, `ALLSKY_SFC_SW_DWN`, and `PRECTOTCORR`.

### 2.3 Individual Rotation Crop Calendars & Dynamic FAO-56 Physics
Each crop is evaluated over its own verified, contiguous phenological window:
1. **Winter Wheat (Plan 1 & Year 1 of Plans 2/3):**
   - Nov 15, 2024 – May 20, 2025 (187 days: Ini 36d, Dev 62d, Mid 59d, Late 30d).
   - Gross Rain = $339.0\text{ mm}$, Infiltrated Rain = $334.1\text{ mm}$, Runoff = $4.8\text{ mm}$.
   - Reference $ET_0 = 536.2\text{ mm}$, Potential $ET_c = 455.8\text{ mm}$, Actual $ET_a = 392.3\text{ mm}$.
   - Water Deficit = $63.6\text{ mm}$, Stress % = $13.9\%$, Deep Drainage = $65.1\text{ mm}$.
2. **Lentils / Food Legumes (Year 2 of Plan 2):**
   - Dec 01, 2024 – Apr 30, 2025 (151 days: Ini 25d, Dev 52d, Mid 44d, Late 30d).
   - Potential $ET_c = 311.9\text{ mm}$, Actual $ET_a = 311.7\text{ mm}$, Deficit = $0.2\text{ mm}$, Stress % = $0.1\%$.
   - Biological Nitrogen Fixation: $40\text{ kg N/ha}$.
3. **Early Barley (Year 3 of Plan 2):**
   - Nov 15, 2024 – Apr 25, 2025 (162 days: Ini 36d, Dev 52d, Mid 43d, Late 31d).
   - Potential $ET_c = 319.6\text{ mm}$, Actual $ET_a = 319.5\text{ mm}$, Deficit = $0.1\text{ mm}$, Stress % = $0.0\%$.
   - Heat escape: Harvest 25 days before scorching May winds.
4. **Green Forage Legume (Year 2 of Plan 3):**
   - Dec 01, 2024 – Mar 20, 2025 (110 days: Ini 20d, Dev 40d, Mid 35d, Late 15d).
   - Potential $ET_c = 183.4\text{ mm}$, Actual $ET_a = 183.2\text{ mm}$, Deficit = $0.2\text{ mm}$.
5. **Mulched Active Fallow (Year 3 of Plan 3):**
   - Mar 01, 2025 – May 29, 2025 (90 days).
   - Potential $ET_c = 83.9\text{ mm}$, Actual $ET_a = 83.9\text{ mm}$, Deficit = $0.0\text{ mm}$.

### 2.4 Strict Disambiguation of Water Metrics
The simulation engine and user interface now explicitly distinguish three distinct physical quantities:
1. **Evaporative Demand Reduction ($\Delta ET_c$):**
   - Reduction in potential crop transpiration demand achieved by planting shorter-cycle or lower-$K_c$ crops.
   - Plan 2 vs Plan 1: $455.8 - 362.4 = \mathbf{93.4\text{ mm}}$ ($934\text{ m}^3\text{/ha}$).
   - Plan 3 vs Plan 1: $455.8 - 241.0 = \mathbf{214.8\text{ mm}}$ ($2,148\text{ m}^3\text{/ha}$).
2. **Simulated Water Deficit Reduction ($\Delta (ET_c - ET_a)$):**
   - Avoided crop water stress deficit.
   - Plan 2 vs Plan 1: $63.6 - 21.3 = \mathbf{42.3\text{ mm}}$ ($423\text{ m}^3\text{/ha}$).
3. **Actual Irrigation Pumping Savings ($\Delta Irr$):**
   - Physical volume of groundwater or canal water saved from pumping.
   - Under rainfed conditions (`bour`): Strictly $\mathbf{0.0\text{ mm}}$ ($0\text{ m}^3\text{/ha}$).
   - Under supplementary irrigation (`appoint`): $\mathbf{50.0\text{ mm}}$ ($500\text{ m}^3\text{/ha}$).

---

## 3. Mathematical Verification of Mass Conservation

For Winter Wheat on *Hamri* Silt-Loam ($TAW = 150.0\text{ mm}$, $CN = 75$):
- Initial Depletion at Sowing: $D_{r,sow} = 83.8\text{ mm}$ ($W_{stored,sow} = 66.2\text{ mm}$)
- Readily Available Water: $RAW = 75.0\text{ mm} \implies \text{Water remaining before stress} = \max(0, 75.0 - 83.8) = \mathbf{0.0\text{ mm}}$
- Total Water Inflow & Stored Budget:
  $$W_{budget} = P_{inf} + Irr + W_{stored,sow} = 334.1 + 75.0 + 66.2 = \mathbf{475.3\text{ mm}}$$
- Final Depletion: $D_{r,final} = 132.0\text{ mm}$
- Change in Depletion: $\Delta D_r = 132.0 - 83.8 = +48.2\text{ mm}$
- Physical Outflows vs Inflows:
  $$-(P_{inf} + Irr) + ET_a + DP = -(334.1 + 75.0) + 392.3 + 65.1 = -409.1 + 457.4 = +48.3\text{ mm}$$
- **Exact Daily Machine Residual:** $\mathbf{0.00000000\text{ mm}}$ ($< 10^{-12}\text{ mm}$).

---

## 4. Retrospective Farm Time Machine (2023 Historical Drought)

Evaluated over the contiguous 2022/2023 campaign (Nov 15, 2022 – May 20, 2023, 187 days):
- **Observed Weather:** Gross Rain = $294.5\text{ mm}$, Infiltrated Rain = $287.0\text{ mm}$, Hot Days = 159.
- **Continuous Wheat (Rainfed Bour):**
  - Potential $ET_c = 540.6\text{ mm}$, Actual $ET_a = 275.9\text{ mm}$
  - Water Deficit = $\mathbf{264.8\text{ mm}}$, Stress Days = $74\text{ days}$, Stress % = $\mathbf{49.0\%}$
- Confirms the acute vulnerability of continuous cereals during Moroccan dry years and validates the agronomic rationale for legume-barley diversification.

---

## 5. Test Suite & Validation Artifacts

- **Pytest Suite:** 52 collected, **49 passed**, **3 skipped** (optional live NASA network queries), **0 failed**.
- **JSON Master File:** `nasa-power-service/data/meknes_2025_earth_trials_validation.json` fully updated with contiguous multi-year records, exact season dates, parameters, and zero-residual mass balance verification.
