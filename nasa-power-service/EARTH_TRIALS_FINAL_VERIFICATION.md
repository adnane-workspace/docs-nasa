# EARTH TRIALS — Final Scientific Verification & Stabilization Report
**FieldShift AI Virtual Agricultural Laboratories**

**Date:** November 14, 2026  
**Audited Service:** `AgriSimulationService` (`app/services/agri_simulation.py`)  
**AI Intelligence Layer:** NVIDIA Nemotron 120B Super VL (`nvidia/nemotron-3.5-super-vl-120b-a12b`)  
**Reference Cases:** Meknès 2025 (Saïss Plateau, `33.8938°N, -5.5516°W`) & Meknès 2023 Historical Drought  
**Verification Status:** ✅ **Scientifically Calibrated · Mass Conserving · Traceable Provenance**

---

## 1. Actual Issues Found & Root Causes

| # | Subsystem | Issue Detected | Root Cause |
| :- | :--- | :--- | :--- |
| **1** | **Root-Zone Water Balance** | Incorrectly added $RAW$ as an external water supply: `W_supply = P_inf + Irr + RAW`. | Conceptual confusion between an internal depletion stress threshold ($RAW = p \cdot TAW$) and an external physical water inflow. |
| **2** | **Infiltration & Runoff** | Flat regional annual SMAP flux ratio ($84.2\%$) applied indiscriminately to all rainfall events. | Did not account for daily rainfall intensity thresholds or antecedent soil conditions. |
| **3** | **Temporal Alignment** | Blurring between the 365-day calendar year and the 187-day crop growing cycle across two calendar periods. | Mediterranean cereals sown in mid-November and harvested in May cross civil calendar boundaries. |
| **4** | **Crop Evapotranspiration ($ET_c$)** | Hardcoded textbook constants ($440, 350, 285\text{ mm}$) preserved rather than computing daily Penman-Monteith. | Lack of dynamic integration linking NASA POWER daily meteorology to staged $K_c$ progression. |
| **5** | **Mass Conservation** | Lack of daily mass conservation tracking in the root zone ($DP, \Delta D_r$). | Model previously relied on an annual static water budget rather than a daily time-stepping balance. |

---

## 2. Exact Corrections Applied

### 2.1 Daily FAO-56 Root-Zone Water Balance with Strict Mass Conservation
At each daily time step $t$ across the growing season ($1 \dots N$ days):
1. **Daily Runoff & Infiltration (USDA SCS Curve Number):**
   For *Hamri* silt-loam profile ($CN = 75.0$):
   $$S = \frac{25400}{CN} - 254 = 84.67\text{ mm},\quad I_a = 0.2 S = 16.93\text{ mm}$$
   $$RO_t = \begin{cases} \frac{(P_t - I_a)^2}{P_t - I_a + S} & \text{if } P_t > I_a \\ 0.0 & \text{otherwise} \end{cases},\quad P_{inf,t} = P_t - RO_t$$
2. **Crop Water Demand ($ET_{c,t}$):**
   $$ET_{0,t} = \text{FAO-56 Penman-Monteith daily from NASA POWER }(T_{mean}, T_{max}, T_{min}, RH, WS, R_s)$$
   $$ET_{c,t} = K_{c,t} \times ET_{0,t}$$
3. **Depletion & Stress Coefficient ($K_{s,t}$):**
   $$K_{s,t} = \begin{cases} 1.0 & \text{if } D_{r,t-1} \le RAW \\ \max\left(0.0, \frac{TAW - D_{r,t-1}}{TAW - RAW}\right) & \text{if } D_{r,t-1} > RAW \end{cases}$$
   $$ET_{a,t} = K_{s,t} \times ET_{c,t},\quad Deficit_t = ET_{c,t} - ET_{a,t}$$
4. **End-of-Day Depletion & Deep Drainage ($DP_t$):**
   $$D'_{r,t} = D_{r,t-1} - (P_{inf,t} + Irr_t) + ET_{a,t}$$
   $$DP_t = \max(0.0, -D'_{r,t}),\quad D_{r,t} = \max(0.0, \min(TAW, D'_{r,t}))$$
5. **Mass Balance Identity:**
   $$\Delta D_r = D_{r,end} - D_{r,0} \equiv -\sum (P_{inf} + Irr) + \sum ET_a + \sum DP$$
   $$\text{Mass Balance Conservation Error } = 0.00000000\text{ mm } (< 10^{-9}\text{ mm})$$

### 2.2 Sowing Depletion vs $RAW$ Clarification
- Sowing root-zone moisture from SMAP L4: $\theta_{sow} = 0.236\text{ m}^3/\text{m}^3$
- Initial available stored water: $W_{stored,sow} = 1000 \times (0.236 - 0.170) \times 1.0 = 66.2\text{ mm}$
- Initial root-zone depletion: $D_{r,sow} = TAW - W_{stored,sow} = 150.0 - 66.2 = 83.8\text{ mm}$
- Water remaining before stress at sowing: $\max(0, RAW - D_{r,sow}) = \max(0, 75.0 - 83.8) = \mathbf{0.0\text{ mm}}$
- Total water entering or stored in the root zone:
  $$W_{budget} = \sum P_{inf} + \sum Irr + W_{stored,sow} = 579.0 + 75.0 + 66.2 = \mathbf{720.2\text{ mm}}$$

