/**
 * FIELDShift AI — NASA SMAP Level-4 Scientific & Agricultural Explorer
 * Interactive Dashboard & Moroccan Darija (الدارجة المغربية) Explanation Engine
 */

// Global State
let currentSmapData = null;
let chartInstances = {};
let allVariablesCatalog = {};
const STORAGE_LOCATION_KEY = "fieldshift_smap_user_location";

document.addEventListener("DOMContentLoaded", () => {
  initNavTabs();
  initSubTabs();
  initPresets();
  initLocationControls();
  initSmapControls();
  initClassicPower();
  initDarijaDrawer();
  loadVariablesCatalog();
  
  // Intelligent startup: Load saved location, or request GPS, or fallback
  initLocationStartup();
});

/* ==========================================================================
   Navigation & Tab Handlers
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
}

function initSubTabs() {
  const subTabs = document.querySelectorAll(".sub-nav .sub-tab-btn");
  subTabs.forEach(tab => {
    tab.addEventListener("click", () => {
      subTabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      const targetId = tab.dataset.sub;
      document.querySelectorAll(".sub-content").forEach(c => c.classList.remove("active"));
      const targetContent = document.getElementById(targetId);
      if (targetContent) targetContent.classList.add("active");
      // Trigger resize on charts in the activated tab to ensure proper rendering
      setTimeout(() => {
        Object.values(chartInstances).forEach(c => c && c.resize && c.resize());
      }, 50);
    });
  });
}

/* ==========================================================================
   GPS Geolocation & User Location Controls
   ========================================================================== */
function initLocationControls() {
  const btnGetLocation = document.getElementById("btn-get-my-location");
  const btnInputGps = document.getElementById("btn-input-gps");
  const btnBannerGetLocation = document.getElementById("btn-banner-get-location");
  const btnBannerDismiss = document.getElementById("btn-banner-dismiss");

  const handleGpsClick = () => {
    getUserLocation({ autoFetch: true, userTriggered: true });
  };

  if (btnGetLocation) btnGetLocation.addEventListener("click", handleGpsClick);
  if (btnInputGps) btnInputGps.addEventListener("click", handleGpsClick);
  if (btnBannerGetLocation) btnBannerGetLocation.addEventListener("click", handleGpsClick);

  if (btnBannerDismiss) {
    btnBannerDismiss.addEventListener("click", () => {
      const banner = document.getElementById("location-onboarding-banner");
      if (banner) banner.style.display = "none";
    });
  }
}

