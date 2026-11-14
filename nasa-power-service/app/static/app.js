/**
 * FIELDShift AI — NASA SMAP Level-4 Scientific & Agricultural Explorer
 * Multi-Page Architecture & Moroccan Darija (الدارجة المغربية) Explanation Engine
 */

// Application State
const AppState = {
  view: "welcome", // "welcome" | "choice" | "agri" | "sci"
  location: {
    city: "Tanger, Maroc",
    lat: 35.7687,
    lon: -5.8139
  },
  year: "2025",
  agriData: null,
  sciData: null,
  activeSciCatFilter: "all"
};

let chartInstances = {};
let allVariablesCatalog = {};
const STORAGE_LOCATION_KEY = "fieldshift_smap_user_location";

document.addEventListener("DOMContentLoaded", () => {
  initNavTabs();
  initSubTabsInsideModes();
  initHeroActions();
  initChoiceViewControls();
  initAgriViewControls();
  initSciViewControls();
  initClassicPower();
  initDarijaDrawer();
  loadVariablesCatalog();

  // Restore saved location if present, else keep Tanger
  restoreSavedLocation();

  // Show welcome view first (clean, no clutter)
  showSmapView("welcome");
});

/* ==========================================================================
   Multi-View Page Switching Architecture
   ========================================================================== */
function showSmapView(viewName) {
  AppState.view = viewName;
  const views = ["welcome", "choice", "agri", "sci"];
  
  views.forEach(v => {
    const el = document.getElementById(`smap-view-${v}`);
    if (el) {
      if (v === viewName) {
        el.hidden = false;
        el.classList.add("active");
      } else {
        el.hidden = true;
        el.classList.remove("active");
      }
    }
  });

  // Trigger resize on visible Chart.js instances
  setTimeout(() => {
    Object.values(chartInstances).forEach(c => c && c.resize && c.resize());
  }, 60);

  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ==========================================================================
   Navigation Tabs (SMAP Explorer vs NASA POWER vs Catalog)
   ========================================================================== */
function initNavTabs() {
  const tabs = document.querySelectorAll(".main-nav .tab-btn");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      const targetId = `tab-${tab.dataset.tab}`;
      document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
      const targetContent = document.getElementById(targetId);
      if (targetContent) targetContent.classList.add("active");
    });
  });

  // Error dismiss button
  const errDismiss = document.getElementById("btn-error-dismiss");
  if (errDismiss) {
    errDismiss.addEventListener("click", () => {
      document.getElementById("smap-error").hidden = true;
    });
  }
}

function initSubTabsInsideModes() {
  document.querySelectorAll(".v-tab-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const parent = btn.closest(".smap-view-page");
      if (!parent) return;

      parent.querySelectorAll(".v-tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      const targetId = btn.dataset.vsub;
      parent.querySelectorAll(".v-sub-content").forEach(c => c.classList.remove("active"));
      const target = document.getElementById(targetId);
      if (target) target.classList.add("active");

      setTimeout(() => {
        Object.values(chartInstances).forEach(c => c && c.resize && c.resize());
      }, 50);
    });
  });
}

/* ==========================================================================
   VUE 1 : ACCUEIL & ENTRÉE (Hero Actions)
   ========================================================================== */
function initHeroActions() {
  const btnStart = document.getElementById("btn-hero-start");
  if (btnStart) {
    btnStart.addEventListener("click", () => {
      updateChoiceLocationDisplay();
      showSmapView("choice");

      // Auto-request GPS if user hasn't explicitly set a location yet
      const saved = localStorage.getItem(STORAGE_LOCATION_KEY);
      if (!saved && "geolocation" in navigator) {
        getUserLocation({ autoFetch: false, userTriggered: false });
      }
    });
  }
}

/* ==========================================================================
   VUE 2 : SÉLECTION DE LOCALISATION & CHOIX DU MODE
   ========================================================================== */
