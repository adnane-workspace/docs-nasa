const form = document.querySelector("#query-form");
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

const INDICATOR_LABELS = {
  average_temperature: "Température moyenne",
  minimum_temperature: "Température minimale",
  maximum_temperature: "Température maximale",
  total_precipitation: "Précipitation totale",
  average_relative_humidity: "Humidité moyenne",
  average_wind_speed: "Vent moyen",
  average_solar_radiation: "Rayonnement solaire moyen",
  dry_days: "Jours secs",
  hot_days: "Jours chauds",
  cold_days: "Jours froids",
};

const CATALOGUE = new Set(["SPL3SMP_E", "SPL4SMGP", "GPM_3IMERGDF", "HLSL30"]);

const SOURCE_NOTES = {
  power: "Température, précipitations, humidité de l'air, vent et rayonnement. Communauté agricole AG.",
  SPL3SMP_E: "Humidité superficielle du sol · 9 km. Le test liste les granules NASA, pas une valeur d'humidité inventée.",
  SPL4SMGP: "Humidité en surface et dans la zone racinaire · 9 km. Granules toutes les 3 heures.",
  GPM_3IMERGDF: "Précipitations journalières IMERG Final · environ 10 km. Le test liste les granules, pas une lame d'eau inventée.",
  HLSL30: "Réflectance Landsat harmonisée HLS · 30 m. Une scène ne couvre pas chaque jour : le test prend 16 jours et ne calcule pas de NDVI.",
  agro: "Recommandations et rotation calculées sur les observations NASA POWER de la période. Aucun rendement inventé.",
};

sourceInput.addEventListener("change", syncSource);
endpointInput.addEventListener("change", syncSource);
syncSource();

function syncSource() {
  const source = sourceInput.value;
  const catalogue = CATALOGUE.has(source);
  endpointField.hidden = source !== "power";
  thresholds.hidden = catalogue || (source === "power" && endpointInput.value !== "summary");
  productNote.textContent = SOURCE_NOTES[source];
  const start = document.querySelector("#start-date");
  const end = document.querySelector("#end-date");
  const automatic = (
    (start.value === "2025-01-01" && end.value === "2025-12-31")
    || (start.value === "2025-06-01" && end.value === "2025-06-02")
    || (start.value === "2025-06-01" && end.value === "2025-06-16")
  );
  if (!automatic) return;
  if (source === "HLSL30") {
    start.value = "2025-06-01";
    end.value = "2025-06-16";
  } else if (catalogue) {
    start.value = "2025-06-01";
    end.value = "2025-06-02";
  } else {
    start.value = "2025-01-01";
    end.value = "2025-12-31";
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = form.querySelector("button[type=submit]");
  const url = buildUrl();
  button.disabled = true;
  idle.hidden = true;
  errorBox.hidden = true;
  output.replaceChildren();
  rawBlock.hidden = true;

  const started = performance.now();
  let response;
  let bodyText = "";
  try {
    response = await fetch(url);
    bodyText = await response.text();
  } catch (error) {
    showCall({ url, status: "réseau", ok: false, elapsed: performance.now() - started, cache: "—", size: "—" });
    showError("Le navigateur n'a pas pu joindre l'API. Vérifiez que le serveur tourne sur le port 8000.");
    button.disabled = false;
    return;
  }
  const elapsed = performance.now() - started;
  const payload = parseJson(bodyText);
  const cache = readCache(response, payload);
  showCall({
    url,
    status: String(response.status),
    ok: response.ok,
    elapsed,
    cache,
    size: formatBytes(new Blob([bodyText]).size),
  });

  if (!response.ok) {
    const message = payload && payload.message ? payload.message : bodyText.slice(0, 500);
    showError(message || "La requête a échoué.");
    showRaw(payload ? JSON.stringify(payload, null, 2) : bodyText);
    button.disabled = false;
    return;
  }

  if (CATALOGUE.has(sourceInput.value)) {
    renderSmap(payload);
    showRaw(JSON.stringify(payload, null, 2));
  } else if (sourceInput.value === "agro") {
    renderAgro(payload);
    showRaw(JSON.stringify(payload, null, 2));
  } else if (endpointInput.value === "export") {
    renderCsv(bodyText);
  } else if (endpointInput.value === "summary") {
    renderSummary(payload);
    showRaw(JSON.stringify(payload, null, 2));
  } else {
    renderDaily(payload);
    showRaw(JSON.stringify(payload, null, 2));
  }
  button.disabled = false;
});

