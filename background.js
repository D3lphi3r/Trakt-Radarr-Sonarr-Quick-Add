const PERMISSION_HINT = "Tip: open the extension Settings and press Test for Radarr/Sonarr to grant host access."; 

const DEFAULTS = {
  trakt: {
    clientId: "",
    clientSecret: "",
    accessToken: "",
    refreshToken: "",
    tokenCreatedAt: null,
    tokenExpiresIn: null,
    username: "",
    autoAdd: false,
    listId: "" // Trakt list "ids.slug" or numeric "ids.trakt"; we'll store slug if available, else trakt id as string
  },
  radarr: {
    url: "http://localhost:7878",
    apiKey: "",
    rootFolderPath: "",
    qualityProfileId: null,
    monitored: true,
    searchOnAdd: true
  },
  sonarr: {
    url: "http://localhost:8989",
    apiKey: "",
    rootFolderPath: "",
    qualityProfileId: null,
    languageProfileId: null,
    seasonFolder: true,
    monitored: true,
    searchOnAdd: true
  }
};

function cleanBaseUrl(url) {
  if (!url) return "";
  return url.replace(/\/+$/, "");
}

async function getSettings() {
  const data = await chrome.storage.sync.get(DEFAULTS);
  return {
    trakt: { ...DEFAULTS.trakt, ...(data.trakt || {}) },
    radarr: { ...DEFAULTS.radarr, ...(data.radarr || {}) },
    sonarr: { ...DEFAULTS.sonarr, ...(data.sonarr || {}) }
  };
}

async function setTraktPatch(patch) {
  const cur = await chrome.storage.sync.get(DEFAULTS);
  const next = { ...DEFAULTS.trakt, ...(cur.trakt || {}), ...(patch || {}) };
  await chrome.storage.sync.set({ trakt: next });
  return next;
}

function xApiKeyHeaders(apiKey) {
  const h = { "Content-Type": "application/json" };
  if (apiKey) h["X-Api-Key"] = apiKey;
  return h;
}

async function fetchJson(url, opts = {}) {
  let res;
  try {
    res = await fetch(url, opts);
  } catch (e) {
    // Network error OR missing host permission
    const err = new Error((e && e.message ? e.message : "Request failed") + ". " + PERMISSION_HINT);
    err.cause = e;
    throw err;
  }
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}

  function extractHumanMessage(j, t) {
    // Radarr/Sonarr validation responses can be arrays like:
    // [{ propertyName, errorMessage, ... }]
    const pullErrorMessages = (arr) => {
      const msgs = (arr || [])
        .map(x => x && (x.errorMessage || x.message))
        .filter(Boolean);
      // de-dupe while keeping order
      const seen = new Set();
      const out = [];
      for (const m of msgs) { if (!seen.has(m)) { seen.add(m); out.push(m); } }
      return out;
    };

    if (Array.isArray(j)) {
      const msgs = pullErrorMessages(j);
      if (msgs.length) return msgs.join(" / ");
    }
    if (j && typeof j === "object") {
      if (Array.isArray(j.errors)) {
        const msgs = pullErrorMessages(j.errors);
        if (msgs.length) return msgs.join(" / ");
      }
      if (typeof j.message === "string" && j.message.trim()) {
        // If message is generic and we have errors, prefer errors
        if (j.message.toLowerCase().includes("validation") && Array.isArray(j.errors)) {
          const msgs = pullErrorMessages(j.errors);
          if (msgs.length) return msgs.join(" / ");
        }
        return j.message;
      }
      if (typeof j.error === "string" && j.error.trim()) return j.error;
    }
    if (typeof t === "string" && t.trim()) return t;
    return `${res.status} ${res.statusText}`;
  }

  if (!res.ok) {
    const msg = extractHumanMessage(json, text);
    const err = new Error(msg);
    err.status = res.status;
    err.body = json || text;
    throw err;
  }
  return json;
}

function pickBestByYear(items, year) {
  if (!Array.isArray(items) || items.length === 0) return null;
  if (!year) return items[0];
  const exact = items.find(x => Number(x.year) === Number(year));
  if (exact) return exact;
  let best = items[0];
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const it of items) {
    const y = Number(it.year);
    if (!Number.isFinite(y)) continue;
    const d = Math.abs(y - year);
    if (d < bestDiff) { best = it; bestDiff = d; }
  }
  return best;
}

async function traktResolveIds({ type, slug }) {
  const s = await getSettings();
  const clientId = (s.trakt.clientId || "").trim();
  if (!clientId) return { ok: false, error: "Trakt Client ID is not set (Settings)." };

  const endpoint = type === "movie"
    ? `https://api.trakt.tv/movies/${encodeURIComponent(slug)}?extended=full`
    : `https://api.trakt.tv/shows/${encodeURIComponent(slug)}?extended=full`;

  const res = await fetchJson(endpoint, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "trakt-api-version": "2",
      "trakt-api-key": clientId
    }
  });

  const ids = res?.ids || {};
  return {
    ok: true,
    ids: {
      imdb: ids.imdb || null,
      tmdb: ids.tmdb || null,
      tvdb: ids.tvdb || null
    },
    title: res?.title || null,
    year: res?.year || null
  };
}