function initChoiceViewControls() {
  // GPS Button
  const btnGps = document.getElementById("choice-btn-gps");
  if (btnGps) {
    btnGps.addEventListener("click", () => {
      getUserLocation({ autoFetch: false, userTriggered: true });
    });
  }

  // Quick preset chips
  document.querySelectorAll(".city-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".city-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");

      AppState.location.city = chip.dataset.city;
      AppState.location.lat = parseFloat(chip.dataset.lat);
      AppState.location.lon = parseFloat(chip.dataset.lon);

      saveLocation(AppState.location);
      updateChoiceLocationDisplay();
    });
  });

  // Search input & button
  const btnSearch = document.getElementById("choice-btn-search");
  const inputSearch = document.getElementById("choice-search-city");
  
  const handleSearch = async () => {
    const q = inputSearch.value.trim();
    if (!q) return;

    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=jsonv2&limit=1`);
      const data = await res.json();
      if (data && data.length > 0) {
        const item = data[0];
        AppState.location.lat = parseFloat(item.lat);
        AppState.location.lon = parseFloat(item.lon);
        AppState.location.city = item.display_name.split(",").slice(0, 2).join(",").trim();

        document.querySelectorAll(".city-chip").forEach(c => c.classList.remove("active"));
        saveLocation(AppState.location);
        updateChoiceLocationDisplay();
      } else {
        alert("Localité non trouvée. Veuillez préciser le nom de la ville.");
      }
    } catch (e) {
      console.warn("Geocoding search error:", e);
    }
  };

  if (btnSearch) btnSearch.addEventListener("click", handleSearch);
  if (inputSearch) {
    inputSearch.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSearch();
      }
    });
  }

  // Year select
  const selectYear = document.getElementById("choice-year-select");
  if (selectYear) {
    selectYear.addEventListener("change", () => {
      AppState.year = selectYear.value;
      // sync with agri & sci year selects
      syncYearSelects(AppState.year);
    });
  }

  // Button 1: Mode Agricole
  const btnAgri = document.getElementById("btn-choose-agri");
  if (btnAgri) {
    btnAgri.addEventListener("click", async () => {
      await loadAndDisplayAgriMode();
    });
  }

  // Button 2: Mode Scientifique
  const btnSci = document.getElementById("btn-choose-sci");
  if (btnSci) {
    btnSci.addEventListener("click", async () => {
      await loadAndDisplaySciMode();
    });
  }

  // Back to welcome
  const btnBackWelcome = document.getElementById("btn-back-to-welcome");
  if (btnBackWelcome) {
    btnBackWelcome.addEventListener("click", () => {
      showSmapView("welcome");
    });
  }
}

function updateChoiceLocationDisplay() {
  const cityEl = document.getElementById("choice-display-city");
  const coordsEl = document.getElementById("choice-display-coords");
  if (cityEl) cityEl.textContent = AppState.location.city;
  if (coordsEl) coordsEl.textContent = `Coordonnées : ${AppState.location.lat.toFixed(4)}°N, ${AppState.location.lon.toFixed(4)}°W (EASE-Grid 2.0 ~9-11 km)`;
}

function syncYearSelects(yearVal) {
  ["choice-year-select", "agri-year-select", "sci-year-select"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = yearVal;
  });
}

function saveLocation(loc) {
  try {
    localStorage.setItem(STORAGE_LOCATION_KEY, JSON.stringify(loc));
  } catch (e) {
    console.warn("Failed to store location:", e);
  }
}

function restoreSavedLocation() {
  try {
    const saved = localStorage.getItem(STORAGE_LOCATION_KEY);
    if (saved) {
      const loc = JSON.parse(saved);
      if (loc && loc.lat && loc.lon) {
        AppState.location.lat = parseFloat(loc.lat);
        AppState.location.lon = parseFloat(loc.lon);
        AppState.location.city = loc.city || `${AppState.location.lat.toFixed(4)}, ${AppState.location.lon.toFixed(4)}`;
      }
    }
  } catch (e) {
    console.warn("Error reading stored location:", e);
  }
  updateChoiceLocationDisplay();
}

async function getUserLocation({ autoFetch = false, userTriggered = false } = {}) {
  const feedback = document.getElementById("choice-gps-feedback");
  const feedbackText = document.getElementById("choice-gps-status-text");

  if (!("geolocation" in navigator)) {
    if (userTriggered) alert("La géolocalisation GPS n'est pas supportée par votre navigateur.");
    return;
  }

  if (feedback && feedbackText) {
    feedback.hidden = false;
    feedbackText.textContent = "🛰️ Détection de vos coordonnées GPS en cours...";
  }

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;

      AppState.location.lat = lat;
      AppState.location.lon = lon;

      let cityName = `Position GPS (${lat.toFixed(4)}, ${lon.toFixed(4)})`;

      // Try reverse geocoding via backend first
      try {
        const revRes = await fetch(`/api/smap-gee/reverse-geocode?latitude=${lat}&longitude=${lon}`);
        if (revRes.ok) {
          const revData = await revRes.json();
          if (revData && revData.city && !revData.city.startsWith("Coordonnées")) {
            cityName = revData.city;
          }
        }
      } catch (e) {
        console.warn("Backend reverse geocode failed:", e);
      }

      // Fallback to client reverse geocode if generic
      if (cityName.startsWith("Position GPS") || cityName.startsWith("Coordonnées")) {
        try {
          const directRes = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=jsonv2&addressdetails=1`);
          if (directRes.ok) {
            const d = await directRes.json();
            const addr = d.address || {};
            const place = addr.city || addr.town || addr.village || addr.municipality || addr.suburb || addr.county || addr.state;
            const country = addr.country || "";
            if (place) cityName = country ? `${place}, ${country}` : place;
          }
        } catch (e2) {
          console.warn("Client reverse geocode failed:", e2);
        }
      }

      AppState.location.city = cityName;
      saveLocation(AppState.location);
      updateChoiceLocationDisplay();

      if (feedback && feedbackText) {
        feedbackText.textContent = `✅ Position GPS active : ${cityName} (${lat.toFixed(4)}°N, ${lon.toFixed(4)}°W)`;
      }

      // Mark chips inactive
      document.querySelectorAll(".city-chip").forEach(c => c.classList.remove("active"));
    },
    (err) => {
      console.warn("Geolocation denied or error:", err);
      if (feedback && feedbackText) {
        if (userTriggered) {
          feedback.hidden = false;
          feedbackText.textContent = `⚠️ Impossible d'obtenir votre position GPS (${err.message}). Veuillez sélectionner une ville manuellement.`;
        } else {
          feedback.hidden = true;
        }
      }
    },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
  );
}

/* ==========================================================================
   VUE 3 : PAGE DÉDIÉE : MODE AGRICOLE (16 variables)
   ========================================================================== */
function initAgriViewControls() {
  // Back to choice
  const btnBack = document.getElementById("btn-back-from-agri");
  if (btnBack) {
    btnBack.addEventListener("click", () => {
      updateChoiceLocationDisplay();
      showSmapView("choice");
    });
  }

  // Switch to scientific mode directly
  const btnSwitch = document.getElementById("btn-switch-to-sci");
  if (btnSwitch) {
    btnSwitch.addEventListener("click", async () => {
      await loadAndDisplaySciMode();
    });
  }

  // Year select
  const selectYear = document.getElementById("agri-year-select");
  if (selectYear) {
    selectYear.addEventListener("change", async () => {
      AppState.year = selectYear.value;
      syncYearSelects(AppState.year);
      await loadAndDisplayAgriMode(true);
    });
  }
}

