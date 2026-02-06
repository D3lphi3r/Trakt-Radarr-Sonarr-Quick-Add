const $ = (id) => document.getElementById(id);


// Show extension version
function setVersion() {
  try {
    const v = chrome.runtime.getManifest().version;
    const el = document.getElementById("ver");
    if (el) el.textContent = v || "—";
  } catch {}
}

const DEFAULTS = {
  trakt: { clientId: "", clientSecret: "", accessToken: "", refreshToken: "", tokenCreatedAt: null, tokenExpiresIn: null, username: "", autoAdd: false, listId: "" },
  radarr: { url: "http://localhost:7878", apiKey: "", rootFolderPath: "", qualityProfileId: null, searchOnAdd: true, monitored: true },
  sonarr: { url: "http://localhost:8989", apiKey: "", rootFolderPath: "", qualityProfileId: null, languageProfileId: null, seasonFolder: true, searchOnAdd: true, monitored: true }
,
  radarrCache: { roots: [], profiles: [], fetchedAt: null },
  sonarrCache: { roots: [], profiles: [], langs: [], fetchedAt: null },
  traktCache:  { lists: [], fetchedAt: null }
};

function cleanBaseUrl(url) {
  return (url || "").trim().replace(/\/+$/, "");
}

function xApiKeyHeaders(key) {
  const h = { "Content-Type": "application/json" };
  if (key) h["X-Api-Key"] = key;
  return h;
}

async function ensureHostPermission(baseUrl) {
  try {
    const u = new URL(cleanBaseUrl(baseUrl));
    if (!u.hostname || (u.protocol !== "http:" && u.protocol !== "https:")) {
      return { ok: false, error: "Invalid URL" };
    }
    const origin = `${u.protocol}//${u.hostname}/*`; // ports are not part of match patterns
    const has = await chrome.permissions.contains({ origins: [origin] });
    if (has) return { ok: true, origin };

    const granted = await chrome.permissions.request({ origins: [origin] });
    if (!granted) return { ok: false, error: "Permission denied" };
    return { ok: true, origin };
  } catch {
    return { ok: false, error: "Invalid URL" };
  }
}


async function fetchJson(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  if (!res.ok) throw new Error((json && (json.message || json.error)) ? (json.message || json.error) : (text || `${res.status} ${res.statusText}`));
  return json;
}

function setStatus(el, msg, ok = true) {
  el.textContent = msg;
  el.classList.remove("ok","bad");
  el.classList.add(ok ? "ok" : "bad");
}

function fillSelect(sel, items, valueKey, labelKey, selectedValue, firstLabel="— Select —") {
  sel.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = firstLabel;
  sel.appendChild(opt0);

  for (const it of items || []) {
    const o = document.createElement("option");
    o.value = String(it[valueKey]);
    o.textContent = String(it[labelKey]);
    if (selectedValue != null && String(selectedValue) === String(it[valueKey])) o.selected = true;
    sel.appendChild(o);
  }
}