// Trakt OAuth: user supplies Client ID + Client Secret (from their Trakt API app), then we can exchange an authorization code.
async function traktExchangeCode({ code }) {
  const s = await getSettings();
  const clientId = (s.trakt.clientId || "").trim();
  const clientSecret = (s.trakt.clientSecret || "").trim();
  if (!clientId || !clientSecret) {
    return { ok: false, error: "Set Trakt Client ID and Client Secret in Settings first." };
  }
  if (!code) return { ok: false, error: "Missing authorization code." };

  const body = {
    code: String(code).trim(),
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: "urn:ietf:wg:oauth:2.0:oob",
    grant_type: "authorization_code"
  };

  const tok = await fetchJson("https://api.trakt.tv/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  await setTraktPatch({
    accessToken: tok.access_token || "",
    refreshToken: tok.refresh_token || "",
    tokenCreatedAt: tok.created_at || null,
    tokenExpiresIn: tok.expires_in || null
  });

  // Fetch /users/me to get username (requires OAuth)
  const me = await fetchJson("https://api.trakt.tv/users/me", {
    headers: {
      "Content-Type": "application/json",
      "trakt-api-version": "2",
      "trakt-api-key": clientId,
      "Authorization": `Bearer ${tok.access_token}`
    }
  });

  await setTraktPatch({ username: me?.ids?.slug || me?.username || "" });

  return { ok: true, username: me?.ids?.slug || me?.username || "" };
}

async function traktAuthStatus() {
  const s = await getSettings();
  const t = s.trakt;
  return {
    ok: true,
    authed: !!(t.accessToken && t.username),
    username: t.username || ""
  };
}

async function traktFetchLists() {
  const s = await getSettings();
  const t = s.trakt;
  const clientId = (t.clientId || "").trim();
  if (!clientId) return { ok: false, error: "Trakt Client ID not set." };
  if (!t.accessToken || !t.username) return { ok: false, error: "Trakt is not authenticated yet." };

  const lists = await fetchJson(`https://api.trakt.tv/users/${encodeURIComponent(t.username)}/lists`, {
    headers: {
      "Content-Type": "application/json",
      "trakt-api-version": "2",
      "trakt-api-key": clientId,
      "Authorization": `Bearer ${t.accessToken}`
    }
  });

  const mapped = (lists || []).map(l => ({
    name: l?.name || "",
    description: l?.description || "",
    privacy: l?.privacy || "",
    ids: l?.ids || {}
  }));

  return { ok: true, lists: mapped };
}

async function traktAddToList({ type, ids }) {
  const s = await getSettings();
  const t = s.trakt;
  if (!t.autoAdd) return { ok: true, skipped: true };
  const clientId = (t.clientId || "").trim();
  if (!clientId) return { ok: true, skipped: true };
  if (!t.accessToken || !t.username) return { ok: false, error: "Trakt auto-add enabled but not authenticated." };
  if (!t.listId) return { ok: false, error: "Trakt auto-add enabled but no list selected." };

  // Prefer list slug; Trakt endpoint accepts list_id which can be "slug" or numeric "trakt id".
  const listId = t.listId;

  const payload = {};
  if (type === "movie") {
    // Trakt list items require ids object. We'll send tmdb or imdb when present.
    const itemIds = {};
    if (ids?.tmdb) itemIds.tmdb = Number(ids.tmdb);
    if (ids?.imdb) itemIds.imdb = String(ids.imdb);
    if (Object.keys(itemIds).length === 0) return { ok: false, error: "No suitable IDs to add movie to Trakt list." };
    payload.movies = [{ ids: itemIds }];
  } else {
    const itemIds = {};
    if (ids?.tvdb) itemIds.tvdb = Number(ids.tvdb);
    if (ids?.tmdb) itemIds.tmdb = Number(ids.tmdb);
    if (ids?.imdb) itemIds.imdb = String(ids.imdb);
    if (Object.keys(itemIds).length === 0) return { ok: false, error: "No suitable IDs to add show to Trakt list." };
    payload.shows = [{ ids: itemIds }];
  }

  const res = await fetchJson(`https://api.trakt.tv/users/${encodeURIComponent(t.username)}/lists/${encodeURIComponent(listId)}/items`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "trakt-api-version": "2",
      "trakt-api-key": clientId,
      "Authorization": `Bearer ${t.accessToken}`
    },
    body: JSON.stringify(payload)
  });

  return { ok: true, result: res || null };
}