async function loadAndDisplayAgriMode(forceReload = false) {
  // Update header info
  document.getElementById("agri-current-loc").textContent = `📍 ${AppState.location.city} (${AppState.location.lat.toFixed(4)}°N, ${AppState.location.lon.toFixed(4)}°W)`;
  document.getElementById("agri-year-select").value = AppState.year;

  // Check if we already have the exact data cached in memory
  const isCached = !forceReload && AppState.agriData && 
    AppState.agriData.location.requested_latitude === AppState.location.lat &&
    AppState.agriData.location.requested_longitude === AppState.location.lon &&
    AppState.agriData.year == AppState.year;

  if (!isCached) {
    const data = await fetchSmapApi({
      mode: "agricultural",
      year: AppState.year,
      lat: AppState.location.lat,
      lon: AppState.location.lon,
      city: AppState.location.city
    });
    if (!data) return;
    AppState.agriData = data;
  }

  renderAgriDashboard(AppState.agriData);
  showSmapView("agri");
}

function renderAgriDashboard(data) {
  // Status strip
  document.getElementById("agri-strip-cache").textContent = data.cached ? "Cache : Disque (HIT)" : "Cache : Requête GEE (MISS)";
  document.getElementById("agri-strip-obs").textContent = `${data.monthly_series.reduce((acc, m) => acc + m.observation_count, 0)} obs. 3h`;
  document.getElementById("agri-strip-time").textContent = `${data.processing_time_ms} ms`;

  // 1. Render 16 Summary Cards
  renderAgriCards(data);

  // 2. Render Charts
  renderAgriMoistureChart(data);
  renderAgriDroughtCharts(data);
  renderAgriWaterChart(data);

  // 3. Render Table
  renderAgriTable(data);
}

function renderAgriCards(data) {
  const container = document.getElementById("agri-cards-container");
  container.innerHTML = "";

  if (!data.summary_cards || data.summary_cards.length === 0) {
    container.innerHTML = `<p class="hint">Aucune carte agricole disponible.</p>`;
    return;
  }

  data.summary_cards.forEach(card => {
    const cardEl = document.createElement("div");
    cardEl.className = `smap-card ${card.status_tone || 'normal'}`;

    let changeHtml = `<span class="card-change">Stable</span>`;
    if (card.change_vs_previous_month_pct !== null) {
      const isPos = card.change_vs_previous_month_pct > 0;
      const sign = isPos ? "+" : "";
      const cls = isPos ? "positive" : "negative";
      changeHtml = `<span class="card-change ${cls}">${sign}${card.change_vs_previous_month_pct}% vs mois préc.</span>`;
    }

    cardEl.innerHTML = `
      <div class="card-top">
        <span class="card-title">${card.title}</span>
        <span class="card-tone-pill status-badge ${card.status_tone}">${card.status_tone}</span>
      </div>
      <div class="card-value-row">
        <span class="card-value">${card.value !== null ? card.value : '—'}</span>
        <span class="card-unit">${card.display_unit}</span>
      </div>
      <div class="card-bottom">
        ${changeHtml}
        <span class="card-darija-pill">💡 الشرح بالدارجة</span>
      </div>
    `;

    cardEl.addEventListener("click", () => {
      openDarijaDrawer(card.id, card.value, card.period, data.location.name);
    });

    container.appendChild(cardEl);
  });
}

function renderAgriMoistureChart(data) {
  destroyChart("agri-moisture");
  if (typeof Chart === "undefined") return;

  const canvas = document.getElementById("chart-agri-moisture");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const labels = data.monthly_series.map(m => m.month_name);

  const surfData = data.monthly_series.map(m => m.display_values["sm_surface"]);
  const rootData = data.monthly_series.map(m => m.display_values["sm_rootzone"]);
  const profData = data.monthly_series.map(m => m.display_values["sm_profile"]);

  chartInstances["agri-moisture"] = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Surface (0-5 cm)",
          data: surfData,
          borderColor: "#2563eb",
          backgroundColor: "rgba(37, 99, 235, 0.1)",
          fill: true,
          tension: 0.3,
          borderWidth: 2.5,
          pointRadius: 4,
          pointHoverRadius: 6,
        },
        {
          label: "Zone Racinaire (0-100 cm)",
          data: rootData,
          borderColor: "#16a34a",
          backgroundColor: "rgba(22, 163, 74, 0.05)",
          fill: true,
          tension: 0.3,
          borderWidth: 3,
          pointRadius: 4,
          pointHoverRadius: 6,
        },
        {
          label: "Profil Total",
          data: profData,
          borderColor: "#9333ea",
          borderDash: [5, 5],
          tension: 0.3,
          borderWidth: 2,
          pointRadius: 3,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${ctx.raw} m³/m³`
          }
        }
      },
      scales: {
        y: {
          title: { display: true, text: "Humidité Volumétrique (m³/m³)" },
          min: 0,
          suggestedMax: 0.5
        }
      }
    }
  });

  // Agronomic insight
  const validRoot = rootData.filter(v => v !== null);
  if (validRoot.length > 0) {
    const avg = (validRoot.reduce((a, b) => a + b, 0) / validRoot.length).toFixed(3);
    const insightEl = document.getElementById("agri-insight-moisture");
    if (insightEl) {
      insightEl.textContent = `Humidité moyenne de la zone racinaire : ${avg} m³/m³. Les pics correspondent à la recharge hivernale, tandis que la baisse printanière indique la reprise végétative et l'absorption transpiratoire des cultures.`;
    }
  }
}