async function getUserLocation({ autoFetch = true, userTriggered = false } = {}) {
  const feedback = document.getElementById("gps-status-feedback");
  const feedbackText = document.getElementById("gps-status-text");
  const banner = document.getElementById("location-onboarding-banner");

  if (!("geolocation" in navigator)) {
    if (userTriggered) {
      alert("La géolocalisation GPS n'est pas supportée par votre navigateur.");
    }
    return;
  }

  if (feedback && feedbackText) {
    feedback.hidden = false;
    feedback.className = "gps-feedback-bar";
    feedbackText.textContent = "🛰️ Détection de vos coordonnées GPS en cours...";
  }

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;

      document.getElementById("smap-lat").value = lat.toFixed(4);
      document.getElementById("smap-lon").value = lon.toFixed(4);

      // Indicate GPS active on preset buttons
      document.querySelectorAll(".preset-btn").forEach(b => b.classList.remove("active"));
      const btnGps = document.getElementById("btn-get-my-location");
      if (btnGps) btnGps.classList.add("active");

      if (feedbackText) {
        feedbackText.textContent = `📍 Coordonnées GPS reçues (${lat.toFixed(4)}, ${lon.toFixed(4)}) · Identification de la localité...`;
      }

      // Two-tier reverse geocoding: backend first, then direct browser client fallback
      let cityName = `Position GPS (${lat.toFixed(4)}, ${lon.toFixed(4)})`;
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

      // If backend returned generic fallback, try direct browser fetch to Nominatim
      if (cityName.startsWith("Position GPS") || cityName.startsWith("Coordonnées")) {
        try {
          const directRes = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=jsonv2&addressdetails=1`);
          if (directRes.ok) {
            const d = await directRes.json();
            const addr = d.address || {};
            const place = addr.city || addr.town || addr.village || addr.municipality || addr.suburb || addr.county || addr.state;
            const country = addr.country || "";
            if (place) {
              cityName = country ? `${place}, ${country}` : place;
            } else if (d.display_name) {
              cityName = d.display_name.split(",").slice(0, 2).join(",").trim();
            }
          }
        } catch (e2) {
          console.warn("Client reverse geocode fallback failed:", e2);
        }
      }

      document.getElementById("smap-city").value = cityName;

      // Update feedback banner
      if (feedback && feedbackText) {
        feedback.className = "gps-feedback-bar success";
        feedbackText.textContent = `✅ Position GPS identifiée : ${cityName} (${lat.toFixed(4)}°N, ${lon.toFixed(4)}°W)`;
      }

      // Update top banner
      if (banner) {
        banner.classList.add("detected");
        const titleEl = document.getElementById("banner-geo-title");
        const descEl = document.getElementById("banner-geo-desc");
        const primaryBtn = document.getElementById("btn-banner-get-location");
        if (titleEl) titleEl.textContent = `📍 Localisation Active : ${cityName}`;
        if (descEl) descEl.textContent = `Données satellitaires SMAP L4 V008 extraites pour vos coordonnées (${lat.toFixed(4)}°N, ${lon.toFixed(4)}°W).`;
        if (primaryBtn) primaryBtn.innerHTML = `<span>🔄 Réactualiser ma position</span>`;
      }

      // Store detected location in localStorage
      try {
        localStorage.setItem(STORAGE_LOCATION_KEY, JSON.stringify({
          lat: lat.toFixed(4),
          lon: lon.toFixed(4),
          city: cityName,
        }));
      } catch (e) {
        console.warn("Failed to store location:", e);
      }

      if (autoFetch) {
        fetchSmapData();
      }
    },
    (error) => {
      console.warn("Geolocation error:", error);
      if (feedback && feedbackText) {
        if (userTriggered) {
          feedback.hidden = false;
          feedback.className = "gps-feedback-bar error";
          feedbackText.textContent = `⚠️ Impossible d'obtenir la position GPS (${error.message}). Veuillez autoriser la localisation ou saisir votre ville manuellement.`;
        } else {
          feedback.hidden = true;
        }
      }

      // If initial auto-detect failed or was denied, and no data is loaded yet, load initial example
      if (!currentSmapData) {
        if (!document.getElementById("smap-lat").value) {
          document.getElementById("smap-lat").value = "33.8900";
          document.getElementById("smap-lon").value = "-5.5500";
          document.getElementById("smap-city").value = "Meknes, Morocco";
          const meknesBtn = document.getElementById("btn-preset-meknes");
          if (meknesBtn) meknesBtn.classList.add("active");
        }
        fetchSmapData();
      }
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000,
    }
  );
}

function initLocationStartup() {
  const saved = localStorage.getItem(STORAGE_LOCATION_KEY);
  if (saved) {
    try {
      const loc = JSON.parse(saved);
      if (loc.lat && loc.lon) {
        document.getElementById("smap-lat").value = Number(loc.lat).toFixed(4);
        document.getElementById("smap-lon").value = Number(loc.lon).toFixed(4);
        document.getElementById("smap-city").value = loc.city || `${Number(loc.lat).toFixed(4)}, ${Number(loc.lon).toFixed(4)}`;

        document.querySelectorAll(".preset-btn").forEach(b => b.classList.remove("active"));
        const btnGps = document.getElementById("btn-get-my-location");
        if (btnGps) btnGps.classList.add("active");

        const banner = document.getElementById("location-onboarding-banner");
        if (banner) {
          banner.classList.add("detected");
          const titleEl = document.getElementById("banner-geo-title");
          const descEl = document.getElementById("banner-geo-desc");
          const primaryBtn = document.getElementById("btn-banner-get-location");
          if (titleEl) titleEl.textContent = `📍 Localisation Mémorisée : ${loc.city}`;
          if (descEl) descEl.textContent = `Coordonnées : ${Number(loc.lat).toFixed(4)}°N, ${Number(loc.lon).toFixed(4)}°W. Cliquez sur "Actualiser" pour relancer la détection GPS.`;
          if (primaryBtn) primaryBtn.innerHTML = `<span>🔄 Réactualiser ma position</span>`;
        }

        fetchSmapData();
        return;
      }
    } catch (e) {
      console.warn("Could not read saved location:", e);
    }
  }

  // If no saved location, attempt auto-detect via navigator.geolocation
  if ("geolocation" in navigator) {
    getUserLocation({ autoFetch: true, userTriggered: false });
  } else {
    document.getElementById("smap-lat").value = "33.8900";
    document.getElementById("smap-lon").value = "-5.5500";
    document.getElementById("smap-city").value = "Meknes, Morocco";
    const meknesBtn = document.getElementById("btn-preset-meknes");
    if (meknesBtn) meknesBtn.classList.add("active");
    fetchSmapData();
  }
}

