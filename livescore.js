// =============================================================================
// La Porra del Mundial — Widget de Marcador en Vivo
// =============================================================================
// Fuente de datos: API abierta worldcup26.ir
//   Repo:  https://github.com/rezarahiminia/worldcup2026
//   Docs:  https://worldcup26.ir/api-docs/
//
// Sustituye al antiguo widget de api-sports.io. Es autónomo: se monta solo en
// la página de partidos sobre el contenedor #livescore-widget y refresca cada
// CONFIG.worldCup26.refreshMs milisegundos.
//
// Endpoints usados (GET):
//   /get/teams  → [{ id, name_en, name_fa, fifa_code, groups, flag }]
//   /get/games  → [{ id, home_team_id, away_team_id, home_score, away_score,
//                    group, matchday, local_date, stadium_id, finished, type }]
// =============================================================================

(function initLiveScoreWidget() {
  "use strict";

  // Solo en la página de partidos (donde existe el contenedor).
  function getMount() {
    return document.getElementById("livescore-widget");
  }

  function cfg() {
    const c = (typeof CONFIG !== "undefined" && CONFIG.worldCup26) || {};
    return {
      base: (c.apiBase || "https://worldcup26.ir").replace(/\/+$/, ""),
      token: c.token || "",
      refreshMs: Number(c.refreshMs) > 0 ? Number(c.refreshMs) : 60000
    };
  }

  // Normaliza distintas formas de respuesta (array directo, {data}, {result}, …)
  function asArray(json) {
    if (Array.isArray(json)) return json;
    if (!json || typeof json !== "object") return [];
    for (const k of ["data", "games", "matches", "teams", "result", "results", "items"]) {
      if (Array.isArray(json[k])) return json[k];
    }
    return [];
  }

  async function apiGet(path) {
    const { base, token } = cfg();
    const headers = { "Accept": "application/json" };
    if (token) headers["Authorization"] = "Bearer " + token;
    const resp = await fetch(base + path, { headers, mode: "cors" });
    if (!resp.ok) throw new Error("HTTP " + resp.status + " en " + path);
    return resp.json();
  }

  function parseLocalDate(s) {
    if (!s) return null;
    const t = Date.parse(s);
    return isNaN(t) ? null : new Date(t);
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // Indicador de "en vivo" tolerante con distintos nombres de campo, ya que la
  // API documenta sobre todo `finished`; durante el torneo añade estado en vivo.
  function isLive(game) {
    if (game.finished === true || game.finished === "true") return false;
    const status = String(game.status || game.state || "").toLowerCase();
    if (status.includes("live") || status.includes("play") || status.includes("progress")) return true;
    if (game.live === true || game.is_live === true) return true;
    const elapsed = Number(game.elapsed || game.minute || game.time);
    if (!isNaN(elapsed) && elapsed > 0) return true;
    return false;
  }

  function isFinished(game) {
    return game.finished === true || game.finished === "true" ||
      String(game.status || "").toLowerCase().includes("finish");
  }

  function teamCell(team, align) {
    const flag = team && team.flag
      ? `<img src="${escapeHtml(team.flag)}" alt="" style="width:22px;height:16px;object-fit:cover;border-radius:2px;flex:0 0 auto;">`
      : "";
    const name = team ? (team.name_en || team.fifa_code || ("#" + team.id)) : "TBD";
    const dir = align === "right" ? "row-reverse" : "row";
    return `<span style="display:flex;align-items:center;gap:8px;flex-direction:${dir};flex:1;min-width:0;">
      ${flag}
      <span style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(name)}</span>
    </span>`;
  }

  function scoreCell(game, live, finished) {
    const hasScore = game.home_score !== null && game.home_score !== undefined && game.home_score !== "" &&
                     game.away_score !== null && game.away_score !== undefined && game.away_score !== "";
    if (live || finished) {
      const h = hasScore ? game.home_score : 0;
      const a = hasScore ? game.away_score : 0;
      return `<span style="font-weight:800;font-size:1.05rem;min-width:54px;text-align:center;color:${live ? "var(--color-gold)" : "var(--color-text)"};">${escapeHtml(h)} - ${escapeHtml(a)}</span>`;
    }
    const d = parseLocalDate(game.local_date);
    const label = d
      ? d.toLocaleDateString("es-ES", { day: "numeric", month: "short" })
      : (game.local_date || "VS");
    return `<span style="min-width:54px;text-align:center;color:var(--color-text-secondary);font-size:var(--font-sm,0.85rem);">${escapeHtml(label)}</span>`;
  }

  function badge(live, finished) {
    if (live) return `<span style="font-size:0.7rem;font-weight:700;color:#fff;background:#dc2626;border-radius:999px;padding:1px 8px;animation:lsBlink 1.2s ease-in-out infinite;">🔴 EN VIVO</span>`;
    if (finished) return `<span style="font-size:0.7rem;font-weight:700;color:var(--color-text-secondary);border:1px solid var(--color-border);border-radius:999px;padding:1px 8px;">Final</span>`;
    return `<span style="font-size:0.7rem;font-weight:700;color:var(--color-green);border:1px solid var(--color-border);border-radius:999px;padding:1px 8px;">Próximo</span>`;
  }

  function gameRow(game, teamsById) {
    const home = teamsById[String(game.home_team_id)];
    const away = teamsById[String(game.away_team_id)];
    const live = isLive(game);
    const finished = isFinished(game);
    return `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid var(--color-border-subtle,#131a29);">
        <div style="flex:0 0 auto;">${badge(live, finished)}</div>
        <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;">
          ${teamCell(home, "left")}
          ${scoreCell(game, live, finished)}
          ${teamCell(away, "right")}
        </div>
      </div>`;
  }

  function render(mount, html) {
    mount.innerHTML = `
      <style>@keyframes lsBlink{0%,100%{opacity:1}50%{opacity:.35}}</style>
      ${html}
      <div style="text-align:right;padding:6px 12px 0;">
        <span style="font-size:0.7rem;color:var(--color-text-secondary);opacity:.7;">Datos: worldcup26.ir</span>
      </div>`;
  }

  function pickGamesToShow(games) {
    const sorted = games.slice().sort((a, b) => {
      const da = parseLocalDate(a.local_date), db = parseLocalDate(b.local_date);
      return (da ? da.getTime() : 0) - (db ? db.getTime() : 0);
    });

    const live = sorted.filter(isLive);
    if (live.length > 0) return { titleSuffix: "", games: live.slice(0, 8) };

    // Sin partidos en vivo: mostramos los próximos no terminados…
    const now = Date.now();
    const upcoming = sorted.filter(g => {
      if (isFinished(g)) return false;
      const d = parseLocalDate(g.local_date);
      return !d || d.getTime() >= now - 24 * 3600000; // hoy en adelante
    }).slice(0, 5);
    if (upcoming.length > 0) return { titleSuffix: " — próximos partidos", games: upcoming };

    // …o, en su defecto, los últimos resultados.
    const finished = sorted.filter(isFinished).slice(-5).reverse();
    return { titleSuffix: " — últimos resultados", games: finished };
  }

  let _timer = null;
  let _teamsCache = null;

  async function refresh() {
    const mount = getMount();
    if (!mount) return;

    try {
      if (!_teamsCache) {
        const teamsJson = await apiGet("/get/teams");
        _teamsCache = {};
        asArray(teamsJson).forEach(t => { if (t && t.id !== undefined) _teamsCache[String(t.id)] = t; });
      }
      const gamesJson = await apiGet("/get/games");
      const games = asArray(gamesJson);

      if (games.length === 0) {
        render(mount, `<p style="text-align:center;color:var(--color-text-secondary);padding:16px;">Aún no hay partidos disponibles.</p>`);
        return;
      }

      const { titleSuffix, games: toShow } = pickGamesToShow(games);
      const rows = toShow.map(g => gameRow(g, _teamsCache)).join("");
      render(mount, `
        ${titleSuffix ? `<div style="padding:4px 12px 8px;font-size:var(--font-sm,0.85rem);color:var(--color-text-secondary);">${escapeHtml(titleSuffix.replace(/^ — /, ""))}</div>` : ""}
        <div>${rows}</div>`);
    } catch (err) {
      console.warn("LiveScore widget: no se pudieron cargar datos de worldcup26.ir.", err);
      const mount2 = getMount();
      if (mount2) {
        render(mount2, `<p style="text-align:center;color:var(--color-text-secondary);padding:16px;">
          No se pudo conectar con la API de resultados en vivo en este momento.
        </p>`);
      }
    }
  }

  function start() {
    const mount = getMount();
    if (!mount) return; // No estamos en la página de partidos.
    render(mount, `<p style="text-align:center;color:var(--color-text-secondary);padding:16px;">Cargando marcadores…</p>`);
    refresh();
    if (_timer) clearInterval(_timer);
    _timer = setInterval(refresh, cfg().refreshMs);

    // Pausar el refresco cuando la pestaña no está visible (ahorra peticiones).
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        if (_timer) { clearInterval(_timer); _timer = null; }
      } else if (!_timer) {
        refresh();
        _timer = setInterval(refresh, cfg().refreshMs);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