async function load() {
  const sync = await chrome.storage.sync.get(DEFAULTS);

  // Caches must NOT live in chrome.storage.sync (quota is tiny). Use local instead.
  const local = await chrome.storage.local.get({
    radarrCache: { roots: [], profiles: [], fetchedAt: null },
    sonarrCache: { roots: [], profiles: [], langs: [], fetchedAt: null },
    traktCache:  { lists: [], fetchedAt: null }
  });

  // Backward-compat: if an older version stored caches in sync, migrate them to local once.
  const legacy = await chrome.storage.sync.get({ radarrCache: null, sonarrCache: null, traktCache: null });
  if (legacy.radarrCache?.roots?.length || legacy.radarrCache?.profiles?.length ||
      legacy.sonarrCache?.roots?.length || legacy.sonarrCache?.profiles?.length ||
      legacy.traktCache?.lists?.length) {
    try {
      await chrome.storage.local.set({
        radarrCache: legacy.radarrCache || local.radarrCache,
        sonarrCache: legacy.sonarrCache || local.sonarrCache,
        traktCache:  legacy.traktCache  || local.traktCache
      });
      await chrome.storage.sync.remove(["radarrCache","sonarrCache","traktCache"]);
    } catch {}
  }

  // Use local caches (or migrated values)
  const caches = await chrome.storage.local.get({
    radarrCache: { roots: [], profiles: [], fetchedAt: null },
    sonarrCache: { roots: [], profiles: [], langs: [], fetchedAt: null },
    traktCache:  { lists: [], fetchedAt: null }
  });

  // Trakt
  $("traktClientId").value = sync.trakt?.clientId || "";
  $("traktClientSecret").value = sync.trakt?.clientSecret || "";
  $("traktAutoAdd").value = String(!!sync.trakt?.autoAdd);

  const cachedLists = Array.isArray(caches.traktCache?.lists) ? caches.traktCache.lists : [];
  fillSelect($("traktList"), cachedLists, "id", "name", sync.trakt?.listId || "", cachedLists.length ? "— Select list —" : "— Run Check Auth once —");

  // Radarr
  $("radarrUrl").value = sync.radarr?.url || DEFAULTS.radarr.url;
  $("radarrKey").value = sync.radarr?.apiKey || "";
  $("radarrSearch").value = String(!!sync.radarr?.searchOnAdd);

  const rRoots = Array.isArray(caches.radarrCache?.roots) ? caches.radarrCache.roots : [];
  const rProfiles = Array.isArray(caches.radarrCache?.profiles) ? caches.radarrCache.profiles : [];
  fillSelect($("radarrRoot"), rRoots, "path", "path", sync.radarr?.rootFolderPath || "", rRoots.length ? "— Select —" : "— Run Test once —");
  fillSelect($("radarrProfile"), rProfiles, "id", "name", sync.radarr?.qualityProfileId, rProfiles.length ? "— Select —" : "— Run Test once —");

  // Sonarr
  $("sonarrUrl").value = sync.sonarr?.url || DEFAULTS.sonarr.url;
  $("sonarrKey").value = sync.sonarr?.apiKey || "";
  $("sonarrSeasonFolder").value = String(!!sync.sonarr?.seasonFolder);
  $("sonarrSearch").value = String(!!sync.sonarr?.searchOnAdd);

  const sRoots = Array.isArray(caches.sonarrCache?.roots) ? caches.sonarrCache.roots : [];
  const sProfiles = Array.isArray(caches.sonarrCache?.profiles) ? caches.sonarrCache.profiles : [];
  const sLangs = Array.isArray(caches.sonarrCache?.langs) ? caches.sonarrCache.langs : [];

  fillSelect($("sonarrRoot"), sRoots, "path", "path", sync.sonarr?.rootFolderPath || "", sRoots.length ? "— Select —" : "— Run Test once —");
  fillSelect($("sonarrProfile"), sProfiles, "id", "name", sync.sonarr?.qualityProfileId, sProfiles.length ? "— Select —" : "— Run Test once —");
  fillSelect($("sonarrLang"), sLangs, "id", "name", sync.sonarr?.languageProfileId, sLangs.length ? "— (optional) —" : "— (optional) —");

  $("saveStatus").textContent = "";

  // Status pills (cached hints)
  if (sync.trakt?.accessToken && sync.trakt?.username) {
    const c = cachedLists.length ? ` • Lists: ${cachedLists.length}` : "";
    setStatus($("traktAuthStatus"), `Authed: ${sync.trakt.username}${c}`, true);
  }
  if (rRoots.length || rProfiles.length) setStatus($("radarrStatus"), "Cached", true);
  if (sRoots.length || sProfiles.length) setStatus($("sonarrStatus"), "Cached", true);
}