/* ==========================================================================
   Preset Locations
   ========================================================================== */
function initPresets() {
  const presets = {
    meknes: { name: "Meknes, Morocco", lat: 33.8900, lon: -5.5500 },
    gharbi: { name: "Sidi Slimane, Gharb", lat: 34.3000, lon: -5.9000 },
    tadla: { name: "Beni Mellal, Tadla", lat: 32.4000, lon: -6.5000 },
    souss: { name: "Taroudant, Souss", lat: 30.4000, lon: -9.1000 },
  };

  document.querySelectorAll(".preset-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      if (btn.id === "btn-get-my-location") return; // Handled separately
      document.querySelectorAll(".preset-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const key = btn.id.replace("btn-preset-", "");
      const preset = presets[key];
      if (preset) {
        document.getElementById("smap-city").value = preset.name;
        document.getElementById("smap-lat").value = preset.lat.toFixed(4);
        document.getElementById("smap-lon").value = preset.lon.toFixed(4);

        // Remove GPS detected styling from banner
        const banner = document.getElementById("location-onboarding-banner");
        if (banner) banner.classList.remove("detected");
        const feedback = document.getElementById("gps-status-feedback");
        if (feedback) feedback.hidden = true;
      }
    });
  });

  // Geocode button
  document.getElementById("btn-geocode").addEventListener("click", async () => {
    const city = document.getElementById("smap-city").value.trim();
    if (!city) return;
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=jsonv2&limit=1`);
      const data = await res.json();
      if (data && data.length > 0) {
        document.getElementById("smap-lat").value = parseFloat(data[0].lat).toFixed(4);
        document.getElementById("smap-lon").value = parseFloat(data[0].lon).toFixed(4);
        document.querySelectorAll(".preset-btn").forEach(b => b.classList.remove("active"));
      } else {
        alert("Ville non trouvée par Nominatim.");
      }
    } catch (e) {
      console.warn("Geocoding failed:", e);
    }
  });
}

/* ==========================================================================
   SMAP Data Extraction & Rendering
   ========================================================================== */
function initSmapControls() {
  const yearSelect = document.getElementById("smap-year");
  const customDateContainer = document.getElementById("custom-date-container");
  
  yearSelect.addEventListener("change", () => {
    if (yearSelect.value === "custom") {
      customDateContainer.hidden = false;
    } else {
      customDateContainer.hidden = true;
      const y = parseInt(yearSelect.value);
      document.getElementById("smap-start").value = `${y}-01-01`;
      document.getElementById("smap-end").value = `${y}-12-31`;
    }
  });

  document.getElementById("smap-form").addEventListener("submit", (e) => {
    e.preventDefault();
    fetchSmapData();
  });

  // Dual axis update button
  document.getElementById("btn-update-cross").addEventListener("click", () => {
    if (currentSmapData) renderCrossChart(currentSmapData);
  });

  // Table search
  document.getElementById("table-search").addEventListener("input", (e) => {
    filterTable(e.target.value.toLowerCase());
  });

  // Table Export buttons
  document.getElementById("btn-export-csv").addEventListener("click", exportTableToCSV);
  document.getElementById("btn-export-json").addEventListener("click", exportTableToJSON);
}

async function fetchSmapData() {
  const loader = document.getElementById("smap-loader");
  const loaderText = document.getElementById("smap-loader-text");
  const errorBox = document.getElementById("smap-error");
  const banner = document.getElementById("smap-metrics-banner");
  const submitBtn = document.getElementById("btn-run-smap");

  loader.hidden = false;
  errorBox.hidden = true;
  submitBtn.disabled = true;

  const lat = document.getElementById("smap-lat").value;
  const lon = document.getElementById("smap-lon").value;
  const city = document.getElementById("smap-city").value;
  const year = document.getElementById("smap-year").value;
  const mode = document.getElementById("smap-mode").value;
  const scale = document.getElementById("smap-scale").value;
  const refresh = document.getElementById("smap-refresh").checked;

  if (loaderText) {
    loaderText.textContent = `Interrogation de Google Earth Engine pour ${city || 'votre position'} (NASA/SMAP/SPL4SMGP/008)...`;
  }

  let url = `/api/smap-gee/timeseries?latitude=${lat}&longitude=${lon}&city=${encodeURIComponent(city)}&mode=${mode}&scale=${scale}&refresh=${refresh}`;
  if (year !== "custom") {
    url += `&year=${year}`;
  } else {
    const start = document.getElementById("smap-start").value;
    const end = document.getElementById("smap-end").value;
    url += `&start_date=${start}&end_date=${end}`;
  }

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || `Erreur serveur HTTP ${response.status}`);
    }

    currentSmapData = data;
    renderAllViews(data);

    // Update metrics banner
    banner.hidden = false;
    document.getElementById("metric-status").textContent = "200 OK (Succès)";
    document.getElementById("metric-cache").textContent = data.cached ? "HIT (Cache Disque)" : "MISS (Requête GEE)";
    document.getElementById("metric-time").textContent = `${data.processing_time_ms} ms`;
    document.getElementById("metric-obs").textContent = `${data.monthly_series.reduce((acc, m) => acc + m.observation_count, 0)} obs. 3h`;
    document.getElementById("metric-coords").textContent = `${data.location.requested_latitude}°N, ${data.location.requested_longitude}°E`;

  } catch (err) {
    console.error("SMAP Fetch error:", err);
    errorBox.hidden = false;
    document.getElementById("error-title").textContent = "Échec d'extraction NASA SMAP";
    document.getElementById("error-message").textContent = err.message;
  } finally {
    loader.hidden = true;
    submitBtn.disabled = false;
  }
}

function renderAllViews(data) {
  renderSummaryCards(data);
  renderAnnualSummaryTable(data);
  renderMoistureChart(data);
  renderDroughtCharts(data);
  renderTemperatureChart(data);
  renderWaterFluxChart(data);
  populateCrossSelectors(data);
  renderCrossChart(data);
  renderDetailedTable(data);
}

/* ==========================================================================
   Overview Summary Cards
   ========================================================================== */
function renderSummaryCards(data) {
  const container = document.getElementById("cards-container");
  container.innerHTML = "";

  if (!data.summary_cards || data.summary_cards.length === 0) {
    container.innerHTML = `<p class="hint">Aucune carte disponible pour cette période.</p>`;
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
        <span class="card-darija-pill">💡 الدارجة المغربية</span>
      </div>
    `;

    cardEl.addEventListener("click", () => {
      openDarijaDrawer(card.id, card.value, card.period, data.location.name);
    });

    container.appendChild(cardEl);
  });
}

