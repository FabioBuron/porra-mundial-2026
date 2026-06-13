// =============================================================================
// La Porra del Mundial — Widget de Marcador en Vivo Flotante
// =============================================================================
// Fuente de datos: API abierta worldcup26.ir
//
// Es autónomo: se inyecta dinámicamente como widget flotante global en la
// esquina inferior derecha de cualquier página, encima del widget de música
// y a la izquierda del widget del Oráculo.
// =============================================================================

(function initLiveScoreWidget() {
  "use strict";

  const flagCodes = {
    "algeria": "dz", "argentina": "ar", "australia": "au", "austria": "at",
    "belgium": "be", "bosnia & herzegovina": "ba", "bosnia": "ba",
    "bosnia and herzegovina": "ba", "brazil": "br", "canada": "ca",
    "cape verde": "cv", "cabo verde": "cv", "colombia": "co",
    "croatia": "hr", "curaçao": "cw", "curacao": "cw", "czech republic": "cz",
    "czechia": "cz", "dr congo": "cd", "congo dr": "cd",
    "democratic republic of the congo": "cd", "ecuador": "ec", "egypt": "eg",
    "england": "gb-eng", "france": "fr", "germany": "de", "ghana": "gh",
    "haiti": "ht", "iran": "ir", "iraq": "iq", "ivory coast": "ci",
    "japan": "jp", "jordan": "jo", "mexico": "mx", "morocco": "ma",
    "netherlands": "nl", "new zealand": "nz", "norway": "no", "panama": "pa",
    "paraguay": "py", "portugal": "pt", "qatar": "qa", "saudi arabia": "sa",
    "scotland": "gb-sct", "senegal": "sn", "south africa": "za",
    "south korea": "kr", "spain": "es", "sweden": "se", "switzerland": "ch",
    "tunisia": "tn", "turkey": "tr", "usa": "us", "uruguay": "uy",
    "uzbekistan": "uz"
  };

  function cfg() {
    const c = (typeof CONFIG !== "undefined" && CONFIG.worldCup26) || {};
    return {
      base: (c.apiBase || "https://worldcup26.ir").replace(/\/+$/, ""),
      token: c.token || "",
      refreshMs: Number(c.refreshMs) > 0 ? Number(c.refreshMs) : 60000
    };
  }

  // Normaliza respuestas (array directo, {data}, {result}, etc.)
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
    // Si s tiene formato "MM/DD/YYYY HH:mm", lo parseamos manualmente para evitar inconsistencias
    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
    if (m) {
      const month = parseInt(m[1], 10) - 1;
      const day = parseInt(m[2], 10);
      const year = parseInt(m[3], 10);
      const hour = parseInt(m[4], 10);
      const min = parseInt(m[5], 10);
      return new Date(year, month, day, hour, min);
    }
    const t = Date.parse(s);
    return isNaN(t) ? null : new Date(t);
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function isFinished(game) {
    var f = String(game.finished).trim().toLowerCase();
    if (f === "true" || f === "1" || f === "yes") return true;
    return String(game.status || "").toLowerCase().indexOf("finish") !== -1;
  }

  function isLive(game) {
    if (isFinished(game)) return false;
    var te = String(game.time_elapsed || "").trim().toLowerCase();
    if (te && te !== "notstarted" && te !== "not started" && te !== "null") return true;
    var status = String(game.status || game.state || "").toLowerCase();
    if (status.indexOf("live") !== -1 || status.indexOf("play") !== -1 || status.indexOf("progress") !== -1) return true;
    if (game.live === true || game.is_live === true) return true;
    return false;
  }

  function teamCell(team, align, fallbackName) {
    const name = team ? (team.name_en || team.fifa_code) : (fallbackName || "TBD");
    const clean = (name || "").trim().toLowerCase();
    const code = flagCodes[clean] || (team && team.fifa_code ? flagCodes[team.fifa_code.toLowerCase()] : null);
    
    let flag = "";
    if (code) {
      flag = `<img src="https://flagcdn.com/w40/${code}.png" alt="" style="width:22px;height:16px;object-fit:cover;border-radius:2px;flex:0 0 auto;">`;
    } else if (team && team.flag) {
      flag = `<img src="${escapeHtml(team.flag)}" alt="" style="width:22px;height:16px;object-fit:cover;border-radius:2px;flex:0 0 auto;">`;
    } else {
      flag = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;display:inline-block;vertical-align:middle;opacity:0.6;flex:0 0 auto;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>`;
    }

    const dir = align === "right" ? "row-reverse" : "row";
    return `<span style="display:flex;align-items:center;gap:8px;flex-direction:${dir};flex:1;min-width:0;">
      ${flag}
      <span style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:0.9rem;">${escapeHtml(name)}</span>
    </span>`;
  }

  function getFlagImageHtml(team, fallbackName) {
    const name = team ? (team.name_en || team.fifa_code) : (fallbackName || "");
    const clean = (name || "").trim().toLowerCase();
    const code = flagCodes[clean] || (team && team.fifa_code ? flagCodes[team.fifa_code.toLowerCase()] : null);
    if (code) {
      return `<img src="https://flagcdn.com/w40/${code}.png" alt="" style="width:18px;height:13px;object-fit:cover;border-radius:1px;display:inline-block;vertical-align:middle;margin:0 2px;">`;
    } else if (team && team.flag) {
      return `<img src="${escapeHtml(team.flag)}" alt="" style="width:18px;height:13px;object-fit:cover;border-radius:1px;display:inline-block;vertical-align:middle;margin:0 2px;">`;
    }
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;display:inline-block;vertical-align:middle;opacity:0.6;margin:0 2px;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>`;
  }

  function scoreCell(game, live, finished) {
    const homeScore = game.home_score !== undefined && game.home_score !== null ? game.home_score : game.home_score_current;
    const awayScore = game.away_score !== undefined && game.away_score !== null ? game.away_score : game.away_score_current;
    const hasScore = homeScore !== null && homeScore !== undefined && homeScore !== "" &&
                     awayScore !== null && awayScore !== undefined && awayScore !== "";

    if (live || finished) {
      const h = hasScore ? homeScore : 0;
      const a = hasScore ? awayScore : 0;
      let timeLabel = "";
      if (live) {
        let te = String(game.time_elapsed || "").trim().toLowerCase();
        if (te && te !== "null" && te !== "notstarted") {
          if (!isNaN(Number(te))) te = te + "'";
          timeLabel = `<div style="font-size:0.65rem;color:#dc2626;font-weight:700;">${escapeHtml(te)}</div>`;
        }
      }
      return `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:60px;">
          <span style="font-weight:800;font-size:1rem;color:${live ? "#dc2626" : "var(--color-text)"};">${escapeHtml(h)} - ${escapeHtml(a)}</span>
          ${timeLabel}
        </div>`;
    }

    const d = parseLocalDate(game.local_date);
    if (d) {
      const dateLabel = d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
      const timeLabel = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
      return `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:60px;line-height:1.2;">
          <span style="color:var(--color-text-secondary);font-size:0.8rem;font-weight:600;">${escapeHtml(dateLabel)}</span>
          <span style="color:var(--color-text-muted,#718096);font-size:0.68rem;opacity:0.8;">${escapeHtml(timeLabel)}</span>
        </div>`;
    }
    const label = game.local_date || "VS";
    return `<span style="min-width:60px;text-align:center;color:var(--color-text-secondary);font-size:0.8rem;">${escapeHtml(label)}</span>`;
  }

  function badge(live, finished, isLastFinished, game) {
    if (live) {
      let te = game ? String(game.time_elapsed || "").trim().toLowerCase() : "";
      let minStr = "";
      if (te && te !== "null" && te !== "notstarted") {
        if (te.indexOf("half") !== -1 || te.indexOf("descanso") !== -1) {
          minStr = " (Int)";
        } else {
          if (!isNaN(Number(te))) te = te + "'";
          minStr = ` ${te}`;
        }
      }
      return `<span style="font-size:0.65rem;font-weight:700;color:#fff;background:#dc2626;border-radius:4px;padding:2px 6px;animation:lsBlink 1.2s ease-in-out infinite;">LIVE${escapeHtml(minStr)}</span>`;
    }
    if (isLastFinished) return `<span style="font-size:0.65rem;font-weight:700;color:#1b8b43;background:rgba(27,139,67,0.15);border:1px solid rgba(27,139,67,0.3);border-radius:4px;padding:1px 5px;">Último</span>`;
    if (finished) return `<span style="font-size:0.65rem;font-weight:700;color:var(--color-text-secondary);border:1px solid var(--color-border);border-radius:4px;padding:1px 5px;opacity:0.75;">Final</span>`;
    return `<span style="font-size:0.65rem;font-weight:700;color:var(--color-primary,#1b8b43);border:1px solid rgba(27,139,67,0.3);border-radius:4px;padding:1px 5px;">Próx</span>`;
  }

  function gameRow(game, teamsById, lastFinishedId) {
    const home = teamsById[String(game.home_team_id)];
    const away = teamsById[String(game.away_team_id)];
    const live = isLive(game);
    const finished = isFinished(game);
    const isLastFinished = finished && String(game.id) === String(lastFinishedId);
    const rowClass = `live-game-row ${isLastFinished ? "live-game-row--last-finished" : ""}`;

    return `
      <div class="${rowClass}">
        <div style="flex:0 0 auto;width:60px;display:flex;justify-content:flex-start;">${badge(live, finished, isLastFinished, game)}</div>
        <div style="display:flex;align-items:center;gap:6px;flex:1;min-width:0;">
          ${teamCell(home, "left", game.home_team_name_en || game.home_team_name)}
          ${scoreCell(game, live, finished)}
          ${teamCell(away, "right", game.away_team_name_en || game.away_team_name)}
        </div>
      </div>`;
  }

  function renderContent(mount, html) {
    mount.innerHTML = `
      <style>@keyframes lsBlink{0%,100%{opacity:1}50%{opacity:.35}}</style>
      ${html}
      <div style="text-align:right;padding:8px 12px;background:var(--color-surface-2,#1e2535);border-top:1px solid var(--color-border-subtle);">
        <span style="font-size:0.65rem;color:var(--color-text-secondary);opacity:.7;">API: worldcup26.ir</span>
      </div>`;
  }

  function pickGamesToShow(games) {
    const sorted = games.slice().sort((a, b) => {
      const da = parseLocalDate(a.local_date), db = parseLocalDate(b.local_date);
      return (da ? da.getTime() : 0) - (db ? db.getTime() : 0);
    });

    const live = sorted.filter(isLive);
    if (live.length > 0) {
      return { titleSuffix: "", games: live.slice(0, 8), lastFinishedId: null };
    }

    // Buscar el último partido finalizado para no borrarlo
    const finished = sorted.filter(isFinished);
    const lastFinished = finished.length > 0 ? finished[finished.length - 1] : null;

    // Buscar próximos partidos
    const now = Date.now();
    const upcoming = sorted.filter(g => {
      if (isFinished(g)) return false;
      const d = parseLocalDate(g.local_date);
      return !d || d.getTime() >= now - 24 * 3600000;
    }).slice(0, 4);

    const toShow = [];
    if (lastFinished) {
      toShow.push(lastFinished);
    }
    upcoming.forEach(g => {
      if (!lastFinished || String(g.id) !== String(lastFinished.id)) {
        toShow.push(g);
      }
    });

    if (toShow.length > 0) {
      return {
        titleSuffix: lastFinished ? "Último resultado y próximos partidos" : "Próximos partidos",
        games: toShow.slice(0, 5),
        lastFinishedId: lastFinished ? lastFinished.id : null
      };
    }

    // En su defecto, los últimos 5 finalizados
    const last5Finished = finished.slice(-5).reverse();
    return {
      titleSuffix: "Últimos resultados",
      games: last5Finished,
      lastFinishedId: last5Finished[0] ? last5Finished[0].id : null
    };
  }

  let _timer = null;
  let _teamsCache = null;

  function ensureWidgetContainer() {
    let container = document.getElementById("live-widget-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "live-widget-container";
      container.className = "live-widget";
      container.innerHTML = `
        <div class="live-panel" id="live-panel" style="display:none; flex-direction:column;">
          <div class="live-panel__header">
            <span class="live-panel__header-emoji">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;color:var(--color-primary,#1b8b43);"><rect x="2" y="3" width="20" height="18" rx="2" ry="2"></rect><line x1="12" y1="3" x2="12" y2="21"></line><circle cx="12" cy="12" r="4"></circle></svg>
            </span>
            <div class="live-panel__header-title" id="live-panel-title">Marcadores en Vivo</div>
            <button class="live-panel__close" id="live-panel-close" aria-label="Cerrar panel">×</button>
          </div>
          <div class="live-panel__content" id="live-panel-content">
            <p style="text-align:center;color:var(--color-text-secondary);padding:16px;">Cargando marcadores…</p>
          </div>
        </div>
        <button class="live-fab" id="live-fab" aria-label="Marcadores en vivo">
          <span class="live-fab__icon" style="display:inline-flex;align-items:center;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px;"><rect x="2" y="3" width="20" height="18" rx="2" ry="2"></rect><line x1="12" y1="3" x2="12" y2="21"></line><circle cx="12" cy="12" r="4"></circle></svg>
          </span>
          <span class="live-fab__text" id="live-fab-text" style="display:none;"></span>
        </button>
      `;
      document.body.appendChild(container);

      const fab = container.querySelector("#live-fab");
      const panel = container.querySelector("#live-panel");
      const closeBtn = container.querySelector("#live-panel-close");

      fab.addEventListener("click", (e) => {
        e.stopPropagation();
        const isVisible = panel.style.display !== "none";
        panel.style.display = isVisible ? "none" : "flex";
        if (!isVisible) {
          refresh();
        }
      });

      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        panel.style.display = "none";
      });

      document.addEventListener("click", (e) => {
        if (!container.contains(e.target) && panel.style.display !== "none") {
          panel.style.display = "none";
        }
      });
    }
    return container;
  }

  async function refresh() {
    ensureWidgetContainer();
    const panelContent = document.getElementById("live-panel-content");
    const panelTitle = document.getElementById("live-panel-title");
    const fab = document.getElementById("live-fab");
    const fabText = document.getElementById("live-fab-text");
    if (!panelContent) return;

    try {
      if (!_teamsCache) {
        const teamsJson = await apiGet("/get/teams");
        _teamsCache = {};
        asArray(teamsJson).forEach(t => { if (t && t.id !== undefined) _teamsCache[String(t.id)] = t; });
      }
      const gamesJson = await apiGet("/get/games");
      const games = asArray(gamesJson);

      if (games.length === 0) {
        renderContent(panelContent, `<p style="text-align:center;color:var(--color-text-secondary);padding:16px;">Aún no hay partidos disponibles.</p>`);
        fabText.style.display = "none";
        fabText.textContent = "";
        fab.classList.remove("live-fab--live");
        return;
      }

      // 1. Control del botón flotante (FAB)
      const liveGames = games.filter(isLive);
      if (liveGames.length > 0) {
        const active = liveGames[0];
        const home = _teamsCache[String(active.home_team_id)];
        const away = _teamsCache[String(active.away_team_id)];
        const homeFlag = getFlagImageHtml(home, active.home_team_name_en || active.home_team_name);
        const awayFlag = getFlagImageHtml(away, active.away_team_name_en || active.away_team_name);
        const homeScore = active.home_score !== undefined && active.home_score !== null ? active.home_score : active.home_score_current;
        const awayScore = active.away_score !== undefined && active.away_score !== null ? active.away_score : active.away_score_current;
        const h = homeScore !== null ? homeScore : 0;
        const a = awayScore !== null ? awayScore : 0;
        let elapsed = String(active.time_elapsed || "").trim().toLowerCase();
        if (elapsed === "null" || elapsed === "" || elapsed === "notstarted") elapsed = "Live";
        else if (elapsed.indexOf("half") !== -1 || elapsed.indexOf("descanso") !== -1) elapsed = "Int";
        else if (!isNaN(Number(elapsed))) elapsed = elapsed + "'";

        fabText.innerHTML = `<span style="display:flex;align-items:center;gap:6px;">${homeFlag} ${h}-${a} ${awayFlag} <span style="font-size:0.65rem;font-weight:700;color:#fff;background:#dc2626;border-radius:12px;padding:1px 6px;text-transform:uppercase;margin-left:4px;">${elapsed}</span></span>`;
        fabText.style.display = "inline";
        fab.classList.add("live-fab--live");
      } else {
        // No hay partidos en vivo: buscar el último partido terminado
        const sortedGames = games.slice().sort((a, b) => {
          const da = parseLocalDate(a.local_date), db = parseLocalDate(b.local_date);
          return (da ? da.getTime() : 0) - (db ? db.getTime() : 0);
        });
        const finishedGames = sortedGames.filter(isFinished);
        const lastFinished = finishedGames.length > 0 ? finishedGames[finishedGames.length - 1] : null;

        if (lastFinished) {
          const home = _teamsCache[String(lastFinished.home_team_id)];
          const away = _teamsCache[String(lastFinished.away_team_id)];
          const homeFlag = getFlagImageHtml(home, lastFinished.home_team_name_en || lastFinished.home_team_name);
          const awayFlag = getFlagImageHtml(away, lastFinished.away_team_name_en || lastFinished.away_team_name);
          const homeScore = lastFinished.home_score !== undefined && lastFinished.home_score !== null ? lastFinished.home_score : lastFinished.home_score_current;
          const awayScore = lastFinished.away_score !== undefined && lastFinished.away_score !== null ? lastFinished.away_score : lastFinished.away_score_current;
          const h = homeScore !== null ? homeScore : 0;
          const a = awayScore !== null ? awayScore : 0;
          
          fabText.innerHTML = `<span style="display:flex;align-items:center;gap:6px;">${homeFlag} ${h}-${a} ${awayFlag} <span style="font-size:0.65rem;font-weight:700;color:var(--color-text-secondary);background:rgba(255,255,255,0.08);border:1px solid var(--color-border);border-radius:12px;padding:1px 6px;text-transform:uppercase;margin-left:4px;">Fin</span></span>`;
          fabText.style.display = "inline";
        } else {
          fabText.style.display = "none";
          fabText.innerHTML = "";
        }
        fab.classList.remove("live-fab--live");
      }

      // 2. Control de la lista del panel
      const { titleSuffix, games: toShow, lastFinishedId } = pickGamesToShow(games);
      if (panelTitle && titleSuffix) {
        panelTitle.textContent = titleSuffix;
      }
      const rows = toShow.map(g => gameRow(g, _teamsCache, lastFinishedId)).join("");
      renderContent(panelContent, `<div style="display:flex;flex-direction:column;">${rows}</div>`);

    } catch (err) {
      console.warn("LiveScore widget: no se pudieron cargar datos de worldcup26.ir.", err);
      renderContent(panelContent, `<p style="text-align:center;color:var(--color-text-secondary);padding:16px;font-size:0.85rem;">
        No se pudo conectar con la API de resultados en este momento.
      </p>`);
    }
  }

  function start() {
    ensureWidgetContainer();
    refresh();
    if (_timer) clearInterval(_timer);
    _timer = setInterval(refresh, cfg().refreshMs);

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