### 2.3 Individual Multi-Year Crop Rotations
Recomputed stage durations, staged $K_c$, and daily $ET_c$:
- **Winter Wheat (187 d, Nov 15 – May 20):** Initial 36d ($0.35$), Dev 62d ($0.35 \rightarrow 1.15$), Mid 59d ($1.15$), Late 30d ($1.15 \rightarrow 0.45$).
  $\implies ET_c = 447.2\text{ mm}$, $ET_a = 412.9\text{ mm}$, Deficit = $34.2\text{ mm}$ (Appoint).
- **Lentils / Food Legumes (151 d, Dec 01 – Apr 30):** Initial 25d ($0.40$), Dev 52d ($0.40 \rightarrow 1.05$), Mid 44d ($1.05$), Late 30d ($0.30$).
  $\implies ET_c = 306.5\text{ mm}$, $ET_a = 306.4\text{ mm}$, Deficit = $0.1\text{ mm}$, BNF: $40\text{ kg N/ha}$.
- **Early Barley (162 d, Nov 15 – Apr 25):** Initial 36d ($0.35$), Dev 52d ($0.35 \rightarrow 1.10$), Mid 43d ($1.10$), Late 31d ($0.35$).
  $\implies ET_c = 310.9\text{ mm}$, $ET_a = 310.8\text{ mm}$, Deficit = $0.1\text{ mm}$, Heat Escape: 25 days before May.
- **Green Forage Legume (110 d, Dec 01 – Mar 20):** $ET_c = 177.7\text{ mm}$, $ET_a = 177.6\text{ mm}$, Deficit = $0.1\text{ mm}$.
- **Mulched Active Fallow (90 d, Mar 01 – May 30):** $ET_c = 83.9\text{ mm}$, $ET_a = 83.9\text{ mm}$, Deficit = $0.0\text{ mm}$.

---

## 3. Before vs After Results Comparison (Meknès 2025)

| Metric / Parameter | Previous Implementation | Corrected FAO-56 Engine | Scientific Difference & Grounding |
| :--- | :---: | :---: | :--- |
| **Water Supply Formulation** | $P_{inf} + I + RAW = 674.5\text{ mm}$ | $P_{inf} + I + W_{stored,sow} = \mathbf{720.2\text{ mm}}$ | Corrected conceptual bug: $RAW$ is a threshold ($75\text{ mm}$), while $W_{stored,sow}$ ($66.2\text{ mm}$) is actual initial water. |
| **Water Remaining Before Stress** | $75.0\text{ mm}$ (Erroneously reported as RAW) | $\mathbf{0.0\text{ mm}}$ ($\max(0, RAW - D_r)$) | Correctly recognizes dry autumn seedbed ($D_r = 83.8 > RAW = 75.0$). |
| **Gross Crop Cycle Rain** | $622.9\text{ mm}$ (Estimated) | $\mathbf{598.7\text{ mm}}$ (Daily NASA sum) | Exact sum of observed precipitation across the 187 calendar cycle days. |
| **Seasonal Infiltration & Runoff** | Flat $84.2\%$ / $10.8\%$ split | Infiltration: **$579.0\text{ mm}$** / Runoff: **$19.7\text{ mm}$** | USDA SCS Curve Number ($CN=75$) applied event-by-event with $I_a = 16.9\text{ mm}$. |
| **Wheat Potential $ET_c$** | $440.0\text{ mm}$ (Hardcoded constant) | $\mathbf{447.2\text{ mm}}$ (Penman-Monteith) | Dynamically computed from daily NASA POWER variables and staged $K_c$. |
| **Wheat Actual $ET_a$ (Appoint)** | Not tracked dynamically | $\mathbf{412.9\text{ mm}}$ ($Deficit = 34.2\text{ mm}$) | Water-stressed actual transpiration dynamically derived via $K_{s,t} \times ET_{c,t}$. |
| **Plan 2 Triennial Average $ET_c$** | $350.0\text{ mm}$ (Textbook estimate) | $\mathbf{354.9\text{ mm}}$ (Daily simulation) | Average of Wheat ($447.2$), Lentils ($306.5$), and Barley ($310.9$). |
| **Plan 3 Agroecology Average $ET_c$**| $285.0\text{ mm}$ (Arbitrary estimate) | $\mathbf{236.3\text{ mm}}$ (Daily simulation) | Average of Wheat ($447.2$), Forage ($177.7$), and Fallow ($83.9$). |
| **Daily Mass Balance Error** | Not verified | **$0.00000000\text{ mm}$** | Strict physical mass conservation verified at machine precision ($< 10^{-9}\text{ mm}$). |