function renderAgriDroughtCharts(data) {
  destroyChart("agri-drought");
  destroyChart("agri-wetness");
  if (typeof Chart === "undefined") return;

  const labels = data.monthly_series.map(m => m.month_name);

  // 1. Drought percentiles
  const pctlCanvas = document.getElementById("chart-agri-drought-pctl");
  if (pctlCanvas) {
    const pctlData = data.monthly_series.map(m => m.display_values["sm_rootzone_pctl"]);
    chartInstances["agri-drought"] = new Chart(pctlCanvas.getContext("2d"), {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: "Percentile Racinaire (%)",
          data: pctlData,
          backgroundColor: pctlData.map(v => {
            if (v === null) return "#cbd5e1";
            if (v < 20) return "#dc2626";
            if (v < 40) return "#f59e0b";
            return "#16a34a";
          }),
          borderRadius: 4,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            min: 0,
            max: 100,
            title: { display: true, text: "Percentile (%)" }
          }
        }
      }
    });
  }

  // 2. Wetness degree
  const wetCanvas = document.getElementById("chart-agri-wetness");
  if (wetCanvas) {
    const wetData = data.monthly_series.map(m => m.display_values["sm_rootzone_wetness"]);
    chartInstances["agri-wetness"] = new Chart(wetCanvas.getContext("2d"), {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: "Saturation Sol (0-1)",
          data: wetData,
          borderColor: "#0284c7",
          backgroundColor: "rgba(2, 132, 199, 0.1)",
          fill: true,
          tension: 0.3,
          pointRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            min: 0,
            max: 1.0,
            title: { display: true, text: "Degré de Saturation (0 à 1)" }
          }
        }
      }
    });
  }
}

function renderAgriWaterChart(data) {
  destroyChart("agri-water");
  if (typeof Chart === "undefined") return;

  const canvas = document.getElementById("chart-agri-water-flux");
  if (!canvas) return;

  const labels = data.monthly_series.map(m => m.month_name);
  const etData = data.monthly_series.map(m => m.display_values["evapotranspiration"]);
  const infData = data.monthly_series.map(m => m.display_values["infiltration"]);
  const runData = data.monthly_series.map(m => m.display_values["surface_runoff"]);

  chartInstances["agri-water"] = new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Évapotranspiration (ET)",
          data: etData,
          backgroundColor: "#f97316",
          borderRadius: 4
        },
        {
          label: "Infiltration Sol",
          data: infData,
          backgroundColor: "#16a34a",
          borderRadius: 4
        },
        {
          label: "Ruissellement Surface",
          data: runData,
          backgroundColor: "#3b82f6",
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          title: { display: true, text: "Flux (mm/jour)" },
          min: 0
        }
      }
    }
  });
}

