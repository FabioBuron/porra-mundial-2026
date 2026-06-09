// =============================================================================
// La Porra del Mundial — Main Application
// =============================================================================
// Handles: CSV fetching/parsing, data loading, DOM rendering for all views.
// Depends on: config.js, scoring.js (loaded before this file)
// =============================================================================

const App = (() => {
  "use strict";

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  let _data = {
    participants: [],
    matches: [],
    matchPredictions: [],
    players: [],
    scorerPicks: [],
    goalkeeperPicks: [],
    specialEvents: [],
    specialEventPicks: []
  };

  let _loaded = false;
  let _currentRound = "group_md1";

  // ---------------------------------------------------------------------------
  // CSV Parsing
  // ---------------------------------------------------------------------------

  function parseCSV(text) {
    const lines = text.trim().split("\n");
    if (lines.length < 2) return [];

    const headers = parseCSVLine(lines[0]);
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length === 0) continue;

      const row = {};
      headers.forEach((h, idx) => {
        let val = values[idx] !== undefined ? values[idx].trim() : "";
        // Auto-convert numbers
        if (val !== "" && !isNaN(val) && val !== "true" && val !== "false") {
          const num = Number(val);
          if (Number.isFinite(num)) val = num;
        }
        // Auto-convert booleans
        if (val === "true" || val === "TRUE") val = true;
        if (val === "false" || val === "FALSE") val = false;
        // Empty string to null
        if (val === "") val = null;
        row[h.trim()] = val;
      });
      rows.push(row);
    }
    return rows;
  }

  function parseCSVLine(line) {
    const values = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ",") {
          values.push(current);
          current = "";
        } else {
          current += ch;
        }
      }
    }
    values.push(current);
    return values;
  }

  // ---------------------------------------------------------------------------
  // Data Loading
  // ---------------------------------------------------------------------------

  async function fetchSheet(url) {
    if (!url || url.startsWith("URL_CSV")) {
      console.warn("Sheet URL not configured:", url);
      return [];
    }
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const text = await resp.text();
      return parseCSV(text);
    } catch (err) {
      console.error("Error fetching sheet:", url, err);
      return [];
    }
  }

  async function loadAllData() {
    showLoading(true);
    try {
      const sheets = CONFIG.googleSheets;
      const [participants, matches, matchPredictions, players, scorerPicks, goalkeeperPicks, specialEvents, specialEventPicks] =
        await Promise.all([
          fetchSheet(sheets.participants),
          fetchSheet(sheets.matches),
          fetchSheet(sheets.match_predictions),
          fetchSheet(sheets.players),
          fetchSheet(sheets.scorer_picks),
          fetchSheet(sheets.goalkeeper_picks),
          fetchSheet(sheets.special_events),
          fetchSheet(sheets.special_event_picks)
        ]);

      _data = { participants, matches, matchPredictions, players, scorerPicks, goalkeeperPicks, specialEvents, specialEventPicks };
      _loaded = true;
    } catch (err) {
      console.error("Error loading data:", err);
      showError("Error loading data. Check your Google Sheets URLs in config.js.");
    } finally {
      showLoading(false);
    }
    return _data;
  }

  // ---------------------------------------------------------------------------
  // Demo Data (used when Google Sheets URLs are not configured)
  // ---------------------------------------------------------------------------

  function loadDemoData() {
    _data = {
      participants: [
        { id: "p01", name: "Carlos", paid: true },
        { id: "p02", name: "María", paid: true },
        { id: "p03", name: "Javi", paid: true },
        { id: "p04", name: "Laura", paid: false },
        { id: "p05", name: "Pedro", paid: true },
        { id: "p06", name: "Ana", paid: true },
        { id: "p07", name: "Diego", paid: true },
        { id: "p08", name: "Lucía", paid: false }
      ],
      matches: [
        { id: "m001", phase: "group", group: "A", matchday: 1, round_label: "Jornada 1", home_team: "USA", away_team: "Morocco", kickoff_utc: "2026-06-11T18:00:00Z", home_score: 2, away_score: 1, status: "finished", is_double_points: false },
        { id: "m002", phase: "group", group: "A", matchday: 1, round_label: "Jornada 1", home_team: "Mexico", away_team: "Colombia", kickoff_utc: "2026-06-11T21:00:00Z", home_score: 1, away_score: 1, status: "finished", is_double_points: false },
        { id: "m003", phase: "group", group: "B", matchday: 1, round_label: "Jornada 1", home_team: "Spain", away_team: "Brazil", kickoff_utc: "2026-06-12T18:00:00Z", home_score: 3, away_score: 0, status: "finished", is_double_points: true },
        { id: "m004", phase: "group", group: "B", matchday: 1, round_label: "Jornada 1", home_team: "Germany", away_team: "Japan", kickoff_utc: "2026-06-12T21:00:00Z", home_score: null, away_score: null, status: "scheduled", is_double_points: false },
        { id: "m005", phase: "group", group: "A", matchday: 2, round_label: "Jornada 2", home_team: "Morocco", away_team: "Mexico", kickoff_utc: "2026-06-15T18:00:00Z", home_score: null, away_score: null, status: "scheduled", is_double_points: false },
        { id: "m006", phase: "group", group: "A", matchday: 2, round_label: "Jornada 2", home_team: "Colombia", away_team: "USA", kickoff_utc: "2026-06-15T21:00:00Z", home_score: null, away_score: null, status: "scheduled", is_double_points: false }
      ],
      matchPredictions: [
        { participant_id: "p01", match_id: "m001", predicted_home: 2, predicted_away: 1, points_earned: 3 },
        { participant_id: "p01", match_id: "m002", predicted_home: 2, predicted_away: 0, points_earned: 1 },
        { participant_id: "p01", match_id: "m003", predicted_home: 2, predicted_away: 0, points_earned: 4 },
        { participant_id: "p02", match_id: "m001", predicted_home: 1, predicted_away: 0, points_earned: 2 },
        { participant_id: "p02", match_id: "m002", predicted_home: 0, predicted_away: 0, points_earned: 1 },
        { participant_id: "p02", match_id: "m003", predicted_home: 1, predicted_away: 1, points_earned: 0 },
        { participant_id: "p03", match_id: "m001", predicted_home: 0, predicted_away: 2, points_earned: 0 },
        { participant_id: "p03", match_id: "m002", predicted_home: 1, predicted_away: 1, points_earned: 3 },
        { participant_id: "p03", match_id: "m003", predicted_home: 3, predicted_away: 0, points_earned: 6 },
        { participant_id: "p04", match_id: "m001", predicted_home: 3, predicted_away: 2, points_earned: 2 },
        { participant_id: "p04", match_id: "m002", predicted_home: 2, predicted_away: 1, points_earned: 0 },
        { participant_id: "p04", match_id: "m003", predicted_home: 2, predicted_away: 1, points_earned: 2 },
        { participant_id: "p05", match_id: "m001", predicted_home: 1, predicted_away: 1, points_earned: 0 },
        { participant_id: "p05", match_id: "m002", predicted_home: 1, predicted_away: 1, points_earned: 3 },
        { participant_id: "p05", match_id: "m003", predicted_home: 2, predicted_away: 0, points_earned: 4 },
        { participant_id: "p06", match_id: "m001", predicted_home: 2, predicted_away: 0, points_earned: 1 },
        { participant_id: "p06", match_id: "m002", predicted_home: 0, predicted_away: 1, points_earned: 0 },
        { participant_id: "p06", match_id: "m003", predicted_home: 4, predicted_away: 1, points_earned: 4 },
        { participant_id: "p07", match_id: "m001", predicted_home: 2, predicted_away: 1, points_earned: 3 },
        { participant_id: "p07", match_id: "m002", predicted_home: 3, predicted_away: 0, points_earned: 0 },
        { participant_id: "p07", match_id: "m003", predicted_home: 1, predicted_away: 0, points_earned: 2 },
        { participant_id: "p08", match_id: "m001", predicted_home: 1, predicted_away: 2, points_earned: 0 },
        { participant_id: "p08", match_id: "m002", predicted_home: 2, predicted_away: 2, points_earned: 1 },
        { participant_id: "p08", match_id: "m003", predicted_home: 2, predicted_away: 1, points_earned: 2 }
      ],
      players: [
        { id: "pl01", name: "Mbappé", team: "France", position: "outfield", active: true },
        { id: "pl02", name: "Haaland", team: "Norway", position: "outfield", active: true },
        { id: "pl03", name: "Courtois", team: "Belgium", position: "goalkeeper", active: true },
        { id: "pl04", name: "Ter Stegen", team: "Germany", position: "goalkeeper", active: true }
      ],
      scorerPicks: [
        { participant_id: "p01", round_key: "group_md1", player_id: "pl01", goals_scored: 2, points_earned: 2 },
        { participant_id: "p02", round_key: "group_md1", player_id: "pl02", goals_scored: 1, points_earned: 1 },
        { participant_id: "p03", round_key: "group_md1", player_id: "pl01", goals_scored: 2, points_earned: 2 },
        { participant_id: "p04", round_key: "group_md1", player_id: "pl02", goals_scored: 1, points_earned: 1 },
        { participant_id: "p05", round_key: "group_md1", player_id: "pl01", goals_scored: 2, points_earned: 2 },
        { participant_id: "p06", round_key: "group_md1", player_id: "pl01", goals_scored: 2, points_earned: 2 },
        { participant_id: "p07", round_key: "group_md1", player_id: "pl02", goals_scored: 1, points_earned: 1 },
        { participant_id: "p08", round_key: "group_md1", player_id: "pl02", goals_scored: 1, points_earned: 1 }
      ],
      goalkeeperPicks: [
        { participant_id: "p01", round_key: "group_md1", player_id: "pl03", points_earned: 3 },
        { participant_id: "p02", round_key: "group_md1", player_id: "pl04", points_earned: -1 },
        { participant_id: "p03", round_key: "group_md1", player_id: "pl03", points_earned: 3 },
        { participant_id: "p04", round_key: "group_md1", player_id: "pl04", points_earned: -1 },
        { participant_id: "p05", round_key: "group_md1", player_id: "pl03", points_earned: 3 },
        { participant_id: "p06", round_key: "group_md1", player_id: "pl03", points_earned: 3 },
        { participant_id: "p07", round_key: "group_md1", player_id: "pl04", points_earned: -1 },
        { participant_id: "p08", round_key: "group_md1", player_id: "pl03", points_earned: 3 }
      ],
      specialEvents: [
        { id: "E1", name: "Ganador del Mundial", description: "¿Qué selección ganará el Mundial 2026?", deadline_utc: "2026-06-11T17:00:00Z", is_active: false, is_resolved: true, result_description: "Argentina" },
        { id: "E2", name: "Partido Salvaje", description: "Un partido sorteado vale el doble de puntos", deadline_utc: null, is_active: false, is_resolved: true, result_description: "Partido m003: Spain vs Brazil" },
        { id: "E3", name: "El Portero Héroe", description: "¿Qué portero parará un penalti en cuartos o semis?", deadline_utc: "2026-07-04T16:00:00Z", is_active: true, is_resolved: false, result_description: null },
        { id: "E4", name: "La Maldición del Favorito", description: "¿Qué favorito será eliminado antes de semis?", deadline_utc: "2026-06-28T16:00:00Z", is_active: true, is_resolved: false, result_description: null },
        { id: "E5", name: "Hat-Trick Salvaje", description: "¿Quién hará un hat-trick en el torneo?", deadline_utc: "2026-06-11T17:00:00Z", is_active: false, is_resolved: false, result_description: null },
        { id: "E6", name: "Partido con más Goles (Eliminatorias)", description: "¿Cuántos goles se marcarán en el partido con más goles de las eliminatorias?", deadline_utc: "2026-06-27T16:00:00Z", is_active: true, is_resolved: false, result_description: null }
      ],
      specialEventPicks: [
        { participant_id: "p01", event_id: "E1", pick_value: "Argentina", points_earned: 5 },
        { participant_id: "p02", event_id: "E1", pick_value: "France", points_earned: 0 },
        { participant_id: "p03", event_id: "E1", pick_value: "Brazil", points_earned: 0 },
        { participant_id: "p04", event_id: "E1", pick_value: "Argentina", points_earned: 5 },
        { participant_id: "p05", event_id: "E1", pick_value: "Spain", points_earned: 0 },
        { participant_id: "p06", event_id: "E1", pick_value: "Argentina", points_earned: 5 },
        { participant_id: "p07", event_id: "E1", pick_value: "Germany", points_earned: 0 },
        { participant_id: "p08", event_id: "E1", pick_value: "Argentina", points_earned: 5 },
        
        { participant_id: "p01", event_id: "E6", pick_value: "6", points_earned: 0 },
        { participant_id: "p02", event_id: "E6", pick_value: "5", points_earned: 0 },
        { participant_id: "p03", event_id: "E6", pick_value: "7", points_earned: 0 },
        { participant_id: "p04", event_id: "E6", pick_value: "6", points_earned: 0 },
        { participant_id: "p05", event_id: "E6", pick_value: "4", points_earned: 0 },
        { participant_id: "p06", event_id: "E6", pick_value: "5", points_earned: 0 },
        { participant_id: "p07", event_id: "E6", pick_value: "6", points_earned: 0 },
        { participant_id: "p08", event_id: "E6", pick_value: "8", points_earned: 0 }
      ]
    };
    _loaded = true;
  }

  // ---------------------------------------------------------------------------
  // Rendering Helpers
  // ---------------------------------------------------------------------------

  function $(selector) {
    return document.querySelector(selector);
  }

  function $$(selector) {
    return document.querySelectorAll(selector);
  }

  function el(tag, attrs, ...children) {
    const elem = document.createElement(tag);
    if (attrs) {
      Object.entries(attrs).forEach(([k, v]) => {
        if (k === "className") elem.className = v;
        else if (k === "innerHTML") elem.innerHTML = v;
        else if (k.startsWith("on")) elem.addEventListener(k.slice(2).toLowerCase(), v);
        else elem.setAttribute(k, v);
      });
    }
    children.forEach(child => {
      if (typeof child === "string") elem.appendChild(document.createTextNode(child));
      else if (child) elem.appendChild(child);
    });
    return elem;
  }

  function showLoading(show) {
    const loader = $("#loading-overlay");
    if (loader) loader.style.display = show ? "flex" : "none";
  }

  function showError(msg) {
    const container = $("#app-content");
    if (container) {
      container.innerHTML = `<div class="card" style="text-align:center;padding:2rem;"><p class="text-red">⚠️ ${msg}</p></div>`;
    }
  }

  // ---------------------------------------------------------------------------
  // View: Leaderboard (index.html)
  // ---------------------------------------------------------------------------

  function renderLeaderboard() {
    const container = $("#app-content");
    if (!container) return;

    const board = Scoring.buildLeaderboard(
      _data.participants,
      _data.matchPredictions,
      _data.scorerPicks,
      _data.goalkeeperPicks,
      _data.specialEventPicks
    );

    const posEmoji = (pos) => {
      if (pos === 1) return "🥇";
      if (pos === 2) return "🥈";
      if (pos === 3) return "🥉";
      return pos;
    };

    let html = `
      <div class="hero">
        <h1>🏆 ${CONFIG.appName}</h1>
        <p class="hero-subtitle">Mundial 2026 · ${CONFIG.participants} participantes · Premio: ${CONFIG.prize}</p>
      </div>
      <div class="card fade-in">
        <h2 class="card-title">📊 Clasificación General</h2>
        <div class="table-container">
          <table class="leaderboard-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Participante</th>
                <th>Total</th>
                <th title="Módulo 1: Partidos">⚽ M1</th>
                <th title="Módulo 2: Goleador">🎯 M2</th>
                <th title="Módulo 3: Portero">🧤 M3</th>
                <th title="Módulo 4: Eventos">🌟 M4</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              ${board.map((p, i) => `
                <tr class="leaderboard-row leaderboard-row--pos-${p.position}">
                  <td class="pos-cell">${posEmoji(p.position)}</td>
                  <td class="name-cell">${escapeHtml(p.name)}</td>
                  <td class="total-cell"><strong>${p.totalPoints}</strong></td>
                  <td>${p.matchPoints}</td>
                  <td>${p.scorerPoints}</td>
                  <td>${p.goalkeeperPoints}</td>
                  <td>${p.specialEventPoints}</td>
                  <td>${p.paid ? '<span class="badge badge--paid">✓ Pagado</span>' : '<span class="badge badge--unpaid">Pendiente</span>'}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card fade-in mt-2">
        <h3 class="card-title">📋 Desempate</h3>
        <p class="text-muted">En caso de empate: 1º Más puntos en partidos (M1) → 2º Más puntos goleador + portero (M2+M3) → 3º Más puntos en eventos (M4) → 4º Moneda al aire</p>
      </div>
    `;

    container.innerHTML = html;
  }

  // ---------------------------------------------------------------------------
  // View: Match Predictions (partidos.html)
  // ---------------------------------------------------------------------------

  function renderMatches() {
    const container = $("#app-content");
    if (!container) return;

    const roundSelector = buildRoundSelector();
    const roundMatches = getMatchesByRound(_currentRound);

    let matchCardsHtml = "";
    if (roundMatches.length === 0) {
      matchCardsHtml = '<p class="text-muted text-center mt-2">No matches found for this round.</p>';
    } else {
      matchCardsHtml = roundMatches.map(match => {
        const isFinished = match.status === "finished";
        const isLive = match.status === "live";
        const isWild = match.is_double_points === true || match.is_double_points === "true";

        const predictions = _data.matchPredictions.filter(mp => mp.match_id === match.id);
        const predictionsHtml = predictions.map(pred => {
          const participant = _data.participants.find(p => p.id === pred.participant_id);
          const pts = pred.points_earned;
          const ptsClass = pts >= 3 ? "text-green" : pts >= 1 ? "text-gold" : "text-muted";
          return `
            <div class="prediction-row">
              <span class="prediction-name">${escapeHtml(participant ? participant.name : pred.participant_id)}</span>
              <span class="prediction-score">${pred.predicted_home ?? "?"} - ${pred.predicted_away ?? "?"}</span>
              ${isFinished ? `<span class="score-pill ${ptsClass}">${pts ?? 0} pts</span>` : ""}
            </div>
          `;
        }).join("");

        const statusClass = isLive ? "match-card--live" : isFinished ? "match-card--finished" : "";
        const wildClass = isWild ? "match-card--wild" : "";

        return `
          <div class="card match-card ${statusClass} ${wildClass} fade-in">
            ${isWild ? '<span class="badge badge--wild">🔥 Partido Salvaje ×2</span>' : ""}
            <div class="match-card__teams">
              <span class="team-name">${escapeHtml(match.home_team || "TBD")}</span>
              <span class="match-score">
                ${isFinished || isLive ? `${match.home_score} - ${match.away_score}` : formatTime(match.kickoff_utc)}
              </span>
              <span class="team-name">${escapeHtml(match.away_team || "TBD")}</span>
            </div>
            <div class="match-card__status">
              ${isFinished ? '<span class="badge badge--resolved">Finalizado</span>' : ""}
              ${isLive ? '<span class="badge badge--open">🔴 En directo</span>' : ""}
              ${!isFinished && !isLive ? '<span class="badge badge--closed">Programado</span>' : ""}
            </div>
            ${predictions.length > 0 ? `
              <div class="match-card__predictions">
                <h4>Predicciones</h4>
                ${predictionsHtml}
              </div>
            ` : ""}
          </div>
        `;
      }).join("");
    }

    container.innerHTML = `
      <h1 class="page-title">⚽ Predicciones de Partidos</h1>
      ${roundSelector}
      <div class="matches-grid">${matchCardsHtml}</div>
    `;

    attachRoundListeners();
  }

  // ---------------------------------------------------------------------------
  // View: Scorer & Goalkeeper (goleador-portero.html)
  // ---------------------------------------------------------------------------

  function renderScorerGoalkeeper() {
    const container = $("#app-content");
    if (!container) return;

    const roundSelector = buildRoundSelector();
    const roundScorers = _data.scorerPicks.filter(sp => sp.round_key === _currentRound);
    const roundGKs = _data.goalkeeperPicks.filter(gp => gp.round_key === _currentRound);

    const buildPicksTable = (picks, type) => {
      if (picks.length === 0) return `<p class="text-muted">No picks for this round yet.</p>`;

      return `
        <div class="table-container">
          <table class="picks-table">
            <thead>
              <tr>
                <th>Participante</th>
                <th>${type === "scorer" ? "Goleador" : "Portero"}</th>
                <th>${type === "scorer" ? "Goles" : "Puntos"}</th>
                <th>Pts</th>
              </tr>
            </thead>
            <tbody>
              ${picks.map(pick => {
                const participant = _data.participants.find(p => p.id === pick.participant_id);
                const player = _data.players.find(pl => pl.id === pick.player_id);
                const pts = pick.points_earned ?? 0;
                const ptsClass = pts > 0 ? "text-green" : pts < 0 ? "text-red" : "text-muted";
                return `
                  <tr>
                    <td>${escapeHtml(participant ? participant.name : pick.participant_id)}</td>
                    <td>${escapeHtml(player ? `${player.name} (${player.team})` : pick.player_id)}</td>
                    <td>${type === "scorer" ? (pick.goals_scored ?? "-") : "-"}</td>
                    <td><span class="score-pill ${ptsClass}">${pts}</span></td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      `;
    };

    container.innerHTML = `
      <h1 class="page-title">🎯 Goleador y Portero</h1>
      ${roundSelector}
      <div class="card fade-in mt-2">
        <h2 class="card-title">🎯 Goleador de la Jornada</h2>
        <p class="text-muted">+1 pt por cada gol marcado por tu jugador. Los goles en propia puerta y en tanda de penaltis no cuentan.</p>
        ${buildPicksTable(roundScorers, "scorer")}
      </div>
      <div class="card fade-in mt-2">
        <h2 class="card-title">🧤 Portero de la Jornada</h2>
        <p class="text-muted">0 goles → +2 pts | 1 gol → +1 pt | 2+ goles → puede ser negativo. Penaltis en tanda no cuentan.</p>
        ${buildPicksTable(roundGKs, "goalkeeper")}
      </div>
    `;

    attachRoundListeners();
  }

  // ---------------------------------------------------------------------------
  // View: Special Events (eventos.html)
  // ---------------------------------------------------------------------------

  function renderSpecialEvents() {
    const container = $("#app-content");
    if (!container) return;

    const eventsEmojis = { E1: "⚽", E2: "🔥", E3: "🧤", E4: "😈", E5: "🎩", E6: "😬" };

    const eventsHtml = _data.specialEvents.map(ev => {
      const picks = _data.specialEventPicks.filter(sp => sp.event_id === ev.id);
      const statusBadge = ev.is_resolved
        ? '<span class="badge badge--resolved">✅ Resuelto</span>'
        : (ev.is_active === true || ev.is_active === "true")
          ? '<span class="badge badge--open">🟢 Abierto</span>'
          : '<span class="badge badge--closed">🟡 Cerrado</span>';

      const picksHtml = picks.length > 0
        ? picks.map(pick => {
          const participant = _data.participants.find(p => p.id === pick.participant_id);
          const pts = pick.points_earned;
          const ptsClass = pts > 0 ? "text-green" : "text-muted";
          return `
              <div class="event-pick-row">
                <span>${escapeHtml(participant ? participant.name : pick.participant_id)}</span>
                <span class="text-muted">${escapeHtml(String(pick.pick_value || "-"))}</span>
                ${ev.is_resolved ? `<span class="score-pill ${ptsClass}">${pts ?? 0} pts</span>` : ""}
              </div>
            `;
        }).join("")
        : '<p class="text-muted">No picks yet.</p>';

      return `
        <div class="card event-card fade-in">
          <div class="event-card__header">
            <span class="event-emoji">${eventsEmojis[ev.id] || "🎯"}</span>
            <div>
              <h3>${escapeHtml(ev.id)} — ${escapeHtml(ev.name)}</h3>
              ${statusBadge}
            </div>
          </div>
          <p class="event-description">${escapeHtml(ev.description)}</p>
          ${ev.deadline_utc ? `<p class="text-muted">⏰ Deadline: ${formatDateTime(ev.deadline_utc)}</p>` : ""}
          ${ev.is_resolved && ev.result_description ? `<p class="text-gold">📋 Resultado: ${escapeHtml(ev.result_description)}</p>` : ""}
          <div class="event-card__picks">
            <h4>Picks</h4>
            ${picksHtml}
          </div>
        </div>
      `;
    }).join("");

    container.innerHTML = `
      <h1 class="page-title">🌟 Eventos Especiales</h1>
      <p class="text-muted mb-2">Apuestas únicas que añaden emoción al torneo. Cada evento se abre y cierra en momentos concretos.</p>
      <div class="events-grid">${eventsHtml}</div>
    `;
  }

  // ---------------------------------------------------------------------------
  // View: Admin Panel (admin.html)
  // ---------------------------------------------------------------------------

  function renderAdmin() {
    const container = $("#app-content");
    if (!container) return;

    // Check password
    if (!sessionStorage.getItem("admin_auth")) {
      container.innerHTML = `
        <div class="admin-login fade-in">
          <div class="card">
            <h2 class="card-title">🔒 Panel de Administración</h2>
            <p class="text-muted">Introduce la contraseña para acceder.</p>
            <div class="form-group">
              <input type="password" id="admin-password" class="form-input" placeholder="Contraseña">
            </div>
            <button id="admin-login-btn" class="btn btn--primary">Acceder</button>
            <p id="admin-error" class="text-red mt-1 hidden"></p>
          </div>
        </div>
      `;
      const btn = $("#admin-login-btn");
      const input = $("#admin-password");
      const error = $("#admin-error");

      const tryLogin = () => {
        if (input.value === CONFIG.adminPassword) {
          sessionStorage.setItem("admin_auth", "true");
          renderAdmin();
        } else {
          error.textContent = "Contraseña incorrecta.";
          error.classList.remove("hidden");
        }
      };
      btn.addEventListener("click", tryLogin);
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") tryLogin(); });
      return;
    }

    // Admin panel content
    container.innerHTML = `
      <h1 class="page-title">🔧 Panel de Administración</h1>

      <div class="card fade-in mt-2">
        <h2 class="card-title">📊 Google Sheets</h2>
        <p class="text-muted">Edita los datos directamente en Google Sheets. Los cambios se reflejan automáticamente al recargar la app.</p>
        <div class="admin-links">
          ${Object.entries(CONFIG.googleSheets).map(([key, url]) => `
            <a href="${url.replace('/gviz/tq?tqx=out:csv&sheet=', '/edit#gid=')}" target="_blank" class="btn btn--ghost">
              📄 ${key}
            </a>
          `).join("")}
        </div>
      </div>

      <div class="card fade-in mt-2">
        <h2 class="card-title">👥 Participantes</h2>
        <div class="table-container">
          <table class="leaderboard-table">
            <thead>
              <tr><th>ID</th><th>Name</th><th>Paid</th></tr>
            </thead>
            <tbody>
              ${_data.participants.map(p => `
                <tr>
                  <td>${escapeHtml(p.id)}</td>
                  <td>${escapeHtml(p.name)}</td>
                  <td>${Scoring.parseBool(p.paid) ? '<span class="badge badge--paid">✓</span>' : '<span class="badge badge--unpaid">✗</span>'}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card fade-in mt-2">
        <h2 class="card-title">⚽ Partidos</h2>
        <p class="text-muted">${_data.matches.length} matches loaded. ${_data.matches.filter(m => m.status === "finished").length} finished.</p>
        <p class="text-muted">Wild Match (E2): ${_data.matches.find(m => m.is_double_points === true || m.is_double_points === "true")?.id ?? "Not set"}</p>
      </div>

      <div class="card fade-in mt-2">
        <h2 class="card-title">🌟 Eventos Especiales</h2>
        <div class="table-container">
          <table class="picks-table">
            <thead>
              <tr><th>ID</th><th>Name</th><th>Active</th><th>Resolved</th></tr>
            </thead>
            <tbody>
              ${_data.specialEvents.map(ev => `
                <tr>
                  <td>${escapeHtml(ev.id)}</td>
                  <td>${escapeHtml(ev.name)}</td>
                  <td>${ev.is_active ? "🟢" : "⚪"}</td>
                  <td>${ev.is_resolved ? "✅" : "⏳"}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card fade-in mt-2">
        <button id="admin-logout-btn" class="btn btn--danger">🚪 Cerrar sesión admin</button>
      </div>
    `;

    $("#admin-logout-btn")?.addEventListener("click", () => {
      sessionStorage.removeItem("admin_auth");
      renderAdmin();
    });
  }

  // ---------------------------------------------------------------------------
  // Round Selector
  // ---------------------------------------------------------------------------

  function buildRoundSelector() {
    const rounds = Object.entries(CONFIG.roundLabels);
    return `
      <div class="round-selector">
        ${rounds.map(([key, label]) => `
          <button class="round-selector__item ${key === _currentRound ? "round-selector__item--active" : ""}" data-round="${key}">
            ${label}
          </button>
        `).join("")}
      </div>
    `;
  }

  function attachRoundListeners() {
    $$(".round-selector__item").forEach(btn => {
      btn.addEventListener("click", () => {
        _currentRound = btn.dataset.round;
        const page = detectCurrentPage();
        if (page === "partidos") renderMatches();
        else if (page === "goleador-portero") renderScorerGoalkeeper();
      });
    });
  }

  function getMatchesByRound(roundKey) {
    if (roundKey.startsWith("group_md")) {
      const md = parseInt(roundKey.replace("group_md", ""), 10);
      return _data.matches.filter(m => m.phase === "group" && (m.matchday === md || m.matchday === String(md)));
    }
    return _data.matches.filter(m => m.phase === roundKey);
  }

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  function detectCurrentPage() {
    const path = window.location.pathname.toLowerCase();
    if (path.includes("partidos")) return "partidos";
    if (path.includes("goleador") || path.includes("portero")) return "goleador-portero";
    if (path.includes("eventos")) return "eventos";
    if (path.includes("admin")) return "admin";
    return "index";
  }

  function setActiveNav() {
    const page = detectCurrentPage();
    $$(".navbar__link").forEach(link => {
      const href = link.getAttribute("href").toLowerCase();
      if (
        (page === "index" && (href.includes("index") || href === "./" || href === "/")) ||
        (page !== "index" && href.includes(page))
      ) {
        link.classList.add("navbar__link--active");
      } else {
        link.classList.remove("navbar__link--active");
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

  function escapeHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = String(str);
    return div.innerHTML;
  }

  function formatTime(utcString) {
    if (!utcString) return "--:--";
    try {
      const d = new Date(utcString);
      return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    } catch { return "--:--"; }
  }

  function formatDateTime(utcString) {
    if (!utcString) return "-";
    try {
      const d = new Date(utcString);
      return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch { return "-"; }
  }

  // ---------------------------------------------------------------------------
  // Mobile Menu Toggle
  // ---------------------------------------------------------------------------

  function initMobileMenu() {
    const toggle = $(".navbar__toggle");
    const menu = $(".navbar__menu");
    if (toggle && menu) {
      toggle.addEventListener("click", () => {
        menu.classList.toggle("navbar__menu--open");
        toggle.classList.toggle("navbar__toggle--active");
      });
      // Close menu on link click
      $$(".navbar__link").forEach(link => {
        link.addEventListener("click", () => {
          menu.classList.remove("navbar__menu--open");
          toggle.classList.remove("navbar__toggle--active");
        });
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------

  async function init() {
    setActiveNav();
    initMobileMenu();

    // Cargar y arrancar la música ambientación del mundial
    const musicScript = document.createElement("script");
    musicScript.src = "music.js";
    musicScript.onload = () => {
      if (typeof PorraMusic !== "undefined") {
        PorraMusic.init();
      }
    };
    document.head.appendChild(musicScript);

    // Check if Google Sheets URLs are configured
    const hasUrls = Object.values(CONFIG.googleSheets).some(url => !url.startsWith("URL_CSV"));

    if (hasUrls) {
      await loadAllData();
    } else {
      console.info("Using demo data. Configure Google Sheets URLs in config.js for live data.");
      loadDemoData();
    }

    const page = detectCurrentPage();
    switch (page) {
      case "partidos":
        renderMatches();
        break;
      case "goleador-portero":
        renderScorerGoalkeeper();
        break;
      case "eventos":
        renderSpecialEvents();
        break;
      case "admin":
        renderAdmin();
        break;
      default:
        renderLeaderboard();
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  return { init, loadAllData, renderLeaderboard, renderMatches, renderScorerGoalkeeper, renderSpecialEvents, renderAdmin };
})();

// Boot
document.addEventListener("DOMContentLoaded", App.init);