async function save() {
  const cur = await chrome.storage.sync.get(DEFAULTS);

  const trakt = {
    ...DEFAULTS.trakt,
    ...(cur.trakt || {}),
    clientId: $("traktClientId").value.trim(),
    clientSecret: $("traktClientSecret").value.trim(),
    autoAdd: $("traktAutoAdd").value === "true",
    listId: $("traktList").value || ""
  };

  const radarr = {
    url: cleanBaseUrl($("radarrUrl").value),
    apiKey: $("radarrKey").value.trim(),
    rootFolderPath: $("radarrRoot").value,
    qualityProfileId: $("radarrProfile").value ? Number($("radarrProfile").value) : null,
    searchOnAdd: $("radarrSearch").value === "true",
    monitored: true
  };

  const sonarr = {
    url: cleanBaseUrl($("sonarrUrl").value),
    apiKey: $("sonarrKey").value.trim(),
    rootFolderPath: $("sonarrRoot").value,
    qualityProfileId: $("sonarrProfile").value ? Number($("sonarrProfile").value) : null,
    languageProfileId: $("sonarrLang").value ? Number($("sonarrLang").value) : null,
    seasonFolder: $("sonarrSeasonFolder").value === "true",
    searchOnAdd: $("sonarrSearch").value === "true",
    monitored: true
  };

  await chrome.storage.sync.set({ trakt, radarr, sonarr });
  $("saveStatus").textContent = "Saved ✅";
  setTimeout(() => ($("saveStatus").textContent = ""), 2500);
}

async function testRadarr() {
  const url = cleanBaseUrl($("radarrUrl").value);
  const key = $("radarrKey").value.trim();
  const status = $("radarrStatus");
  try {
    await fetchJson(`${url}/api/v3/system/status`, { headers: xApiKeyHeaders(key) });
    setStatus(status, "OK", true);
    await fetchRadarr();
  } catch (e) {
    setStatus(status, "FAIL: " + (e?.message || "error"), false);
  }
}

async function fetchRadarr() {
  const url = cleanBaseUrl($("radarrUrl").value);
  const key = $("radarrKey").value.trim();
  const status = $("radarrStatus");
  try {
    setStatus(status, "Loading…", true);
    const [roots, profiles] = await Promise.all([
      fetchJson(`${url}/api/v3/rootfolder`, { headers: xApiKeyHeaders(key) }),
      fetchJson(`${url}/api/v3/qualityprofile`, { headers: xApiKeyHeaders(key) })
    ]);

    // Cache for next time you open Settings
    await chrome.storage.local.set({ radarrCache: { roots, profiles, fetchedAt: Date.now() } });

    const cur = await chrome.storage.sync.get(DEFAULTS);
    fillSelect($("radarrRoot"), roots, "path", "path", cur.radarr?.rootFolderPath || "");
    fillSelect($("radarrProfile"), profiles, "id", "name", cur.radarr?.qualityProfileId);

    setStatus(status, "OK", true);
  } catch (e) {
    console.error("[radarr] fetch failed:", e);
    setStatus(status, "FAIL: " + (e?.message || "error"), false);
  }
}

async function testSonarr() {
  const url = cleanBaseUrl($("sonarrUrl").value);
  const key = $("sonarrKey").value.trim();
  const status = $("sonarrStatus");
  try {
    await fetchJson(`${url}/api/v3/system/status`, { headers: xApiKeyHeaders(key) });
    setStatus(status, "OK", true);
    await fetchSonarr();
  } catch (e) {
    setStatus(status, "FAIL: " + (e?.message || "error"), false);
  }
}

async function fetchSonarr() {
  const url = cleanBaseUrl($("sonarrUrl").value);
  const key = $("sonarrKey").value.trim();
  const status = $("sonarrStatus");
  try {
    setStatus(status, "Loading…", true);
    const rootsP = fetchJson(`${url}/api/v3/rootfolder`, { headers: xApiKeyHeaders(key) });
    const profilesP = fetchJson(`${url}/api/v3/qualityprofile`, { headers: xApiKeyHeaders(key) });
    const langP = fetch(`${url}/api/v3/languageprofile`, { headers: xApiKeyHeaders(key) })
      .then(r => r.ok ? r.json() : [])
      .catch(() => []);

    const [roots, profiles, langs] = await Promise.all([rootsP, profilesP, langP]);

    // Cache for next time you open Settings
    await chrome.storage.local.set({ sonarrCache: { roots, profiles, langs: (Array.isArray(langs) ? langs : []), fetchedAt: Date.now() } });

    const cur = await chrome.storage.sync.get(DEFAULTS);
    fillSelect($("sonarrRoot"), roots, "path", "path", cur.sonarr?.rootFolderPath || "");
    fillSelect($("sonarrProfile"), profiles, "id", "name", cur.sonarr?.qualityProfileId);

    if (langs && Array.isArray(langs) && langs.length) {
      fillSelect($("sonarrLang"), langs, "id", "name", cur.sonarr?.languageProfileId);
    } else {
      fillSelect($("sonarrLang"), [], "id", "name", null, "— (optional) —");
    }

    setStatus(status, "OK", true);
  } catch (e) {
    console.error("[sonarr] fetch failed:", e);
    setStatus(status, "FAIL: " + (e?.message || "error"), false);
  }
}