function renderAgriTable(data) {
  const tbody = document.getElementById("tbody-agri-summary");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!data.annual_summary || data.annual_summary.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8">Aucune donnée disponible.</td></tr>`;
    return;
  }

  data.annual_summary.forEach(item => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${item.name_fr}</strong> <small style="color:#64748b">(${item.variable_id})</small></td>
      <td><strong>${item.mean !== null ? item.mean : '—'}</strong></td>
      <td>${item.min !== null ? item.min : '—'}</td>
      <td>${item.max !== null ? item.max : '—'}</td>
      <td>${item.display_unit}</td>
      <td><span class="status-badge ${item.completeness_pct >= 90 ? 'optimal' : 'warning'}">${item.completeness_pct}%</span></td>
      <td>${item.seasonal_trend || '—'}</td>
      <td><button type="button" class="btn-sm" style="font-family:var(--font-arabic);font-weight:700">💡 الشرح بالدارجة</button></td>
    `;

    tr.addEventListener("click", () => {
      openDarijaDrawer(item.variable_id, item.mean, "Moyenne annuelle", data.location.name);
    });

    tbody.appendChild(tr);
  });
}

/* ==========================================================================
   VUE 4 : PAGE DÉDIÉE : MODE SCIENTIFIQUE (46 variables)
   ========================================================================== */
function initSciViewControls() {
  // Back to choice
  const btnBack = document.getElementById("btn-back-from-sci");
  if (btnBack) {
    btnBack.addEventListener("click", () => {
      updateChoiceLocationDisplay();
      showSmapView("choice");
    });
  }

  // Switch to agricultural mode directly
  const btnSwitch = document.getElementById("btn-switch-to-agri");
  if (btnSwitch) {
    btnSwitch.addEventListener("click", async () => {
      await loadAndDisplayAgriMode();
    });
  }

  // Year select
  const selectYear = document.getElementById("sci-year-select");
  if (selectYear) {
    selectYear.addEventListener("change", async () => {
      AppState.year = selectYear.value;
      syncYearSelects(AppState.year);
      await loadAndDisplaySciMode(true);
    });
  }

  // Cross comparator button
  const btnCross = document.getElementById("sci-btn-update-cross");
  if (btnCross) {
    btnCross.addEventListener("click", () => {
      if (AppState.sciData) renderSciCrossChart(AppState.sciData);
    });
  }

  // Table search
  const tableSearch = document.getElementById("sci-table-search");
  if (tableSearch) {
    tableSearch.addEventListener("input", (e) => {
      const q = e.target.value.toLowerCase();
      document.querySelectorAll("#tbody-sci-detailed tr").forEach(r => {
        r.style.display = r.textContent.toLowerCase().includes(q) ? "" : "none";
      });
    });
  }

  // Table exports
  const btnCsv = document.getElementById("sci-btn-export-csv");
  if (btnCsv) {
    btnCsv.addEventListener("click", () => exportTableToCSV(AppState.sciData));
  }
  const btnJson = document.getElementById("sci-btn-export-json");
  if (btnJson) {
    btnJson.addEventListener("click", () => exportTableToJSON(AppState.sciData));
  }
}

async function loadAndDisplaySciMode(forceReload = false) {
  // Update header info
  document.getElementById("sci-current-loc").textContent = `📍 ${AppState.location.city} (${AppState.location.lat.toFixed(4)}°N, ${AppState.location.lon.toFixed(4)}°W)`;
  document.getElementById("sci-year-select").value = AppState.year;

  const isCached = !forceReload && AppState.sciData && 
    AppState.sciData.location.requested_latitude === AppState.location.lat &&
    AppState.sciData.location.requested_longitude === AppState.location.lon &&
    AppState.sciData.year == AppState.year;

  if (!isCached) {
    const data = await fetchSmapApi({
      mode: "scientific",
      year: AppState.year,
      lat: AppState.location.lat,
      lon: AppState.location.lon,
      city: AppState.location.city
    });
    if (!data) return;
    AppState.sciData = data;
  }

  renderSciDashboard(AppState.sciData);
  showSmapView("sci");
}

function renderSciDashboard(data) {
  // Status strip
  document.getElementById("sci-strip-cache").textContent = data.cached ? "Cache : Disque (HIT)" : "Cache : Requête GEE (MISS)";
  document.getElementById("sci-strip-obs").textContent = `46 variables · ${data.monthly_series.reduce((acc, m) => acc + m.observation_count, 0)} obs. 3h`;
  document.getElementById("sci-strip-time").textContent = `${data.processing_time_ms} ms`;

  // 1. Build Category Chips & Render 46 Cards
  renderSciCategoryChips(data);
  renderSciCards(data, AppState.activeSciCatFilter);

  // 2. Charts
  renderSciTempChart(data);
  renderSciFluxChart(data);
  populateSciCrossSelectors(data);
  renderSciCrossChart(data);

  // 3. Detailed Full Table
  renderSciDetailedTable(data);
}

function renderSciCategoryChips(data) {
  const container = document.getElementById("sci-category-filter-chips");
  if (!container) return;

  const categories = {
    all: { name: `Toutes (${data.summary_cards.length})` },
    soil_moisture: { name: "💧 Humidité du Sol" },
    soil_wetness: { name: "🌊 Saturation" },
    anomalies: { name: "🌵 Sécheresse & Anomalies" },
    soil_temperature: { name: "🌡️ Températures Multicouches" },
    evapotranspiration: { name: "☁️ Évapotranspiration" },
    water_fluxes: { name: "💧 Flux Hydriques" },
    vegetation: { name: "🌿 Végétation" },
    energy_fluxes: { name: "⚡ Bilan Radiatif & Énergie" },
    biogeochemistry: { name: "🌱 Carbone / GPP" },
    ancillary: { name: "🛰️ Données Auxiliaires" }
  };

  container.innerHTML = "";
  Object.entries(categories).forEach(([key, val]) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = `cat-filter-chip ${key === AppState.activeSciCatFilter ? 'active' : ''}`;
    chip.textContent = val.name;
    chip.dataset.cat = key;

    chip.addEventListener("click", () => {
      container.querySelectorAll(".cat-filter-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      AppState.activeSciCatFilter = key;
      renderSciCards(data, key);
    });

    container.appendChild(chip);
  });
}

function renderSciCards(data, catFilter) {
  const container = document.getElementById("sci-cards-container");
  if (!container) return;
  container.innerHTML = "";

  const filteredCards = data.summary_cards.filter(c => {
    if (!catFilter || catFilter === "all") return true;
    return c.category === catFilter;
  });

  if (filteredCards.length === 0) {
    container.innerHTML = `<p class="hint">Aucune variable dans cette catégorie.</p>`;
    return;
  }

  filteredCards.forEach(card => {
    const cardEl = document.createElement("div");
    cardEl.className = `smap-card ${card.status_tone || 'normal'}`;

    let changeHtml = `<span class="card-change">Stable</span>`;
    if (card.change_vs_previous_month_pct !== null) {
      const isPos = card.change_vs_previous_month_pct > 0;
      const sign = isPos ? "+" : "";
      const cls = isPos ? "positive" : "negative";
      changeHtml = `<span class="card-change ${cls}">${sign}${card.change_vs_previous_month_pct}% vs mois préc.</span>`;
    }

    cardEl.innerHTML = `
      <div class="card-top">
        <span class="card-title">${card.title}</span>
        <span class="card-tone-pill status-badge ${card.status_tone}">${card.category}</span>
      </div>
      <div class="card-value-row">
        <span class="card-value">${card.value !== null ? card.value : '—'}</span>
        <span class="card-unit">${card.display_unit}</span>
      </div>
      <div class="card-bottom">
        ${changeHtml}
        <span class="card-darija-pill">💡 الشرح بالدارجة</span>
      </div>
    `;

    cardEl.addEventListener("click", () => {
      openDarijaDrawer(card.id, card.value, card.period, data.location.name);
    });

    container.appendChild(cardEl);
  });
}

function renderSciTempChart(data) {
  destroyChart("sci-temp");
  if (typeof Chart === "undefined") return;

  const canvas = document.getElementById("chart-sci-temp");
  if (!canvas) return;

  const labels = data.monthly_series.map(m => m.month_name);
  const tSurf = data.monthly_series.map(m => m.display_values["temp_surface"]);
  const tL1 = data.monthly_series.map(m => m.display_values["temp_layer1"]);
  const tL2 = data.monthly_series.map(m => m.display_values["temp_layer2"]);
  const tL3 = data.monthly_series.map(m => m.display_values["temp_layer3"]);
  const tL4 = data.monthly_series.map(m => m.display_values["temp_layer4"]);
  const tBed = data.monthly_series.map(m => m.display_values["temp_bedrock"]);

  chartInstances["sci-temp"] = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Surface", data: tSurf, borderColor: "#ef4444", tension: 0.3, pointRadius: 3 },
        { label: "Couche 1 (0-10 cm)", data: tL1, borderColor: "#f97316", tension: 0.3, pointRadius: 3 },
        { label: "Couche 2 (10-20 cm)", data: tL2, borderColor: "#eab308", tension: 0.3, pointRadius: 3 },
        { label: "Couche 3 (20-40 cm)", data: tL3, borderColor: "#10b981", tension: 0.3, pointRadius: 3 },
        { label: "Couche 4 (40-100 cm)", data: tL4, borderColor: "#06b6d4", tension: 0.3, pointRadius: 3 },
        { label: "Bedrock (Roche Mère)", data: tBed, borderColor: "#6366f1", borderDash: [4, 4], tension: 0.3, pointRadius: 2 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { title: { display: true, text: "Température (°C)" } }
      }
    }
  });
}

function renderSciFluxChart(data) {
  destroyChart("sci-flux");
  if (typeof Chart === "undefined") return;

  const canvas = document.getElementById("chart-sci-flux");
  if (!canvas) return;

  const labels = data.monthly_series.map(m => m.month_name);
  const netRad = data.monthly_series.map(m => m.display_values["net_downward_radiation"]);
  const latHeat = data.monthly_series.map(m => m.display_values["latent_heat_flux"]);
  const sensHeat = data.monthly_series.map(m => m.display_values["sensible_heat_flux"]);

  chartInstances["sci-flux"] = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Rayonnement Net Descendant", data: netRad, borderColor: "#dc2626", fill: false, tension: 0.3 },
        { label: "Chaleur Latente (Évaporation)", data: latHeat, borderColor: "#2563eb", fill: false, tension: 0.3 },
        { label: "Chaleur Sensible", data: sensHeat, borderColor: "#eab308", fill: false, tension: 0.3 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { title: { display: true, text: "Flux Énergétique (W/m²)" } }
      }
    }
  });
}

function populateSciCrossSelectors(data) {
  const sel1 = document.getElementById("sci-select-y1");
  const sel2 = document.getElementById("sci-select-y2");
  if (!sel1 || !sel2) return;

  const vars = data.variables || [];
  sel1.innerHTML = "";
  sel2.innerHTML = "";

  vars.forEach(v => {
    const opt1 = document.createElement("option");
    opt1.value = v.id;
    opt1.textContent = `${v.name_fr} (${v.display_unit})`;
    sel1.appendChild(opt1);

    const opt2 = document.createElement("option");
    opt2.value = v.id;
    opt2.textContent = `${v.name_fr} (${v.display_unit})`;
    sel2.appendChild(opt2);
  });

  if (vars.some(v => v.id === "sm_rootzone")) sel1.value = "sm_rootzone";
  if (vars.some(v => v.id === "evapotranspiration")) sel2.value = "evapotranspiration";
}

function renderSciCrossChart(data) {
  destroyChart("sci-cross");
  if (typeof Chart === "undefined") return;

  const canvas = document.getElementById("chart-sci-cross");
  if (!canvas) return;

  const sel1 = document.getElementById("sci-select-y1");
  const sel2 = document.getElementById("sci-select-y2");
  const id1 = sel1 ? sel1.value : "sm_rootzone";
  const id2 = sel2 ? sel2.value : "evapotranspiration";

  const v1Meta = data.variables.find(v => v.id === id1) || { name_fr: id1, display_unit: "" };
  const v2Meta = data.variables.find(v => v.id === id2) || { name_fr: id2, display_unit: "" };

  const labels = data.monthly_series.map(m => m.month_name);
  const data1 = data.monthly_series.map(m => m.display_values[id1]);
  const data2 = data.monthly_series.map(m => m.display_values[id2]);

  chartInstances["sci-cross"] = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: `${v1Meta.name_fr} (${v1Meta.display_unit})`,
          data: data1,
          borderColor: "#2563eb",
          backgroundColor: "rgba(37, 99, 235, 0.1)",
          yAxisID: "y1",
          tension: 0.3,
          pointRadius: 4
        },
        {
          label: `${v2Meta.name_fr} (${v2Meta.display_unit})`,
          data: data2,
          borderColor: "#16a34a",
          backgroundColor: "rgba(22, 163, 74, 0.1)",
          yAxisID: "y2",
          tension: 0.3,
          pointRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y1: {
          type: "linear",
          position: "left",
          title: { display: true, text: `${v1Meta.name_fr} (${v1Meta.display_unit})` }
        },
        y2: {
          type: "linear",
          position: "right",
          title: { display: true, text: `${v2Meta.name_fr} (${v2Meta.display_unit})` },
          grid: { drawOnChartArea: false }
        }
      }
    }
  });
}

function renderSciDetailedTable(data) {
  const thead = document.getElementById("thead-sci-detailed");
  const tbody = document.getElementById("tbody-sci-detailed");
  if (!thead || !tbody) return;

  thead.innerHTML = "";
  tbody.innerHTML = "";

  const activeVars = data.variables.map(v => v.id);

  // Build header row
  const headerTr = document.createElement("tr");
  headerTr.innerHTML = `<th>Mois</th><th>Obs</th>`;
  activeVars.forEach(vid => {
    const v = data.variables.find(item => item.id === vid);
    const th = document.createElement("th");
    th.innerHTML = `${v ? v.name_fr : vid} <br><small style="color:#64748b;font-weight:400">${v ? v.display_unit : ''}</small>`;
    headerTr.appendChild(th);
  });
  thead.appendChild(headerTr);

  // Build data rows
  data.monthly_series.forEach(pt => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td><strong>${pt.month_name}</strong></td><td><span class="status-badge optimal">${pt.observation_count}</span></td>`;

    activeVars.forEach(vid => {
      const val = pt.display_values[vid];
      const td = document.createElement("td");
      td.textContent = val !== null ? val : '—';
      td.title = "Cliquez pour l'explication en Darija";
      td.style.cursor = "pointer";
      td.addEventListener("click", () => {
        openDarijaDrawer(vid, pt.raw_values[vid], `${pt.month_name} ${pt.year}`, data.location.name);
      });
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });
}

