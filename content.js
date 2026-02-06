(() => {
  const ROOT_ID = "trakt-arr-quickadd-root";
  const STYLE_ID = "trakt-arr-quickadd-style";
  const POS_KEY = "trakt-arr-quickadd.widgetPos.v1";

  const RESERVED = {
    movie: new Set([
      "trending","popular","anticipated","boxoffice","recommended","played","watched","collected",
      "updates","new","premieres","calendar","calendars","genres","lists","collections","people","comments"
    ]),
    show: new Set([
      "trending","popular","anticipated","recommended","played","watched","collected",
      "updates","new","premieres","calendar","calendars","genres","lists","collections","people","comments"
    ])
  };

  function removeUI() {
    const old = document.getElementById(ROOT_ID);
    if (old) old.remove();
  }

  function storageGet(key) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([key], (res) => resolve(res?.[key]));
      } catch {
        resolve(undefined);
      }
    });
  }

  function storageSet(obj) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set(obj, () => resolve());
      } catch {
        resolve();
      }
    });
  }

  function getTypeAndSlug() {
    const parts = location.pathname.split("/").filter(Boolean);
    const idxMovies = parts.indexOf("movies");
    const idxShows = parts.indexOf("shows");

    if (idxMovies >= 0 && idxMovies + 1 < parts.length) {
      return { type: "movie", slug: parts[idxMovies + 1] };
    }
    if (idxShows >= 0 && idxShows + 1 < parts.length) {
      return { type: "show", slug: parts[idxShows + 1] };
    }
    return null;
  }

  function looksLikeItemPage(ts) {
    if (!ts || !ts.slug) return false;

    // Strong signal: og:type on Trakt item pages is usually "video.movie" or "video.tv_show"
    const ogType = document.querySelector('meta[property="og:type"]')?.getAttribute("content") || "";
    if (/^video\.(movie|tv_show)$/i.test(ogType)) return true;

    // Avoid obvious listing routes like /movies/trending
    if (RESERVED?.[ts.type]?.has(ts.slug)) return false;

    // Heuristic: item pages usually expose external ID links (IMDb/TMDb/TVDb)
    const hasExternal = !!document.querySelector(
      'a[href*="imdb.com/title/tt"], a[href*="themoviedb.org/movie/"], a[href*="themoviedb.org/tv/"], a[href*="thetvdb.com/"]'
    );
    if (hasExternal) return true;

    // Fallback: for movies and shows, slugs often contain a hyphen and/or year.
    return /-/.test(ts.slug);
  }

  function guessTitleAndYear(slug) {
    const s = (slug || "").replace(/-/g, " ").trim();
    const m = s.match(/(.*)\s(19\d{2}|20\d{2})$/);
    if (m) return { title: m[1].trim(), year: Number(m[2]) };
    return { title: s, year: null };
  }

  function scanIdsFromLinks() {
    const ids = { imdb: null, tmdb: null, tvdb: null };
    const links = Array.from(document.querySelectorAll("a[href]"))
      .map(a => a.getAttribute("href"))
      .filter(Boolean);

    for (const href of links) {
      const imdb = href.match(/imdb\.com\/title\/(tt\d+)/i);
      if (imdb?.[1]) ids.imdb = ids.imdb || imdb[1];

      const tmdbMovie = href.match(/themoviedb\.org\/movie\/(\d+)/i);
      const tmdbTv = href.match(/themoviedb\.org\/tv\/(\d+)/i);
      if (tmdbMovie?.[1]) ids.tmdb = ids.tmdb || Number(tmdbMovie[1]);
      if (tmdbTv?.[1]) ids.tmdb = ids.tmdb || Number(tmdbTv[1]);

      const tvdb1 = href.match(/thetvdb\.com\/\?tab=series&id=(\d+)/i);
      const tvdb2 = href.match(/thetvdb\.com\/series\/(\d+)/i);
      const tvdb3 = href.match(/thetvdb\.com\/d\/\d+\/series\/(\d+)/i);
      if (tvdb1?.[1]) ids.tvdb = ids.tvdb || Number(tvdb1[1]);
      if (tvdb2?.[1]) ids.tvdb = ids.tvdb || Number(tvdb2[1]);
      if (tvdb3?.[1]) ids.tvdb = ids.tvdb || Number(tvdb3[1]);
    }
    return ids;
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const st = document.createElement("style");
    st.id = STYLE_ID;
    st.textContent = `
      #${ROOT_ID}{
        position:fixed;
        right:14px;
        bottom:14px;
        z-index:2147483647;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, "Noto Sans", Arial, sans-serif;
        font-size: 13px;
        touch-action:none;
      }
      #${ROOT_ID} .panel{
        display:flex;
        flex-direction:column;
        gap:8px;
        background: rgba(20,20,20,.92);
        color: #fff;
        border: 1px solid rgba(255,255,255,.12);
        border-radius: 12px;
        padding: 10px;
        box-shadow: 0 10px 30px rgba(0,0,0,.35);
        min-width: 220px;
        max-width: 340px;
      }
      #${ROOT_ID} .title{
        font-weight: 700;
        font-size: 12px;
        opacity:.9;
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:10px;
        cursor: move;
        user-select:none;
      }
      #${ROOT_ID}.dragging .panel{
        outline: 2px solid rgba(255,255,255,.18);
        box-shadow: 0 18px 40px rgba(0,0,0,.55);
      }
      #${ROOT_ID} .title .mini{
        font-weight:600;
        opacity:.85;
        cursor:pointer;
        border: 1px solid rgba(255,255,255,.18);
        padding: 2px 8px;
        border-radius: 999px;
        user-select:none;
      }
      #${ROOT_ID} .row{
        display:flex;
        gap:8px;
      }
      #${ROOT_ID} button{
        flex:1;
        border: 1px solid rgba(255,255,255,.18);
        background: rgba(255,255,255,.10);
        color: #fff;
        padding: 8px 10px;
        border-radius: 10px;
        cursor: pointer;
        font-weight: 650;
      }
      #${ROOT_ID} button:hover{ background: rgba(255,255,255,.16); }
      #${ROOT_ID} button:disabled{ opacity:.55; cursor:not-allowed; }
      #${ROOT_ID} .muted{
        opacity:.8;
        line-height:1.25;
      }
      #${ROOT_ID} .toast{
        margin-top:8px;
        padding:8px 10px;
        border-radius:10px;
        background: rgba(0,0,0,.35);
        border: 1px solid rgba(255,255,255,.12);
        display:none;
      }
      #${ROOT_ID} .toast.show{ display:block; }
      #${ROOT_ID} .toast.ok{ border-color: rgba(60,200,120,.45); }
      #${ROOT_ID} .toast.bad{ border-color: rgba(240,80,80,.55); }
      #${ROOT_ID} .meta-line{
        font-size: 12px;
        opacity:.8;
        display:flex;
        gap:8px;
        flex-wrap:wrap;
      }
      #${ROOT_ID} .tag{
        border: 1px solid rgba(255,255,255,.14);
        border-radius: 999px;
        padding: 2px 8px;
      }
    `;
    document.documentElement.appendChild(st);
  }

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  function applyPosition(root, pos) {
    const panel = root.querySelector(".panel");
    if (!panel) return;

    const vw = window.innerWidth || document.documentElement.clientWidth;
    const vh = window.innerHeight || document.documentElement.clientHeight;

    const rect = panel.getBoundingClientRect();
    const w = rect.width || 260;
    const h = rect.height || 180;

    const left = clamp(Number(pos.left) || 0, 0, Math.max(0, vw - w));
    const top = clamp(Number(pos.top) || 0, 0, Math.max(0, vh - h));

    root.style.left = `${left}px`;
    root.style.top = `${top}px`;
    root.style.right = "auto";
    root.style.bottom = "auto";
  }

  function initDrag(root, header) {
    let dragging = false;
    let startX = 0, startY = 0;
    let originLeft = 0, originTop = 0;

    const onMove = (ev) => {
      if (!dragging) return;
      const x = ev.clientX ?? (ev.touches?.[0]?.clientX);
      const y = ev.clientY ?? (ev.touches?.[0]?.clientY);
      if (typeof x !== "number" || typeof y !== "number") return;

      const dx = x - startX;
      const dy = y - startY;

      const panel = root.querySelector(".panel");
      const vw = window.innerWidth || document.documentElement.clientWidth;
      const vh = window.innerHeight || document.documentElement.clientHeight;
      const rect = panel.getBoundingClientRect();
      const w = rect.width || 260;
      const h = rect.height || 180;

      const left = clamp(originLeft + dx, 0, Math.max(0, vw - w));
      const top = clamp(originTop + dy, 0, Math.max(0, vh - h));

      root.style.left = `${left}px`;
      root.style.top = `${top}px`;
      root.style.right = "auto";
      root.style.bottom = "auto";
    };

    const onUp = async () => {
      if (!dragging) return;
      dragging = false;
      root.classList.remove("dragging");
      document.removeEventListener("pointermove", onMove, { capture: true });
      document.removeEventListener("pointerup", onUp, { capture: true });

      const left = parseFloat(root.style.left || "0");
      const top = parseFloat(root.style.top || "0");
      await storageSet({ [POS_KEY]: { left, top } });
    };

    header.addEventListener("pointerdown", (ev) => {
      if (ev.button !== undefined && ev.button !== 0) return; // left click only
      if (ev.target?.closest?.(".mini")) return; // don't drag when clicking Settings
      ev.preventDefault();

      const rect = root.getBoundingClientRect();
      startX = ev.clientX;
      startY = ev.clientY;
      originLeft = rect.left;
      originTop = rect.top;

      // switch to left/top anchoring for smooth dragging
      root.style.left = `${originLeft}px`;
      root.style.top = `${originTop}px`;
      root.style.right = "auto";
      root.style.bottom = "auto";

      dragging = true;
      root.classList.add("dragging");

      document.addEventListener("pointermove", onMove, { capture: true });
      document.addEventListener("pointerup", onUp, { capture: true });
    });
  }

  function createUI(ctx) {
    removeUI();

    const root = document.createElement("div");
    root.id = ROOT_ID;

    const panel = document.createElement("div");
    panel.className = "panel";

    const header = document.createElement("div");
    header.className = "title";
    header.innerHTML = `<span>Quick Add</span><span class="mini" title="Open extension options">Settings</span>`;
    header.querySelector(".mini").addEventListener("click", () => chrome.runtime.sendMessage({ action: "openOptions" }));

    const meta = document.createElement("div");
    meta.className = "muted";
    meta.textContent = `${ctx.title}${ctx.year ? " (" + ctx.year + ")" : ""} • ${ctx.type === "movie" ? "Movie" : "Show"}`;

    const meta2 = document.createElement("div");
    meta2.className = "meta-line";
    const chips = [];
    if (ctx.ids.tmdb) chips.push(`tmdb:${ctx.ids.tmdb}`);
    if (ctx.ids.tvdb) chips.push(`tvdb:${ctx.ids.tvdb}`);
    if (ctx.ids.imdb) chips.push(`imdb:${ctx.ids.imdb}`);
    if (chips.length === 0) chips.push("ids: none");
    meta2.innerHTML = chips.map(t => `<span class="tag">${t}</span>`).join("");

    const row = document.createElement("div");
    row.className = "row";

    const btn = document.createElement("button");
    btn.textContent = ctx.type === "movie" ? "Add to Radarr" : "Add to Sonarr";
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        await doAdd(ctx);
      } catch (e) {
        console.error("QuickAdd click failed:", e);
        toast(e?.message || "Failed. Open Settings and verify URLs/API keys.", false);
      } finally {
        btn.disabled = false;
      }
    });

    const btn2 = document.createElement("button");
    btn2.textContent = "Copy IDs";
    btn2.addEventListener("click", async () => {
      const txt = [
        `trakt:${ctx.slug}`,
        ctx.ids.imdb ? `imdb:${ctx.ids.imdb}` : null,
        ctx.ids.tmdb ? `tmdb:${ctx.ids.tmdb}` : null,
        ctx.ids.tvdb ? `tvdb:${ctx.ids.tvdb}` : null
      ].filter(Boolean).join("\n");
      try {
        await navigator.clipboard.writeText(txt);
        toast("Copied.", true);
      } catch {
        toast("Clipboard blocked by browser.", false);
      }
    });

    row.appendChild(btn);
    row.appendChild(btn2);

    const toastBox = document.createElement("div");
    toastBox.className = "toast";

    panel.appendChild(header);
    panel.appendChild(meta);
    panel.appendChild(meta2);
    panel.appendChild(row);
    panel.appendChild(toastBox);
    root.appendChild(panel);

    document.documentElement.appendChild(root);

    // Restore saved position (if any), then enable dragging.
    storageGet(POS_KEY).then((pos) => {
      if (pos && typeof pos.left === "number" && typeof pos.top === "number") {
        applyPosition(root, pos);
      }
    });

    initDrag(root, header);

    function toast(msg, ok) {
      toastBox.textContent = msg;
      toastBox.classList.remove("ok","bad","show");
      toastBox.classList.add("show", ok ? "ok" : "bad");
      window.clearTimeout(toastBox._t);
      toastBox._t = window.setTimeout(() => toastBox.classList.remove("show"), 4500);
    }

    async function doAdd(ctx) {
      toast("Working…", true);

      const resp = await chrome.runtime.sendMessage({
        action: ctx.type === "movie" ? "addMovie" : "addShow",
        payload: ctx
      });

      if (!resp || !resp.ok) {
        toast(resp?.error || "Failed. Open Settings and verify URLs/API keys.", false);
        return;
      }
      toast(resp.message || "Added.", true);
    }

    return { toast };
  }

  async function hydrateIdsViaTraktAPIIfNeeded(ctx) {
    // For shows, tvdb is the most reliable key for Sonarr; for movies, tmdb/imdb.
    const missingForShow = ctx.type === "show" && !ctx.ids.tvdb && !ctx.ids.tmdb && !ctx.ids.imdb;
    const missingForMovie = ctx.type === "movie" && !ctx.ids.tmdb && !ctx.ids.imdb;
    if (!missingForShow && !missingForMovie) return ctx;

    const resp = await chrome.runtime.sendMessage({
      action: "traktResolveIds",
      payload: { type: ctx.type, slug: ctx.slug }
    });

    if (resp?.ok && resp.ids) {
      ctx.ids = { ...ctx.ids, ...resp.ids };
      if (!ctx.year && resp.year) ctx.year = Number(resp.year) || ctx.year;
      if (resp.title && (!ctx.title || ctx.title.length < 2)) ctx.title = resp.title;
    }
    return ctx;
  }

  async function main() {
    const ts = getTypeAndSlug();
    if (!ts || !looksLikeItemPage(ts)) {
      removeUI();
      return;
    }

    ensureStyle();

    const { title, year } = guessTitleAndYear(ts.slug);
    const ids = scanIdsFromLinks();

    const ctx = { type: ts.type, slug: ts.slug, title, year, ids };
    await hydrateIdsViaTraktAPIIfNeeded(ctx);

    createUI(ctx);
  }

  let lastHref = location.href;
  const observer = new MutationObserver(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      setTimeout(main, 250);
    }
  });

  main();
  observer.observe(document.documentElement, { subtree: true, childList: true });
})();