document.querySelector("#copy-url").addEventListener("click", async () => {
  const url = document.querySelector("#request-url").textContent;
  await navigator.clipboard.writeText(url);
});

function buildUrl() {
  const endpoint = endpointInput.value;
  const catalogue = CATALOGUE.has(sourceInput.value);
  const agro = sourceInput.value === "agro";
  const path = catalogue
    ? "/api/catalogue"
    : agro
      ? "/api/agro"
      : endpoint === "summary"
    ? "/api/climate/summary"
    : endpoint === "export"
      ? "/api/climate/export"
      : "/api/climate";
  const params = new URLSearchParams();
  const city = document.querySelector("#city").value.trim();
  const latitude = document.querySelector("#latitude").value.trim();
  const longitude = document.querySelector("#longitude").value.trim();
  if (city) params.set("city", city);
  if (latitude) params.set("latitude", latitude);
  if (longitude) params.set("longitude", longitude);
  params.set("start_date", document.querySelector("#start-date").value);
  params.set("end_date", document.querySelector("#end-date").value);
  if (document.querySelector("#refresh").checked) params.set("refresh", "true");
  if (catalogue) {
    params.set("product", sourceInput.value);
    return `${window.location.origin}${path}?${params.toString()}`;
  }
  if (agro || endpoint === "summary") {
    params.set("hot_day_threshold", document.querySelector("#hot").value);
    params.set("cold_day_threshold", document.querySelector("#cold").value);
    params.set("dry_day_threshold", document.querySelector("#dry").value);
  }
  return `${window.location.origin}${path}?${params.toString()}`;
}

function showCall({ url, status, ok, elapsed, cache, size }) {
  callBox.hidden = false;
  callBox.scrollIntoView({ block: "nearest" });
  const statusNode = document.querySelector("#status");
  statusNode.textContent = status;
  statusNode.className = ok ? "ok" : "bad";
  document.querySelector("#elapsed").textContent = `${elapsed.toFixed(0)} ms`;
  document.querySelector("#cache").textContent = cache;
  document.querySelector("#size").textContent = size;
  document.querySelector("#request-url").textContent = url;
}

function showError(message) {
  errorBox.hidden = false;
  errorBox.textContent = message;
}

function showRaw(text) {
  rawBlock.hidden = false;
  raw.textContent = text;
}

function renderSummary(payload) {
  const location = payload.location || {};
  const period = payload.period || {};
  const units = payload.indicator_units || {};
  const indicators = payload.indicators || {};
  const intro = document.createElement("p");
  intro.className = "meta";
  intro.textContent = [
    location.name || "Coordonnées directes",
    `${formatNumber(location.requested_latitude)}, ${formatNumber(location.requested_longitude)}`,
    `${period.start_date} → ${period.end_date}`,
    `${period.returned_day_count}/${period.requested_day_count} jours`,
  ].join(" · ");
  const cards = document.createElement("div");
  cards.className = "cards";
  for (const [key, label] of Object.entries(INDICATOR_LABELS)) {
    const article = document.createElement("article");
    const caption = document.createElement("span");
    caption.textContent = label;
    const value = document.createElement("strong");
    const unit = units[key] ? ` ${units[key]}` : "";
    value.textContent = indicators[key] === null || indicators[key] === undefined
      ? "—"
      : `${formatNumber(indicators[key])}${unit}`;
    article.append(caption, value);
    cards.append(article);
  }
  output.append(intro, cards);
}

function renderAgro(payload) {
  const location = payload.location || {};
  const period = payload.period || {};
  const intro = document.createElement("p");
  intro.className = "meta";
  intro.textContent = [
    location.name || "Coordonnées directes",
    `${period.start_date} → ${period.end_date}`,
    payload.nasa_source,
  ].filter(Boolean).join(" · ");
  const cards = document.createElement("div");
  cards.className = "cards";
  for (const item of payload.recommendations || []) {
    const article = document.createElement("article");
    const caption = document.createElement("span");
    caption.textContent = item.code;
    const value = document.createElement("strong");
    value.textContent = item.message;
    const detail = document.createElement("p");
    detail.className = "hint";
    detail.textContent = item.observed;
    article.append(caption, value, detail);
    cards.append(article);
  }
  const rotation = document.createElement("ol");
  for (const step of payload.rotation || []) {
    const line = document.createElement("li");
    line.textContent = step.action;
    rotation.append(line);
  }
  const notes = document.createElement("div");
  for (const note of payload.notes || []) {
    const line = document.createElement("p");
    line.className = "hint";
    line.textContent = note;
    notes.append(line);
  }
  output.append(intro, cards, rotation, notes);
}