/* ==========================================================================
   Generic API Fetch Helper
   ========================================================================== */
async function fetchSmapApi({ mode, year, lat, lon, city, refresh = false }) {
  const loader = document.getElementById("smap-loader");
  const loaderText = document.getElementById("smap-loader-text");
  const errorBox = document.getElementById("smap-error");

  if (loader) {
    loader.hidden = false;
    if (loaderText) {
      loaderText.textContent = `Interrogation de Google Earth Engine pour ${city || 'vos coordonnées'} (NASA/SMAP/SPL4SMGP/008)...`;
    }
  }
  if (errorBox) errorBox.hidden = true;

  let url = `/api/smap-gee/timeseries?mode=${mode}&scale=11000&refresh=${refresh}&year=${year}`;
  if (lat && lon) {
    url += `&latitude=${lat}&longitude=${lon}`;
  }
  if (city) {
    url += `&city=${encodeURIComponent(city)}`;
  }

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || `Erreur HTTP ${res.status}`);
    }

    return data;
  } catch (err) {
    console.error("API Fetch error:", err);
    if (errorBox) {
      errorBox.hidden = false;
      document.getElementById("error-title").textContent = "Échec d'extraction satellite";
      document.getElementById("error-message").textContent = err.message;
    }
    return null;
  } finally {
    if (loader) loader.hidden = true;
  }
}