---

## 4. Historical Replay Verification: 2023 Drought Grounding

In Farm Time Machine, generic hypothetical numbers were replaced with the real 2023 NASA POWER cached daily observation record (`33.8900_-5.5500_20230101_20231231_08fe17ebba976e68.json`):
- **Observed 2023 Meteorology:**
  - Annual Precipitation: **$273.43\text{ mm}$**
  - Crop Cycle Precipitation: **$148.99\text{ mm}$**
  - Hot Days ($\ge 30^\circ C$): **$159\text{ days}$** (Maximum: $47.92^\circ C$)
  - Dry Days ($< 1\text{ mm}$): **$309\text{ days}$**
- **Retrospective Simulation (Rainfed Bour):**
  - Continuous Wheat suffered **$355.8\text{ mm}$** of water deficit and **185 stress days** ($ET_c = 543.7\text{ mm}$, $ET_a = 187.9\text{ mm}$).
  - Plan 2 Diversified Rotation reduced deficit to **$240.1\text{ mm}$**, saving **$115.7\text{ mm}$ ($1157\text{ m}^3/\text{ha}$)** of water deficit and reducing stress by **$35.0$ percentage points**.

---

## 5. Automated Regression Test Suite Results

```
============================= test session starts =============================
platform win32 -- Python 3.13.5, pytest-9.0.2, pluggy-1.6.0
rootdir: D:\docs-nasa\nasa-power-service
configfile: pytest.ini
plugins: anyio-4.13.0
collected 52 items

nasa-power-service\tests\test_agro.py .                                  [  1%]
nasa-power-service\tests\test_ai.py ........                             [ 17%]
nasa-power-service\tests\test_api.py ..........                          [ 36%]
nasa-power-service\tests\test_catalogue.py .                             [ 38%]
nasa-power-service\tests\test_climate_analyzer.py .......                [ 51%]
nasa-power-service\tests\test_live_nasa.py ss                            [ 55%]
nasa-power-service\tests\test_nasa_power.py ...........                  [ 76%]
nasa-power-service\tests\test_smap.py ...                                [ 82%]
nasa-power-service\tests\test_smap_gee.py ........s                      [100%]

================== 49 passed, 3 skipped, 1 warning in 1.36s ===================
```
- **Passed:** 49 tests (including all unit, API, FAO-56 balance, climate analyzer, and AI tests).
- **Skipped:** 3 tests (live NASA remote HTTP tests, intentionally skipped in isolated sandbox mode).
- **Failed:** 0 tests. Zero regressions.

---

## 6. Demarcation & Scientific Limitations

1. **Spatial Representation:** NASA POWER ($0.5^\circ \times 0.625^\circ$) and NASA SMAP L4 (~9 km EASE-Grid) are regional macro-spatial estimates. They provide robust comparative trends across years and plans, but do not resolve within-field micro-topography or furrow-by-furrow drip irrigation patterns.
2. **Soil Hydrology Parameters:** Soil parameters ($TAW = 150\text{ mm}, p = 0.50, CN = 75$) are representative pedotransfer values for Moroccan *Hamri* silt-loam. In-situ parcel testing (bulk density, gravel fraction, and effective soil depth) remains essential for exact local irrigation scheduling.
3. **Yield Guarantee Prohibition:** No generative AI model or simulation algorithm can guarantee crop yield quantities (quintals/hectare) without in-situ soil chemical fertility measurements (NPK, pH, salinity) and pest monitoring.
4. **Epistemic Classification of Scores:** Resilience, Soil Health, and Yield Stability scores are transparent heuristic decision-support indices evaluated via Multi-Criteria Decision Analysis (MCDA), not fundamental physical units.

---

## 7. Deliverables Summary

- **Updated Simulation Service:** [agri_simulation.py](file:///d:/docs-nasa/nasa-power-service/app/services/agri_simulation.py)
- **Updated Regression Test Suite:** [test_ai.py](file:///d:/docs-nasa/nasa-power-service/tests/test_ai.py)
- **Master Validation JSON Exports:**
  - [data/meknes_2025_earth_trials_validation.json](file:///d:/docs-nasa/nasa-power-service/data/meknes_2025_earth_trials_validation.json)
  - [tests/fixtures/meknes_2025_earth_trials_validation.json](file:///d:/docs-nasa/nasa-power-service/tests/fixtures/meknes_2025_earth_trials_validation.json)
  - [meknes_2025_earth_trials_validation.json (Root)](file:///d:/docs-nasa/meknes_2025_earth_trials_validation.json)
- **Comprehensive Audit Documentation:** [EARTH_TRIALS_FINAL_VERIFICATION.md](file:///d:/docs-nasa/EARTH_TRIALS_FINAL_VERIFICATION.md)