function renderDaily(payload) {
  const rows = payload.observations || [];
  const intro = document.createElement("p");
  intro.className = "meta";
  intro.textContent = `${payload.observation_count} jours · source ${payload.source} · ${payload.retrieved_at}`;
  const wrap = document.createElement("div");
  wrap.className = "table-wrap";
  const table = document.createElement("table");
  const columns = ["date", "T2M", "T2M_MAX", "T2M_MIN", "PRECTOTCORR", "RH2M", "WS2M", "ALLSKY_SFC_SW_DWN"];
  const head = document.createElement("tr");
  for (const column of columns) {
    const cell = document.createElement("th");
    const unit = payload.units && payload.units[column] ? ` (${payload.units[column]})` : "";
    cell.textContent = column === "date" ? "date" : `${column}${unit}`;
    head.append(cell);
  }
  const thead = document.createElement("thead");
  thead.append(head);
  const tbody = document.createElement("tbody");
  for (const row of rows) {
    const line = document.createElement("tr");
    for (const column of columns) {
      const cell = document.createElement("td");
      if (row[column] === null || row[column] === undefined) {
        cell.textContent = "—";
        cell.className = "missing";
      } else {
        cell.textContent = column === "date" ? row[column] : formatNumber(row[column]);
      }
      line.append(cell);
    }
    tbody.append(line);
  }
  table.append(thead, tbody);
  wrap.append(table);
  output.append(intro, wrap);
}

function renderSmap(payload) {
  const location = payload.location || {};
  const intro = document.createElement("p");
  intro.className = "meta";
  intro.textContent = [
    payload.product,
    payload.data,
    payload.resolution || (payload.resolution_km ? `${payload.resolution_km} km` : ""),
    payload.usage,
    location.name || "Coordonnées directes",
    `${payload.granules_returned}/${payload.granule_count} granules`,
  ].filter(Boolean).join(" · ");
  const notes = document.createElement("div");
  for (const note of payload.notes || []) {
    const line = document.createElement("p");
    line.className = "hint";
    line.textContent = note;
    notes.append(line);
  }
  const wrap = document.createElement("div");
  wrap.className = "table-wrap";
  const table = document.createElement("table");
  const head = document.createElement("tr");
  for (const label of ["Début", "Fin", "Granule", "Taille", "Fichier"]) {
    const cell = document.createElement("th");
    cell.textContent = label;
    head.append(cell);
  }
  const thead = document.createElement("thead");
  thead.append(head);
  const tbody = document.createElement("tbody");
  for (const granule of payload.granules || []) {
    const line = document.createElement("tr");
    const start = document.createElement("td");
    start.textContent = granule.time_start || "—";
    const end = document.createElement("td");
    end.textContent = granule.time_end || "—";
    const title = document.createElement("td");
    title.textContent = granule.title || "—";
    const size = document.createElement("td");
    size.textContent = granule.size_mb == null ? "—" : `${formatNumber(granule.size_mb)} Mo`;
    const file = document.createElement("td");
    file.className = "link";
    if (granule.download_url) {
      const link = document.createElement("a");
      link.href = granule.download_url;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = "Télécharger (Earthdata)";
      file.append(link);
    } else {
      file.textContent = "—";
    }
    line.append(start, end, title, size, file);
    tbody.append(line);
  }
  table.append(thead, tbody);
  wrap.append(table);
  output.append(intro, notes, wrap);
}

function renderCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const intro = document.createElement("p");
  intro.className = "meta";
  intro.textContent = `${Math.max(lines.length - 1, 0)} lignes de données`;
  const preview = document.createElement("pre");
  preview.textContent = lines.slice(0, 12).join("\n");
  output.append(intro, preview);
}

function readCache(response, payload) {
  if (payload && typeof payload.cached === "boolean") return payload.cached ? "oui" : "non";
  const header = response.headers.get("x-cache-hit");
  if (header === "true") return "oui";
  if (header === "false") return "non";
  return "—";
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function formatNumber(value) {
  if (typeof value !== "number") return String(value);
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 4 }).format(value);
}

function formatBytes(size) {
  if (size < 1024) return `${size} o`;
  return `${(size / 1024).toFixed(1)} Ko`;
}