/* ==========================================================================
   Table Export Utilities
   ========================================================================== */
function exportTableToCSV(data) {
  if (!data) return;
  const vars = data.variables.map(v => v.id);
  const headers = ["Mois", "Annee", "Obs_Count", "Statut", ...vars];

  let csv = headers.join(",") + "\n";
  data.monthly_series.forEach(pt => {
    const row = [
      pt.month_name,
      pt.year,
      pt.observation_count,
      pt.quality_status,
      ...vars.map(v => pt.display_values[v] !== null ? pt.display_values[v] : "")
    ];
    csv += row.join(",") + "\n";
  });

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `NASA_SMAP_L4_${data.location.requested_latitude}_${data.location.requested_longitude}.csv`;
  a.click();
}

function exportTableToJSON(data) {
  if (!data) return;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `NASA_SMAP_L4_${data.location.requested_latitude}_${data.location.requested_longitude}.json`;
  a.click();
}

function destroyChart(key) {
  if (chartInstances[key]) {
    chartInstances[key].destroy();
    chartInstances[key] = null;
  }
}

/* ==========================================================================
   Moroccan Darija Drawer (الدارجة المغربية)
   ========================================================================== */
function initDarijaDrawer() {
  const drawer = document.getElementById("darija-drawer");
  const backdrop = document.getElementById("drawer-backdrop");
  const closeBtn = document.getElementById("btn-close-drawer");

  const closeDrawer = () => {
    drawer.classList.remove("open");
    backdrop.classList.remove("active");
  };

  if (closeBtn) closeBtn.addEventListener("click", closeDrawer);
  if (backdrop) backdrop.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDrawer();
  });
}

async function openDarijaDrawer(varId, value, period, locationName) {
  const drawer = document.getElementById("darija-drawer");
  const backdrop = document.getElementById("drawer-backdrop");

  try {
    const valParam = (value !== null && value !== undefined) ? `&value=${value}` : "";
    const periodParam = period ? `&period=${encodeURIComponent(period)}` : "";
    const locParam = locationName ? `&location=${encodeURIComponent(locationName)}` : "";

    const res = await fetch(`/api/smap-gee/explain?variable=${varId}${valParam}${periodParam}${locParam}`);
    const data = await res.json();

    if (!res.ok) throw new Error(data.message || "Erreur de chargement");

    // Populate drawer elements
    document.getElementById("drawer-var-title").textContent = `${data.name_fr} (${data.variable_id})`;
    document.getElementById("drawer-var-en").textContent = data.name_en;
    document.getElementById("drawer-val-number").textContent = data.display_value;
    document.getElementById("drawer-val-period").textContent = data.period;
    document.getElementById("drawer-val-loc").textContent = data.location_name;

    document.getElementById("drawer-q1-what").textContent = data.what;
    document.getElementById("drawer-q2-why").textContent = data.why_agri;
    document.getElementById("drawer-q3-val").textContent = data.interpretation;
    document.getElementById("drawer-q4-unit").textContent = data.unit_explanation;
    document.getElementById("drawer-q5-source").textContent = data.source;
    document.getElementById("drawer-q6-trend").textContent = data.temporal_change;
    document.getElementById("drawer-q7-allowed").textContent = data.conclusions_allowed;
    document.getElementById("drawer-q8-forbidden").textContent = data.conclusions_forbidden;
    document.getElementById("drawer-caveat-text").textContent = data.caveat_note;

    drawer.classList.add("open");
    backdrop.classList.add("active");

  } catch (err) {
    console.warn("Failed to load Darija explanation:", err);
  }
}

/* ==========================================================================
   Catalogue des 46 Variables (Tab 3)
   ========================================================================== */