// Trakt auth UI helpers (simplified):
// - "Check Auth" will exchange code (if provided) and then verify auth status.
// - If code is empty, it just checks current auth status.
function openTraktAuth() {
  const clientId = $("traktClientId").value.trim();
  if (!clientId) {
    alert("Set Trakt Client ID first, then Save.");
    return;
  }
  const url = `https://trakt.tv/oauth/authorize?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent("urn:ietf:wg:oauth:2.0:oob")}`;
  window.open(url, "_blank");
}

async function checkTraktAuth() {
  const status = $("traktAuthStatus");
  const code = $("traktAuthCode").value.trim();

  try {
    // If user pasted a code, exchange it first.
    if (code) {
      // Save current inputs (clientId/secret + other settings)
      await save();

      const ex = await chrome.runtime.sendMessage({ action: "traktExchangeCode", payload: { code } });
      if (!ex?.ok) {
        setStatus(status, "Auth failed", false);
        alert(ex?.error || "Auth failed.");
        return;
      }
      $("traktAuthCode").value = "";
    }

    // Then always check current status
    const resp = await chrome.runtime.sendMessage({ action: "traktAuthStatus" });
    if (resp?.ok && resp.authed) {
      const user = resp.username || "—";
      setStatus(status, `Authed: ${user}`, true);

      // Auto-fetch lists (silent: don't pop alerts unless user explicitly triggers something else)
      const lf = await fetchTraktLists({ silent: true });
      if (lf?.ok) {
        setStatus(status, `Authed: ${user} • Lists: ${lf.count}`, true);
      } else {
        // Keep auth OK, but hint lists issue
        setStatus(status, `Authed: ${user} • Lists: failed`, true);
        console.warn("[trakt] list fetch failed:", lf?.error);
      }
    } else {
      setStatus(status, "Not authed", false);
    }
  } catch (e) {
    setStatus(status, "Auth error", false);
  }
}

async function fetchTraktLists({ silent = false } = {}) {
  const resp = await chrome.runtime.sendMessage({ action: "traktFetchLists" });
  if (!resp?.ok) {
    if (!silent) alert(resp?.error || "Failed to fetch lists.");
    return { ok: false, error: resp?.error || "Failed to fetch lists." };
  }

  const cur = await chrome.storage.sync.get(DEFAULTS);
  const currentId = cur.trakt?.listId || "";

  const items = (resp.lists || []).map(l => {
    const ids = l.ids || {};
    const id = ids.slug || (ids.trakt != null ? String(ids.trakt) : "");
    const name = l.name + (l.privacy ? ` (${l.privacy})` : "");
    return { id, name };
  }).filter(x => x.id);

  fillSelect($("traktList"), items, "id", "name", currentId, items.length ? "— Select list —" : "— No lists —");

  // Cache for next time you open Settings
  await chrome.storage.local.set({ traktCache: { lists: items, fetchedAt: Date.now() } });

  return { ok: true, count: items.length };
}


document.addEventListener("DOMContentLoaded", async () => {
  setVersion();
  await load();
$("save").addEventListener("click", save);

  $("radarrTest").addEventListener("click", testRadarr);
  $("sonarrTest").addEventListener("click", testSonarr);
  $("traktOpenAuth").addEventListener("click", openTraktAuth);
  $("traktCheckAuth").addEventListener("click", checkTraktAuth);
  });