function renderAnnualSummaryTable(data) {
  const tbody = document.getElementById("tbody-annual-summary");
  tbody.innerHTML = "";
  document.getElementById("annual-period-badge").textContent = `${data.start_date} à ${data.end_date}`;

  if (!data.annual_summary || data.annual_summary.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8">Aucune donnée annuelle.</td></tr>`;
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
      <td><button type="button" class="btn-sm" style="font-family:var(--font-arabic);font-weight:700">💡 الشرح</button></td>
    `;

    tr.addEventListener("click", () => {
      openDarijaDrawer(item.variable_id, item.mean, "Moyenne annuelle", data.location.name);
    });

    tbody.appendChild(tr);
  });
}

/* ==========================================================================
   Interactive Scientific Charts (Chart.js)
   ========================================================================== */
function destroyChart(key) {
  if (chartInstances[key]) {
    chartInstances[key].destroy();
    chartInstances[key] = null;
  }
}

function renderMoistureChart(data) {
  destroyChart("moisture");
  if (typeof Chart === "undefined") {
    console.warn("Chart.js is not loaded yet.");
    return;
  }
  const ctx = document.getElementById("chart-moisture-evolution").getContext("2d");
  const labels = data.monthly_series.map(m => m.month_name);
  
  const surfData = data.monthly_series.map(m => m.display_values["sm_surface"]);
  const rootData = data.monthly_series.map(m => m.display_values["sm_rootzone"]);
  const profData = data.monthly_series.map(m => m.display_values["sm_profile"]);

  chartInstances["moisture"] = new Chart(ctx, {
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

  // Insight text
  const meanRoot = rootData.filter(v => v !== null);
  if (meanRoot.length > 0) {
    const avg = (meanRoot.reduce((a, b) => a + b, 0) / meanRoot.length).toFixed(3);
    document.getElementById("insight-moisture").textContent = 
      `Humidité moyenne de la zone racinaire : ${avg} m³/m³. Les pics d'humidité correspondent aux précipitations hivernales/printanières, tandis que les valeurs estivales reflètent l'épuisement progressif de la réserve utile.`;
  }
}

function renderDroughtCharts(data) {
  destroyChart("drought");
  destroyChart("wetness");
  destroyChart("anomalies");
  if (typeof Chart === "undefined") {
    console.warn("Chart.js is not loaded yet.");
    return;
  }

  const labels = data.monthly_series.map(m => m.month_name);

  // 1. Percentiles Chart
  const pctlData = data.monthly_series.map(m => m.display_values["sm_rootzone_pctl"]);
  const ctxPctl = document.getElementById("chart-drought-percentiles").getContext("2d");
  
  chartInstances["drought"] = new Chart(ctxPctl, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Percentile Racinaire (%)",
        data: pctlData,
        backgroundColor: pctlData.map(v => v < 20 ? "#dc2626" : (v < 40 ? "#f59e0b" : "#10b981")),
        borderRadius: 4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `Percentile: ${ctx.raw}% (${ctx.raw < 20 ? 'Sécheresse Sévère' : ctx.raw < 40 ? 'Sécheresse Modérée' : 'Normal'})`
          }
        }
      },
      scales: {
        y: { title: { display: true, text: "Percentile (%)" }, min: 0, max: 100 }
      }
    }
  });

  // 2. Wetness & Wilting Chart
  const wetData = data.monthly_series.map(m => m.display_values["sm_rootzone_wetness"]);
  const wiltData = data.monthly_series.map(m => m.display_values["land_fraction_wilting"]);
  const ctxWet = document.getElementById("chart-wetness-wilting").getContext("2d");

  chartInstances["wetness"] = new Chart(ctxWet, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Degré de Saturation Racinaire (%)",
          data: wetData,
          borderColor: "#0284c7",
          backgroundColor: "rgba(2, 132, 199, 0.1)",
          fill: true,
          tension: 0.3,
          borderWidth: 2.5
        },
        {
          label: "Surface au point de flétrissement (%)",
          data: wiltData,
          borderColor: "#dc2626",
          tension: 0.3,
          borderWidth: 2,
          borderDash: [4, 4]
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { title: { display: true, text: "Pourcentage (%)" }, min: 0, max: 100 }
      }
    }
  });

  // 3. Anomalies Diverging Bar Chart
  const anomData = data.monthly_series.map(m => m.display_values["sm_surface_anomaly"]);
  const ctxAnom = document.getElementById("chart-anomalies").getContext("2d");

  chartInstances["anomalies"] = new Chart(ctxAnom, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Anomalie (m³/m³)",
        data: anomData,
        backgroundColor: anomData.map(v => v >= 0 ? "#10b981" : "#ef4444"),
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { title: { display: true, text: "Anomalie d'humidité (m³/m³)" } }
      }
    }
  });
}

function renderTemperatureChart(data) {
  destroyChart("temp");
  if (typeof Chart === "undefined") return;
  const ctx = document.getElementById("chart-soil-temp").getContext("2d");
  const labels = data.monthly_series.map(m => m.month_name);

  chartInstances["temp"] = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Surface (°C)",
          data: data.monthly_series.map(m => m.display_values["surface_temp"]),
          borderColor: "#f97316",
          tension: 0.3,
          borderWidth: 2,
        },
        {
          label: "Couche 1 (0-10 cm) - Lit de Semence",
          data: data.monthly_series.map(m => m.display_values["soil_temp_layer1"]),
          borderColor: "#ea580c",
          tension: 0.3,
          borderWidth: 3,
        },
        {
          label: "Couche 2 (10-20 cm)",
          data: data.monthly_series.map(m => m.display_values["soil_temp_layer2"]),
          borderColor: "#ca8a04",
          tension: 0.3,
          borderWidth: 2,
        },
        {
          label: "Couche 4 (40-100 cm)",
          data: data.monthly_series.map(m => m.display_values["soil_temp_layer4"]),
          borderColor: "#475569",
          borderDash: [5, 5],
          tension: 0.3,
          borderWidth: 2,
        }
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

function renderWaterFluxChart(data) {
  destroyChart("water");
  if (typeof Chart === "undefined") return;
  const ctx = document.getElementById("chart-water-fluxes").getContext("2d");
  const labels = data.monthly_series.map(m => m.month_name);

  chartInstances["water"] = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Précipitations (mm/jour)",
          data: data.monthly_series.map(m => m.display_values["precipitation_total_surface_flux"]),
          backgroundColor: "#3b82f6",
          borderRadius: 4
        },
        {
          label: "Évapotranspiration ET (mm/jour)",
          data: data.monthly_series.map(m => m.display_values["land_evapotranspiration_flux"]),
          backgroundColor: "#f59e0b",
          borderRadius: 4
        },
        {
          label: "Infiltration dans le sol (mm/jour)",
          data: data.monthly_series.map(m => m.display_values["soil_water_infiltration_flux"]),
          backgroundColor: "#10b981",
          borderRadius: 4
        },
        {
          label: "Ruissellement de surface (mm/jour)",
          data: data.monthly_series.map(m => m.display_values["overland_runoff_flux"]),
          backgroundColor: "#ef4444",
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { title: { display: true, text: "Flux d'eau (mm/jour)" }, min: 0 }
      }
    }
  });
}

function populateCrossSelectors(data) {
  const sel1 = document.getElementById("select-var-y1");
  const sel2 = document.getElementById("select-var-y2");
  sel1.innerHTML = "";
  sel2.innerHTML = "";

  data.variables.forEach(v => {
    sel1.add(new Option(`${v.name_fr} (${v.display_unit})`, v.id));
    sel2.add(new Option(`${v.name_fr} (${v.display_unit})`, v.id));
  });

  // Defaults
  sel1.value = "sm_rootzone";
  sel2.value = "land_evapotranspiration_flux";
}

function renderCrossChart(data) {
  destroyChart("cross");
  if (typeof Chart === "undefined") return;
  const var1 = document.getElementById("select-var-y1").value;
  const var2 = document.getElementById("select-var-y2").value;
  const meta1 = data.variables.find(v => v.id === var1);
  const meta2 = data.variables.find(v => v.id === var2);

  const ctx = document.getElementById("chart-cross-variables").getContext("2d");
  const labels = data.monthly_series.map(m => m.month_name);

  chartInstances["cross"] = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: `${meta1 ? meta1.name_fr : var1} (${meta1 ? meta1.display_unit : ''})`,
          data: data.monthly_series.map(m => m.display_values[var1]),
          borderColor: "#2563eb",
          backgroundColor: "rgba(37, 99, 235, 0.1)",
          yAxisID: "y1",
          tension: 0.3,
          borderWidth: 3
        },
        {
          label: `${meta2 ? meta2.name_fr : var2} (${meta2 ? meta2.display_unit : ''})`,
          data: data.monthly_series.map(m => m.display_values[var2]),
          borderColor: "#f59e0b",
          yAxisID: "y2",
          tension: 0.3,
          borderWidth: 3
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
          title: { display: true, text: meta1 ? `${meta1.name_fr} (${meta1.display_unit})` : var1 }
        },
        y2: {
          type: "linear",
          position: "right",
          title: { display: true, text: meta2 ? `${meta2.name_fr} (${meta2.display_unit})` : var2 },
          grid: { drawOnChartArea: false }
        }
      }
    }
  });
}

/* ==========================================================================
   Detailed Scientific Table & Exports
   ========================================================================== */
function renderDetailedTable(data) {
  const thead = document.getElementById("thead-detailed-series");
  const tbody = document.getElementById("tbody-detailed-series");
  thead.innerHTML = "";
  tbody.innerHTML = "";

  const activeVars = data.variables.map(v => v.id);

  // Build Table Header
  const trHead = document.createElement("tr");
  trHead.innerHTML = `<th>Mois / Date</th><th>Obs. 3h</th><th>Statut</th>`;
  activeVars.forEach(vid => {
    const meta = data.variables.find(v => v.id === vid);
    trHead.innerHTML += `<th title="${meta ? meta.name_en : vid}">${meta ? meta.name_fr : vid} <small>(${meta ? meta.display_unit : ''})</small></th>`;
  });
  thead.appendChild(trHead);

  // Build Rows
  data.monthly_series.forEach(pt => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${pt.month_name} ${pt.year}</strong></td>
      <td>${pt.observation_count}</td>
      <td><span class="status-badge ${pt.quality_status === 'complete' ? 'optimal' : 'warning'}">${pt.quality_status}</span></td>
    `;

    activeVars.forEach(vid => {
      const val = pt.display_values[vid];
      const valStr = val !== null ? val : '—';
      const td = document.createElement("td");
      td.textContent = valStr;
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

function filterTable(keyword) {
  const rows = document.querySelectorAll("#tbody-detailed-series tr");
  rows.forEach(r => {
    r.style.display = r.textContent.toLowerCase().includes(keyword) ? "" : "none";
  });
}

function exportTableToCSV() {
  if (!currentSmapData) return;
  const vars = currentSmapData.variables.map(v => v.id);
  const headers = ["Mois", "Annee", "Obs_Count", "Statut", ...vars];
  
  let csv = headers.join(",") + "\n";
  currentSmapData.monthly_series.forEach(pt => {
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
  a.download = `NASA_SMAP_L4_${currentSmapData.location.requested_latitude}_${currentSmapData.location.requested_longitude}.csv`;
  a.click();
}

function exportTableToJSON() {
  if (!currentSmapData) return;
  const blob = new Blob([JSON.stringify(currentSmapData, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `NASA_SMAP_L4_${currentSmapData.location.requested_latitude}_${currentSmapData.location.requested_longitude}.json`;
  a.click();
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

  closeBtn.addEventListener("click", closeDrawer);
  backdrop.addEventListener("click", closeDrawer);
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
   Catalogue des 46 Variables
   ========================================================================== */
async function loadVariablesCatalog() {
  const container = document.getElementById("catalog-cards-container");
  const filterRow = document.getElementById("catalog-category-filters");

  try {
    const res = await fetch("/api/smap-gee/variables");
    const data = await res.json();
    allVariablesCatalog = data;

    // Build Category Filter Buttons
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
   Classic NASA POWER / CMR Handlers (Preserved from original tester)
   ========================================================================== */
function initClassicPower() {
  const form = document.querySelector("#query-form");
  if (!form) return;

  const sourceInput = document.querySelector("#source");
  const endpointInput = document.querySelector("#endpoint");
  const endpointField = document.querySelector("#endpoint-field");
  const productNote = document.querySelector("#product-note");
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
