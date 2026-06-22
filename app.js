const form = document.querySelector("#searchForm");
const queryInput = document.querySelector("#queryInput");
const tokenInput = document.querySelector("#tokenInput");
const actorInput = document.querySelector("#actorInput");
const limitInput = document.querySelector("#limitInput");
const connectionState = document.querySelector("#connectionState");
const statusValue = document.querySelector("#statusValue");
const countValue = document.querySelector("#countValue");
const elapsedValue = document.querySelector("#elapsedValue");
const updatedValue = document.querySelector("#updatedValue");
const sourceValue = document.querySelector("#sourceValue");
const activityList = document.querySelector("#activityList");
const resultsList = document.querySelector("#resultsList");
const emptyState = document.querySelector("#emptyState");
const clearButton = document.querySelector("#clearButton");
const resultTemplate = document.querySelector("#resultTemplate");

let timerId = null;
let startedAt = 0;

const savedToken = localStorage.getItem("apifyToken");
if (savedToken) tokenInput.value = savedToken;

function setState(label, kind = "ready") {
  connectionState.textContent = label;
  connectionState.className = `live-pill ${kind === "ready" ? "" : kind}`.trim();
  statusValue.textContent = label;
}

function addActivity(text) {
  const item = document.createElement("li");
  const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  item.textContent = `${time}  ${text}`;
  activityList.prepend(item);
}

function startTimer() {
  startedAt = performance.now();
  elapsedValue.textContent = "0.0s";
  clearInterval(timerId);
  timerId = setInterval(() => {
    elapsedValue.textContent = `${((performance.now() - startedAt) / 1000).toFixed(1)}s`;
  }, 100);
}

function stopTimer() {
  clearInterval(timerId);
  timerId = null;
  if (startedAt) elapsedValue.textContent = `${((performance.now() - startedAt) / 1000).toFixed(1)}s`;
}

function normalizeResult(item) {
  return {
    title: item.title || item.name || item.heading || item.organicTitle || item.url || "Untitled result",
    url: item.url || item.link || item.displayedUrl || item.sourceUrl || "",
    text: item.description || item.snippet || item.text || item.content || item.preview || "No preview text was returned for this result.",
  };
}

function renderResults(items) {
  resultsList.innerHTML = "";
  emptyState.hidden = items.length > 0;
  countValue.textContent = String(items.length);

  items.map(normalizeResult).forEach((result) => {
    const node = resultTemplate.content.cloneNode(true);
    const title = node.querySelector(".result-title");
    const url = node.querySelector(".result-url");
    const copy = node.querySelector(".result-copy");

    title.textContent = result.title;
    title.href = result.url || "#";
    url.textContent = result.url || "No URL returned";
    copy.textContent = result.text;
    resultsList.appendChild(node);
  });
}

function buildActorInput(query, limit) {
  return {
    queries: query,
    resultsPerPage: limit,
    maxPagesPerQuery: 1,
    languageCode: "en",
    mobileResults: false,
  };
}

async function apifyFetch(url, token, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error?.message || `Apify returned ${response.status}`);
  }

  return response.json();
}

async function runSearch(event) {
  event.preventDefault();

  const query = queryInput.value.trim();
  const token = tokenInput.value.trim();
  const actor = actorInput.value.trim().replace("/", "~");
  const limit = Math.min(25, Math.max(1, Number(limitInput.value) || 10));

  if (!token) {
    setState("Token needed", "error");
    addActivity("Add an Apify API token before running a live search.");
    tokenInput.focus();
    return;
  }

  localStorage.setItem("apifyToken", token);
  form.querySelector("button").disabled = true;
  setState("Starting", "busy");
  startTimer();
  addActivity(`Starting ${actor} for "${query}".`);
  renderResults([]);
  sourceValue.textContent = "Waiting for run";

  try {
    const encodedActor = encodeURIComponent(actor);
    const run = await apifyFetch(`https://api.apify.com/v2/actors/${encodedActor}/runs`, token, {
      method: "POST",
      body: JSON.stringify(buildActorInput(query, limit)),
    });

    const runData = run.data;
    addActivity(`Run ${runData.id} created. Polling status.`);
    sourceValue.textContent = `Run ${runData.id}`;

    let status = runData.status;
    let finalRun = runData;
    while (!["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(status)) {
      await new Promise((resolve) => setTimeout(resolve, 1800));
      const current = await apifyFetch(`https://api.apify.com/v2/actor-runs/${runData.id}`, token);
      finalRun = current.data;
      status = finalRun.status;
      setState(status.toLowerCase(), "busy");
    }

    if (status !== "SUCCEEDED") {
      throw new Error(`Run ended with status ${status}.`);
    }

    setState("Fetching", "busy");
    addActivity("Run succeeded. Loading dataset items.");
    const datasetId = finalRun.defaultDatasetId;
    const items = await apifyFetch(`https://api.apify.com/v2/datasets/${datasetId}/items?clean=true&limit=${limit}`, token, {
      headers: { "Content-Type": "application/json" },
    });

    renderResults(Array.isArray(items) ? items : []);
    updatedValue.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    sourceValue.textContent = `Dataset ${datasetId}`;
    setState("Live", "ready");
    addActivity(`Loaded ${Array.isArray(items) ? items.length : 0} result items.`);
  } catch (error) {
    setState("Error", "error");
    addActivity(error.message);
  } finally {
    form.querySelector("button").disabled = false;
    stopTimer();
  }
}

form.addEventListener("submit", runSearch);
clearButton.addEventListener("click", () => {
  activityList.innerHTML = "";
  addActivity("Activity cleared.");
});

addActivity("Ready for a live Apify search.");