async function addMovie(payload) {
  const s = await getSettings();
  const r = s.radarr;
  const base = cleanBaseUrl(r.url);
  if (!base || !r.apiKey) return { ok: false, error: "Radarr URL/API key not set. Open Settings." };
  if (!r.rootFolderPath || !r.qualityProfileId) return { ok: false, error: "Radarr root folder / quality profile not set. Open Settings and click Fetch." };

  const tmdb = payload?.ids?.tmdb;
  const imdb = payload?.ids?.imdb;
  const termTitle = [payload?.title, payload?.year].filter(Boolean).join(" ").trim();

  let lookupUrl = "";
  if (tmdb) lookupUrl = `${base}/api/v3/movie/lookup/tmdb?tmdbid=${encodeURIComponent(tmdb)}`;
  else if (imdb) lookupUrl = `${base}/api/v3/movie/lookup/imdb?imdbid=${encodeURIComponent(imdb)}`;
  else lookupUrl = `${base}/api/v3/movie/lookup?term=${encodeURIComponent(termTitle || payload.slug)}`;

  const items = await fetchJson(lookupUrl, { headers: xApiKeyHeaders(r.apiKey) });

  let movie = null;
  if (Array.isArray(items)) movie = pickBestByYear(items, payload?.year);
  else if (items && typeof items === "object") movie = items;

  if (!movie) return { ok: false, error: "Radarr lookup returned no matches." };

  const body = {
    ...movie,
    qualityProfileId: Number(r.qualityProfileId),
    rootFolderPath: r.rootFolderPath,
    monitored: !!r.monitored,
    addOptions: { searchForMovie: !!r.searchOnAdd }
  };

  await fetchJson(`${base}/api/v3/movie`, {
    method: "POST",
    headers: xApiKeyHeaders(r.apiKey),
    body: JSON.stringify(body)
  });

  // Auto add to Trakt list (best-effort)
  const traktRes = await traktAddToList({ type: "movie", ids: payload?.ids || {} });
  if (traktRes.ok) return { ok: true, message: traktRes.skipped ? "Movie sent to Radarr." : "Movie sent to Radarr + added to Trakt list." };
  return { ok: true, message: `Movie sent to Radarr. (Trakt list: ${traktRes.error || "failed"})` };
}

async function addShow(payload) {
  const s = await getSettings();
  const so = s.sonarr;
  const base = cleanBaseUrl(so.url);
  if (!base || !so.apiKey) return { ok: false, error: "Sonarr URL/API key not set. Open Settings." };
  if (!so.rootFolderPath || !so.qualityProfileId) return { ok: false, error: "Sonarr root folder / quality profile not set. Open Settings and click Fetch." };

  const tvdb = payload?.ids?.tvdb;
  const tmdb = payload?.ids?.tmdb;

  let term = "";
  if (tvdb) term = `tvdb:${tvdb}`;
  else if (tmdb) term = `tmdb:${tmdb}`;
  else term = [payload?.title, payload?.year].filter(Boolean).join(" ").trim() || payload?.slug;

  const items = await fetchJson(`${base}/api/v3/series/lookup?term=${encodeURIComponent(term)}`, {
    headers: xApiKeyHeaders(so.apiKey)
  });

  const series = pickBestByYear(items, payload?.year);
  if (!series) return { ok: false, error: "Sonarr lookup returned no matches." };

  const body = {
    ...series,
    qualityProfileId: Number(so.qualityProfileId),
    rootFolderPath: so.rootFolderPath,
    monitored: !!so.monitored,
    seasonFolder: !!so.seasonFolder,
    addOptions: { searchForMissingEpisodes: !!so.searchOnAdd }
  };

  if (so.languageProfileId != null) body.languageProfileId = Number(so.languageProfileId);

  await fetchJson(`${base}/api/v3/series`, {
    method: "POST",
    headers: xApiKeyHeaders(so.apiKey),
    body: JSON.stringify(body)
  });

  const traktRes = await traktAddToList({ type: "show", ids: payload?.ids || {} });
  if (traktRes.ok) return { ok: true, message: traktRes.skipped ? "Show sent to Sonarr." : "Show sent to Sonarr + added to Trakt list." };
  return { ok: true, message: `Show sent to Sonarr. (Trakt list: ${traktRes.error || "failed"})` };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.action === "openOptions") {
        await chrome.runtime.openOptionsPage();
        sendResponse({ ok: true });
        return;
      }
      if (msg?.action === "traktResolveIds") {
        sendResponse(await traktResolveIds(msg.payload));
        return;
      }
      if (msg?.action === "traktExchangeCode") {
        sendResponse(await traktExchangeCode(msg.payload));
        return;
      }
      if (msg?.action === "traktAuthStatus") {
        sendResponse(await traktAuthStatus());
        return;
      }
      if (msg?.action === "traktFetchLists") {
        sendResponse(await traktFetchLists());
        return;
      }
      if (msg?.action === "addMovie") {
        sendResponse(await addMovie(msg.payload));
        return;
      }
      if (msg?.action === "addShow") {
        sendResponse(await addShow(msg.payload));
        return;
      }
      sendResponse({ ok: false, error: "Unknown action." });
    } catch (e) {
      sendResponse({ ok: false, error: e?.message || String(e) });
    }
  })();
  return true;
});