async function loadVariablesCatalog() {
  const filterRow = document.getElementById("catalog-category-filters");
  if (!filterRow) return;

  try {
    const res = await fetch("/api/smap-gee/variables");
    const data = await res.json();
    allVariablesCatalog = data;

    filterRow.innerHTML = `<button type="button" class="preset-btn active" data-cat="all">Toutes (${data.total_variables})</button>`;
    filterRow.innerHTML += `<button type="button" class="preset-btn" data-cat="agri">🌾 Agricoles (${data.agricultural_count})</button>`;

    Object.entries(data.categories).forEach(([catKey, catMeta]) => {
      filterRow.innerHTML += `<button type="button" class="preset-btn" data-cat="${catKey}">${catMeta.name_fr}</button>`;
    });

    renderCatalogGrid("all");

    filterRow.querySelectorAll(".preset-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        filterRow.querySelectorAll(".preset-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        renderCatalogGrid(btn.dataset.cat);
      });
    });

  } catch (err) {
    console.warn("Could not load catalog:", err);
  }
}

function renderCatalogGrid(catFilter) {
  const container = document.getElementById("catalog-cards-container");
  if (!container) return;
  container.innerHTML = "";

  const vars = Object.values(allVariablesCatalog.variables || {});
  const filtered = vars.filter(v => {
    if (catFilter === "all") return true;
    if (catFilter === "agri") return v.is_agricultural;
    return v.category === catFilter;
  });

  filtered.forEach(v => {
    const card = document.createElement("div");
    card.className = `smap-card catalog-card ${v.is_agricultural ? 'optimal' : 'normal'}`;
    card.innerHTML = `
      <div class="card-top">
        <span class="card-title">${v.name_fr}</span>
        <span class="card-tone-pill status-badge ${v.is_agricultural ? 'optimal' : 'info'}">${v.is_agricultural ? 'Agricole' : 'Scientifique'}</span>
      </div>
      <div style="font-size:0.85rem;color:#475569;margin:0.5rem 0">
        <code>${v.id}</code> · <strong>${v.display_unit}</strong>
      </div>
      <div class="card-bottom">
        <span style="font-size:0.75rem;color:#64748b">${v.name_en}</span>
        <span class="card-darija-pill">💡 الشرح بالدارجة</span>
      </div>
    `;

    card.addEventListener("click", () => {
      openDarijaDrawer(v.id, null, "Catalogue officiel", "Maroc");
    });

    container.appendChild(card);
  });
}

/* ==========================================================================
   Classic NASA POWER / CMR Handlers (Tab 2)
   ========================================================================== */
function initClassicPower() {
  const form = document.querySelector("#query-form");
  if (!form) return;

  const sourceInput = document.querySelector("#source");
  const endpointInput = document.querySelector("#endpoint");
  const endpointField = document.querySelector("#endpoint-field");
  const thresholds = document.querySelector("#thresholds");
  const callBox = document.querySelector("#call");
  const idle = document.querySelector("#idle");
  const errorBox = document.querySelector("#error");
  const output = document.querySelector("#output");
  const rawBlock = document.querySelector("#raw-block");
  const raw = document.querySelector("#raw");

  const CATALOGUE_SET = new Set(["SPL3SMP_E", "SPL4SMGP", "GPM_3IMERGDF", "HLSL30"]);

  const syncSource = () => {
    const src = sourceInput.value;
    const isCat = CATALOGUE_SET.has(src);
    endpointField.hidden = src !== "power";
    thresholds.hidden = isCat || (src === "power" && endpointInput.value !== "summary");
  };

  sourceInput.addEventListener("change", syncSource);
  endpointInput.addEventListener("change", syncSource);
  syncSource();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    idle.hidden = true;
    errorBox.hidden = true;
    output.replaceChildren();
    rawBlock.hidden = true;

    const endpoint = endpointInput.value;
    const isCat = CATALOGUE_SET.has(sourceInput.value);
    const isAgro = sourceInput.value === "agro";
    const path = isCat ? "/api/catalogue" : (isAgro ? "/api/agro" : (endpoint === "summary" ? "/api/climate/summary" : (endpoint === "export" ? "/api/climate/export" : "/api/climate")));

    const params = new URLSearchParams();
    const city = document.querySelector("#city").value.trim();
    const lat = document.querySelector("#latitude").value.trim();
    const lon = document.querySelector("#longitude").value.trim();
    if (city) params.set("city", city);
    if (lat && lon) { params.set("latitude", lat); params.set("longitude", lon); }
    params.set("start_date", document.querySelector("#start-date").value);
    params.set("end_date", document.querySelector("#end-date").value);
    if (isCat) params.set("product", sourceInput.value);
    if (document.querySelector("#refresh").checked) params.set("refresh", "true");

    const fullUrl = `${path}?${params.toString()}`;
    const started = performance.now();

    try {
      const response = await fetch(fullUrl);
      const bodyText = await response.text();
      const elapsed = Math.round(performance.now() - started);

      callBox.hidden = false;
      document.querySelector("#status").textContent = response.status;
      document.querySelector("#elapsed").textContent = `${elapsed} ms`;
      document.querySelector("#request-url").textContent = fullUrl;

      if (!response.ok) {
        errorBox.hidden = false;
        errorBox.textContent = `Erreur HTTP ${response.status}: ${bodyText.slice(0, 300)}`;
      } else {
        rawBlock.hidden = false;
        raw.textContent = bodyText;
      }
    } catch (e) {
      errorBox.hidden = false;
      errorBox.textContent = `Erreur réseau: ${e.message}`;
    } finally {
      button.disabled = false;
    }
  });
}
