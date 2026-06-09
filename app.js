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
    specialEventPicks: [],
    predictions: []
  };

  let _loaded = false;
  let _currentRound = "group_md1";
  let _submissionsMap = {}; // name (lowercase) -> latest submission payload

  // ---------------------------------------------------------------------------
  // Borradores & Persistencia Local
  // ---------------------------------------------------------------------------

  function getActiveUser() {
    return localStorage.getItem("porra_active_user") || "";
  }

  function loadUserDraft(name) {
    if (!name) return null;
    const draftKey = `porra_draft_${name.trim().toLowerCase()}`;
    let draft = null;
    let needsSave = false;
    const local = localStorage.getItem(draftKey);
    if (local) {
      try { draft = JSON.parse(local); } catch (e) {}
    }
    
    if (!draft) {
      needsSave = true;
      // Si no hay borrador local, inicializar desde la predicción publicada
      const published = _submissionsMap[name.trim().toLowerCase()];
      if (published) {
        draft = {
          name: name,
          matchPredictions: published.matchPredictions || {},
          scorerPicks: published.scorerPicks || {},
          goalkeeperPicks: published.goalkeeperPicks || {},
          specialEventPicks: published.specialEventPicks || {}
        };
      } else {
        draft = {
          name: name,
          matchPredictions: {},
          scorerPicks: {},
          goalkeeperPicks: {},
          specialEventPicks: {}
        };
      }
    }

    // Asegurar que contenga la contraseña si está en localStorage o en participants
    const localPass = localStorage.getItem("porra_password_" + name.trim().toLowerCase());
    const participant = _data.participants.find(p => p.name.trim().toLowerCase() === name.trim().toLowerCase());
    const pass = participant ? participant.password : null;
    const finalPass = localPass || (pass && String(pass).trim() !== "" ? String(pass) : null);
    
    if (finalPass && draft.password !== finalPass) {
      draft.password = finalPass;
      needsSave = true;
    }

    if (needsSave) {
      saveUserDraft(name, draft);
    }
    return draft;
  }

  function saveUserDraft(name, draft) {
    const draftKey = `porra_draft_${name.trim().toLowerCase()}`;
    localStorage.setItem(draftKey, JSON.stringify(draft));
    updateFloatingSaveBar();
  }

  function hasUnsavedChanges(name) {
    if (!name) return false;
    const draft = loadUserDraft(name);
    const published = _submissionsMap[name.trim().toLowerCase()] || {
      matchPredictions: {},
      scorerPicks: {},
      goalkeeperPicks: {},
      specialEventPicks: {}
    };

    const isDifferent = (obj1, obj2) => {
      const keys1 = Object.keys(obj1 || {});
      const keys2 = Object.keys(obj2 || {});
      const allKeys = new Set([...keys1, ...keys2]);
      for (const key of allKeys) {
        const v1 = obj1?.[key];
        const v2 = obj2?.[key];
        if (typeof v1 === "object" && v1 !== null && typeof v2 === "object" && v2 !== null) {
          if (v1.home !== v2.home || v1.away !== v2.away) return true;
        } else if (v1 !== v2) {
          return true;
        }
      }
      return false;
    };

    return (
      isDifferent(draft.matchPredictions, published.matchPredictions) ||
      isDifferent(draft.scorerPicks, published.scorerPicks) ||
      isDifferent(draft.goalkeeperPicks, published.goalkeeperPicks) ||
      isDifferent(draft.specialEventPicks, published.specialEventPicks)
    );
  }

  function updateFloatingSaveBar() {
    const name = getActiveUser();
    let bar = document.getElementById("floating-save-bar");
    if (!name || !hasUnsavedChanges(name)) {
      if (bar) bar.classList.remove("prediction-save-bar--visible");
      document.body.classList.remove("has-save-bar");
      return;
    }

    if (!bar) {
      bar = document.createElement("div");
      bar.id = "floating-save-bar";
      bar.className = "prediction-save-bar";
      document.body.appendChild(bar);
    }

    bar.innerHTML = `
      <div class="prediction-save-bar__content">
        <span>Tienes cambios sin enviar en tus pronósticos, <strong>${escapeHtml(name)}</strong>.</span>
        <button id="btn-submit-predictions" class="btn btn--primary">🚀 Enviar Pronósticos</button>
      </div>
    `;
    bar.offsetHeight; // Force reflow
    bar.classList.add("prediction-save-bar--visible");
    document.body.classList.add("has-save-bar");

    document.getElementById("btn-submit-predictions").addEventListener("click", () => {
      confirmSubmitPrediction(name);
    });
  }

  async function confirmSubmitPrediction(name) {
    if (!CONFIG.googleForm.formId || CONFIG.googleForm.formId.startsWith("ID_DE_TU_GOOGLE_FORM")) {
      showToast("La porra no está configurada para recibir envíos (formId no configurado en config.js).", "error");
      return;
    }

    const draft = loadUserDraft(name);
    draft._submittedAt = new Date().toISOString();

    const formUrl = `https://docs.google.com/forms/d/e/${CONFIG.googleForm.formId}/formResponse`;
    const params = new URLSearchParams();
    params.append(CONFIG.googleForm.entryId, JSON.stringify(draft));

    showLoading(true);
    try {
      await fetch(formUrl, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString()
      });

      showLoading(false);
      
      // Lanzar confeti brasileño y toast de éxito
      launchBrazilianCelebration();
      showToast("¡Listo! Tus pronósticos han sido enviados. La clasificación se actualizará en unos segundos.", "success");
      
      _submissionsMap[name.trim().toLowerCase()] = JSON.parse(JSON.stringify(draft));
      
      updateFloatingSaveBar();
      handleRoute();
    } catch (e) {
      showLoading(false);
      console.error(e);
      showToast("Hubo un error al enviar. Por favor, vuelve a intentarlo.", "error");
    }
  }

  // ---------------------------------------------------------------------------
  // Procesamiento & Puntuación en Caliente
  // ---------------------------------------------------------------------------

  function processPredictions() {
    _submissionsMap = {};
    _data.matchPredictions = [];
    _data.scorerPicks = [];
    _data.goalkeeperPicks = [];
    _data.specialEventPicks = [];

    if (!_data.predictions || _data.predictions.length === 0) return;

    const sampleRow = _data.predictions[0];
    const keys = Object.keys(sampleRow);
    if (keys.length < 2) return;
    const jsonKey = keys[1];

    _data.predictions.forEach(row => {
      const rawJson = row[jsonKey];
      if (!rawJson) return;

      try {
        const payload = JSON.parse(rawJson);
        if (payload && payload.name) {
          const nameLower = payload.name.trim().toLowerCase();
          _submissionsMap[nameLower] = payload;
        }
      } catch (err) {
        console.warn("Error parsing prediction JSON:", rawJson, err);
      }
    });

    Object.values(_submissionsMap).forEach(payload => {
      const pName = payload.name;
      const participant = _data.participants.find(p => p.name.trim().toLowerCase() === pName.trim().toLowerCase());
      const participantId = participant ? participant.id : pName;

      if (payload.matchPredictions) {
        Object.entries(payload.matchPredictions).forEach(([matchId, pred]) => {
          if (pred && (pred.home !== undefined || pred.away !== undefined)) {
            _data.matchPredictions.push({
              participant_id: participantId,
              match_id: matchId,
              predicted_home: pred.home !== null && pred.home !== "" ? Number(pred.home) : null,
              predicted_away: pred.away !== null && pred.away !== "" ? Number(pred.away) : null,
              points_earned: 0
            });
          }
        });
      }

      if (payload.scorerPicks) {
        Object.entries(payload.scorerPicks).forEach(([roundKey, playerId]) => {
          if (playerId) {
            _data.scorerPicks.push({
              participant_id: participantId,
              round_key: roundKey,
              player_id: playerId,
              goals_scored: null,
              points_earned: 0
            });
          }
        });
      }

      if (payload.goalkeeperPicks) {
        Object.entries(payload.goalkeeperPicks).forEach(([roundKey, playerId]) => {
          if (playerId) {
            _data.goalkeeperPicks.push({
              participant_id: participantId,
              round_key: roundKey,
              player_id: playerId,
              points_earned: 0
            });
          }
        });
      }

      if (payload.specialEventPicks) {
        Object.entries(payload.specialEventPicks).forEach(([eventId, pickValue]) => {
          if (pickValue) {
            _data.specialEventPicks.push({
              participant_id: participantId,
              event_id: eventId,
              pick_value: pickValue,
              points_earned: 0
            });
          }
        });
      }
    });
  }

  function calculateScores() {
    _data.matchPredictions.forEach(mp => {
      const match = _data.matches.find(m => m.id === mp.match_id);
      if (match) {
        mp.points_earned = Scoring.calculateMatchPoints(
          mp.predicted_home,
          mp.predicted_away,
          match.home_score,
          match.away_score,
          match.is_double_points === true || match.is_double_points === "true" || match.is_double_points === "TRUE"
        );
      } else {
        mp.points_earned = 0;
      }
    });

    _data.scorerPicks.forEach(sp => {
      const player = _data.players.find(p => p.id === sp.player_id);
      if (player) {
        const goalsKey = `goals_${sp.round_key}`;
        const goals = player[goalsKey];
        sp.points_earned = Scoring.calculateScorerPoints(goals);
        sp.goals_scored = goals;
      } else {
        sp.points_earned = 0;
      }
    });

    _data.goalkeeperPicks.forEach(gp => {
      const player = _data.players.find(p => p.id === gp.player_id);
      if (player) {
        const concededKey = `conceded_${gp.round_key}`;
        const conceded = player[concededKey];
        gp.points_earned = Scoring.calculateGoalkeeperPoints(conceded !== null && conceded !== undefined ? [conceded] : []);
      } else {
        gp.points_earned = 0;
      }
    });

    _data.specialEventPicks.forEach(sep => {
      const ev = _data.specialEvents.find(e => e.id === sep.event_id);
      if (ev && (ev.is_resolved === true || ev.is_resolved === "true" || ev.is_resolved === "TRUE")) {
        sep.points_earned = Scoring.calculateSpecialEventPoints(sep.event_id, sep.pick_value, ev.result_description);
      } else {
        sep.points_earned = 0;
      }
    });
  }

  function getFlagEmoji(country) {
    if (!country) return "";
    const clean = country.trim().replace(/[\uFFFD]/g, 'ç').toLowerCase();
    
    const flags = {
      "algeria": "🇩🇿",
      "argentina": "🇦🇷",
      "australia": "🇦🇺",
      "austria": "🇦🇹",
      "belgium": "🇧🇪",
      "bosnia & herzegovina": "🇧🇦",
      "brazil": "🇧🇷",
      "canada": "🇨🇦",
      "cape verde": "🇨🇻",
      "colombia": "🇨🇴",
      "croatia": "🇭🇷",
      "curaçao": "🇨🇼",
      "curacao": "🇨🇼",
      "czech republic": "🇨🇿",
      "dr congo": "🇨🇩",
      "ecuador": "🇪🇨",
      "egypt": "🇪🇬",
      "england": "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
      "france": "🇫🇷",
      "germany": "🇩🇪",
      "ghana": "🇬🇭",
      "haiti": "🇭🇹",
      "iran": "🇮🇷",
      "iraq": "🇮🇶",
      "ivory coast": "🇨🇮",
      "japan": "🇯🇵",
      "jordan": "🇯🇴",
      "mexico": "🇲🇽",
      "morocco": "🇲🇦",
      "netherlands": "🇳🇱",
      "new zealand": "🇳🇿",
      "norway": "🇳🇴",
      "panama": "🇵🇦",
      "paraguay": "🇵🇾",
      "portugal": "🇵🇹",
      "qatar": "🇶🇦",
      "saudi arabia": "🇸🇦",
      "scotland": "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
      "senegal": "🇸🇳",
      "south africa": "🇿🇦",
      "south korea": "🇰🇷",
      "spain": "🇪🇸",
      "sweden": "🇸🇪",
      "switzerland": "🇨🇭",
      "tunisia": "🇹🇳",
      "turkey": "🇹🇷",
      "usa": "🇺🇸",
      "uruguay": "🇺🇾",
      "uzbekistan": "🇺🇿"
    };
    
    return flags[clean] || "⚽";
  }

  function getFlagImgHtml(country) {
    if (!country) return "";
    const clean = country.trim().replace(/[\uFFFD]/g, 'ç').toLowerCase();
    
    const flagCodes = {
      "algeria": "dz",
      "argentina": "ar",
      "australia": "au",
      "austria": "at",
      "belgium": "be",
      "bosnia & herzegovina": "ba",
      "brazil": "br",
      "canada": "ca",
      "cape verde": "cv",
      "colombia": "co",
      "croatia": "hr",
      "curaçao": "cw",
      "curacao": "cw",
      "czech republic": "cz",
      "dr congo": "cd",
      "ecuador": "ec",
      "egypt": "eg",
      "england": "gb-eng",
      "france": "fr",
      "germany": "de",
      "ghana": "gh",
      "haiti": "ht",
      "iran": "ir",
      "iraq": "iq",
      "ivory coast": "ci",
      "japan": "jp",
      "jordan": "jo",
      "mexico": "mx",
      "morocco": "ma",
      "netherlands": "nl",
      "new zealand": "nz",
      "norway": "no",
      "panama": "pa",
      "paraguay": "py",
      "portugal": "pt",
      "qatar": "qa",
      "saudi arabia": "sa",
      "scotland": "gb-sct",
      "senegal": "sn",
      "south africa": "za",
      "south korea": "kr",
      "spain": "es",
      "sweden": "se",
      "switzerland": "ch",
      "tunisia": "tn",
      "turkey": "tr",
      "usa": "us",
      "uruguay": "uy",
      "uzbekistan": "uz"
    };
    
    const code = flagCodes[clean];
    if (!code) return "⚽";
    
    return `<img src="https://flagcdn.com/w40/${code}.png" class="team-flag" alt="${escapeHtml(country)}">`;
  }

  function parseCSV(text) {
    const rows = [];
    let row = [], field = '', inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') { 
          if (text[i+1] === '"') { field += '"'; i++; } else inQuotes = false; 
        } else {
          field += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ',') {
          row.push(field);
          field = '';
        } else if (ch === '\n' || ch === '\r') {
          if (ch === '\r' && text[i+1] === '\n') i++;
          row.push(field);
          field = '';
          if (row.length > 0 && row.some(cell => cell.trim() !== "")) {
            rows.push(row);
          }
          row = [];
        } else {
          field += ch;
        }
      }
    }
    if (field || row.length) {
      row.push(field);
      if (row.length > 0 && row.some(cell => cell.trim() !== "")) {
        rows.push(row);
      }
    }

    if (rows.length === 0) return [];

    const headers = rows[0].map(h => h.trim().replace(/^"|"$/g, ''));
    const objects = [];
    
    for (let i = 1; i < rows.length; i++) {
      const obj = {};
      const currentRow = rows[i];
      headers.forEach((header, colIdx) => {
        let val = currentRow[colIdx];
        if (val === undefined) val = "";
        val = val.trim();
        
        if (val.startsWith('"') && val.endsWith('"')) {
          val = val.slice(1, -1);
        }
        
        if (val === "" || val.toLowerCase() === "null") {
          val = null;
        } else if (val.toLowerCase() === "true") {
          val = true;
        } else if (val.toLowerCase() === "false") {
          val = false;
        } else if (!isNaN(val) && val.trim() !== "" && header !== "id" && header !== "match_id" && header !== "participant_id" && header !== "player_id" && header !== "event_id") {
          val = Number(val);
        }
        
        obj[header] = val;
      });
      objects.push(obj);
    }
    
    return objects;
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
      throw err;
    }
  }

  async function loadAllData() {
    showLoading(true);
    try {
      const sheets = CONFIG.googleSheets;
      const [participants, matches, players, specialEvents, predictions] =
        await Promise.all([
          fetchSheet(sheets.participants),
          fetchSheet(sheets.matches),
          fetchSheet(sheets.players),
          fetchSheet(sheets.special_events),
          fetchSheet(sheets.predictions)
        ]);

      _data.participants = participants;
      _data.matches = matches;
      _data.players = players;
      _data.specialEvents = specialEvents;
      _data.predictions = predictions;

      processPredictions();
      calculateScores();

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
    _data.participants = [
      { id: "p01", name: "Carlos", paid: true },
      { id: "p02", name: "María", paid: true },
      { id: "p03", name: "Javi", paid: true },
      { id: "p04", name: "Laura", paid: false },
      { id: "p05", name: "Pedro", paid: true },
      { id: "p06", name: "Ana", paid: true },
      { id: "p07", name: "Diego", paid: true },
      { id: "p08", name: "Lucía", paid: false }
    ];
    _data.matches = [
      { id: "m001", phase: "group", group: "A", matchday: 1, round_label: "Jornada 1", home_team: "USA", away_team: "Morocco", kickoff_utc: "2026-06-11T18:00:00Z", home_score: 2, away_score: 1, status: "finished", is_double_points: false },
      { id: "m002", phase: "group", group: "A", matchday: 1, round_label: "Jornada 1", home_team: "Mexico", away_team: "Colombia", kickoff_utc: "2026-06-11T21:00:00Z", home_score: 1, away_score: 1, status: "finished", is_double_points: false },
      { id: "m003", phase: "group", group: "B", matchday: 1, round_label: "Jornada 1", home_team: "Spain", away_team: "Brazil", kickoff_utc: "2026-06-12T18:00:00Z", home_score: 3, away_score: 0, status: "finished", is_double_points: true },
      { id: "m004", phase: "group", group: "B", matchday: 1, round_label: "Jornada 1", home_team: "Germany", away_team: "Japan", kickoff_utc: "2026-06-12T21:00:00Z", home_score: null, away_score: null, status: "scheduled", is_double_points: false },
      { id: "m005", phase: "group", group: "A", matchday: 2, round_label: "Jornada 2", home_team: "Morocco", away_team: "Mexico", kickoff_utc: "2026-06-15T18:00:00Z", home_score: null, away_score: null, status: "scheduled", is_double_points: false },
      { id: "m006", phase: "group", group: "A", matchday: 2, round_label: "Jornada 2", home_team: "Colombia", away_team: "USA", kickoff_utc: "2026-06-15T21:00:00Z", home_score: null, away_score: null, status: "scheduled", is_double_points: false }
    ];
    _data.players = [
      { id: "pl01", name: "Mbappé", team: "France", position: "outfield", active: true, goals_group_md1: 2 },
      { id: "pl02", name: "Haaland", team: "Norway", position: "outfield", active: true, goals_group_md1: 1 },
      { id: "pl03", name: "Courtois", team: "Belgium", position: "goalkeeper", active: true, conceded_group_md1: 0 },
      { id: "pl04", name: "Ter Stegen", team: "Germany", position: "goalkeeper", active: true, conceded_group_md1: 2 }
    ];
    _data.specialEvents = [
      { id: "E1", name: "Ganador del Mundial", description: "¿Qué selección ganará el Mundial 2026?", deadline_utc: "2026-06-11T17:00:00Z", is_active: false, is_resolved: true, result_description: "Argentina" },
      { id: "E2", name: "Partido Salvaje", description: "Un partido del mundial seleccionado aleatoriamente que otorga el doble de puntos.", deadline_utc: null, is_active: false, is_resolved: true, result_description: "Partido m003: Spain vs Brazil" },
      { id: "E3", name: "El Portero Héroe", description: "¿Qué portero parará un penalti en cuartos o semis?", deadline_utc: "2026-07-04T16:00:00Z", is_active: true, is_resolved: false, result_description: null },
      { id: "E4", name: "La Maldición del Favorito", description: "¿Qué favorito será eliminado antes de semis?", deadline_utc: "2026-06-28T16:00:00Z", is_active: true, is_resolved: false, result_description: null },
      { id: "E5", name: "Hat-Trick Salvaje", description: "¿Quién hará un hat-trick en el torneo?", deadline_utc: "2026-06-11T17:00:00Z", is_active: false, is_resolved: false, result_description: null },
      { id: "E6", name: "Partido con más Goles (Eliminatorias)", description: "¿Cuántos goles se marcarán en el partido con más goles de las eliminatorias?", deadline_utc: "2026-06-27T16:00:00Z", is_active: true, is_resolved: false, result_description: null }
    ];
    
    _data.predictions = [
      {
        Timestamp: "2026-06-09 19:30:00",
        Payload: JSON.stringify({
          name: "Carlos",
          matchPredictions: { m001: { home: 2, away: 1 }, m002: { home: 2, away: 0 }, m003: { home: 3, away: 0 } },
          scorerPicks: { group_md1: "pl01" },
          goalkeeperPicks: { group_md1: "pl03" },
          specialEventPicks: { E1: "Argentina" }
        })
      },
      {
        Timestamp: "2026-06-09 19:31:00",
        Payload: JSON.stringify({
          name: "María",
          matchPredictions: { m001: { home: 1, away: 1 }, m002: { home: 1, away: 1 }, m003: { home: 1, away: 0 } },
          scorerPicks: { group_md1: "pl02" },
          goalkeeperPicks: { group_md1: "pl03" },
          specialEventPicks: { E1: "France" }
        })
      }
    ];

    processPredictions();
    calculateScores();
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

  function convertSelectToSearchable(selectEl) {
    if (!selectEl || selectEl.dataset.searchableInitialized) return;

    // Save original options
    const options = Array.from(selectEl.options).map(opt => ({
      value: opt.value,
      text: opt.textContent,
      html: opt.innerHTML
    }));

    selectEl.dataset.searchableInitialized = "true";
    selectEl.dataset.selectedValue = selectEl.value;

    // Wrap select in a container
    const wrapper = document.createElement("div");
    wrapper.className = "searchable-select-wrapper";
    selectEl.parentNode.insertBefore(wrapper, selectEl);
    wrapper.appendChild(selectEl);

    // Create search input
    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.className = "form-input searchable-select-input";
    searchInput.placeholder = "🔍 Buscar...";
    searchInput.style.marginBottom = "8px";
    wrapper.insertBefore(searchInput, selectEl);

    // Track select element changes (if user selects something)
    selectEl.addEventListener("change", () => {
      selectEl.dataset.selectedValue = selectEl.value;

      // Clear search input and restore all options
      if (searchInput.value !== "") {
        searchInput.value = "";
        const currentSelected = selectEl.value;
        selectEl.innerHTML = "";
        options.forEach(opt => {
          const optEl = document.createElement("option");
          optEl.value = opt.value;
          optEl.innerHTML = opt.html;
          if (opt.value === currentSelected) {
            optEl.selected = true;
          }
          selectEl.appendChild(optEl);
        });
      }
    });

    const cleanStr = str => str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    // Search event listener
    searchInput.addEventListener("input", (e) => {
      const query = cleanStr(e.target.value);
      const currentSelected = selectEl.dataset.selectedValue;

      selectEl.innerHTML = "";

      options.forEach(opt => {
        const isPlaceholder = opt.value === "";
        const matchesQuery = cleanStr(opt.text).includes(query);

        if (isPlaceholder || matchesQuery) {
          const optEl = document.createElement("option");
          optEl.value = opt.value;
          optEl.innerHTML = opt.html;
          if (opt.value === currentSelected) {
            optEl.selected = true;
          }
          selectEl.appendChild(optEl);
        }
      });
    });
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

  function showToast(message, type = "success") {
    // Eliminar toast anterior si existe
    $("#porra-toast")?.remove();
    
    const borderCol = type === "success" ? "var(--color-green)" : "var(--color-red)";
    const icon = type === "success" ? "🇧🇷" : "⚠️";
    
    const toast = el("div", { 
      id: "porra-toast", 
      className: "porra-toast", 
      innerHTML: `<span style="font-size:1.5rem; margin-right: 8px;">${icon}</span> <span>${message}</span>`,
      style: `
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%) translateY(100px);
        background: var(--color-surface);
        border: 2px solid ${borderCol};
        color: var(--color-text);
        padding: var(--space-4) var(--space-6);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-lg);
        z-index: 10002;
        display: flex;
        align-items: center;
        gap: 12px;
        font-weight: 700;
        font-size: var(--font-base);
        transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      `
    });
    
    document.body.appendChild(toast);
    
    // Animación de entrada
    setTimeout(() => {
      toast.style.transform = "translateX(-50%) translateY(0)";
    }, 50);
    
    // Auto-eliminar
    setTimeout(() => {
      toast.style.transform = "translateX(-50%) translateY(100px)";
      setTimeout(() => toast.remove(), 400);
    }, 5000);
  }

  function launchBrazilianCelebration() {
    if (typeof window.confetti === "undefined") return;
    const duration = 4 * 1000;
    const end = Date.now() + duration;
    const colors = ['#22c55e', '#eab308', '#ffffff'];

    (function frame() {
      window.confetti({
        particleCount: 5,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: colors
      });
      window.confetti({
        particleCount: 5,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: colors
      });

      if (Math.random() < 0.18) {
        window.confetti({
          particleCount: 1,
          spread: 360,
          startVelocity: 15,
          origin: { x: Math.random(), y: Math.random() - 0.2 },
          shapes: ['emoji'],
          shapeOptions: {
            emoji: {
              value: ['⚽', '🏆', '🇧🇷', '💚', '💛']
            }
          },
          scalar: 2
        });
      }

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    }());
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

  function isRoundOpen(roundKey) {
    const roundMatches = getMatchesByRound(roundKey);
    if (roundMatches.length === 0) return false;
    const kickoffs = roundMatches
      .map(m => m.kickoff_utc)
      .filter(Boolean)
      .map(k => new Date(k).getTime())
      .filter(t => !isNaN(t));
    if (kickoffs.length === 0) return false;
    const earliestKickoff = Math.min(...kickoffs);
    return earliestKickoff > Date.now();
  }

  function renderEventInput(ev, draftValue) {
    if (ev.id === "E1" || ev.id === "E4") {
      const teams = [...new Set(_data.players.map(p => p.team))].sort();
      return `
        <select class="form-select event-input" data-event-id="${ev.id}" style="width:100%;">
          <option value="">-- Seleccionar Selección --</option>
          ${teams.map(t => `<option value="${t}" ${t === draftValue ? "selected" : ""}>${getFlagEmoji(t)} ${escapeHtml(t)}</option>`).join("")}
        </select>
      `;
    }
    if (ev.id === "E3") {
      const gks = _data.players.filter(p => p.position === "goalkeeper").sort((a,b) => (a.name || "").localeCompare(b.name || ""));
      return `
        <select class="form-select event-input" data-event-id="${ev.id}" style="width:100%;">
          <option value="">-- Seleccionar Portero --</option>
          ${gks.map(p => `<option value="${p.id}" ${p.id === draftValue ? "selected" : ""}>${escapeHtml(p.name)} (${getFlagEmoji(p.team)} ${escapeHtml(p.team)})</option>`).join("")}
        </select>
      `;
    }
    if (ev.id === "E5") {
      const players = _data.players.filter(p => p.position === "outfield").sort((a,b) => (a.name || "").localeCompare(b.name || ""));
      return `
        <select class="form-select event-input" data-event-id="${ev.id}" style="width:100%;">
          <option value="">-- Seleccionar Jugador --</option>
          ${players.map(p => `<option value="${p.id}" ${p.id === draftValue ? "selected" : ""}>${escapeHtml(p.name)} (${getFlagEmoji(p.team)} ${escapeHtml(p.team)})</option>`).join("")}
        </select>
      `;
    }
    if (ev.id === "E6") {
      return `
        <input type="number" class="form-input event-input" data-event-id="${ev.id}" min="0" placeholder="Goles" value="${draftValue !== undefined && draftValue !== null ? draftValue : ""}" style="width:100%;">
      `;
    }
    return `<input type="text" class="form-input event-input" data-event-id="${ev.id}" placeholder="Tu apuesta" value="${draftValue || ""}" style="width:100%;">`;
  }

  function renderMatches() {
    const container = $("#app-content");
    if (!container) return;

    const roundSelector = buildRoundSelector();
    const roundMatches = getMatchesByRound(_currentRound);

    let matchCardsHtml = "";
    if (roundMatches.length === 0) {
      matchCardsHtml = '<p class="text-muted text-center mt-2">No matches found for this round.</p>';
    } else {
      const activeUser = getActiveUser();

      matchCardsHtml = roundMatches.map(match => {
        const isFinished = match.status === "finished";
        const isLive = match.status === "live";
        const isWild = match.is_double_points === true || match.is_double_points === "true" || match.is_double_points === "TRUE";

        const predictions = _data.matchPredictions.filter(mp => mp.match_id === match.id);
        const predictionsHtml = predictions.map(pred => {
          const participant = _data.participants.find(p => p.id === pred.participant_id || p.name === pred.participant_id);
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

        let userEditHtml = "";
        const matchOpen = new Date(match.kickoff_utc) > new Date();
        if (activeUser && matchOpen) {
          const draft = loadUserDraft(activeUser);
          const userPred = draft.matchPredictions[match.id] || { home: "", away: "" };
          userEditHtml = `
            <div class="user-prediction-edit" style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px dashed var(--color-border);">
              <span style="font-size:var(--font-sm); color:var(--color-green); display:block; margin-bottom:6px; font-weight:bold;">✍️ Tu Pronóstico:</span>
              <div style="display:flex; align-items:center; gap:8px;">
                <input type="number" class="prediction-input pred-input-home" data-match-id="${match.id}" min="0" placeholder="-" value="${userPred.home !== undefined && userPred.home !== null ? userPred.home : ""}">
                <span style="color:var(--color-text-secondary); font-weight:bold;">-</span>
                <input type="number" class="prediction-input pred-input-away" data-match-id="${match.id}" min="0" placeholder="-" value="${userPred.away !== undefined && userPred.away !== null ? userPred.away : ""}">
              </div>
            </div>
          `;
        }

        return `
          <div class="card match-card ${statusClass} ${wildClass} fade-in">
            ${isWild ? '<span class="badge badge--wild">🔥 Partido Salvaje ×2</span>' : ""}
            <div class="match-card__teams">
              <span class="team-name team-name--home">${escapeHtml(match.home_team || "TBD")} ${getFlagImgHtml(match.home_team)}</span>
              <span class="match-score">
                ${isFinished || isLive ? `${match.home_score} - ${match.away_score}` : formatTime(match.kickoff_utc)}
              </span>
              <span class="team-name team-name--away">${getFlagImgHtml(match.away_team)} ${escapeHtml(match.away_team || "TBD")}</span>
            </div>
            <div class="match-card__status">
              ${isFinished ? '<span class="badge badge--resolved">Finalizado</span>' : ""}
              ${isLive ? '<span class="badge badge--open">🔴 En directo</span>' : ""}
              ${!isFinished && !isLive ? '<span class="badge badge--closed">Programado</span>' : ""}
            </div>
            ${userEditHtml}
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
    attachPredictionInputListeners();
  }

  function attachPredictionInputListeners() {
    $$(".pred-input-home, .pred-input-away").forEach(input => {
      input.addEventListener("input", () => {
        const matchId = input.dataset.matchId;
        const activeUser = getActiveUser();
        if (!activeUser) return;

        const homeEl = $(`.pred-input-home[data-match-id="${matchId}"]`);
        const awayEl = $(`.pred-input-away[data-match-id="${matchId}"]`);
        
        let homeVal = homeEl.value.trim();
        let awayVal = awayEl.value.trim();

        const draft = loadUserDraft(activeUser);
        if (homeVal === "" || awayVal === "") {
          delete draft.matchPredictions[matchId];
        } else {
          draft.matchPredictions[matchId] = {
            home: parseInt(homeVal, 10),
            away: parseInt(awayVal, 10)
          };
        }
        saveUserDraft(activeUser, draft);
      });
    });
  }

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
                const participant = _data.participants.find(p => p.id === pick.participant_id || p.name === pick.participant_id);
                const player = _data.players.find(pl => pl.id === pick.player_id);
                const pts = pick.points_earned ?? 0;
                const ptsClass = pts > 0 ? "text-green" : pts < 0 ? "text-red" : "text-muted";
                return `
                  <tr>
                    <td>${escapeHtml(participant ? participant.name : pick.participant_id)}</td>
                    <td>${player ? `${escapeHtml(player.name)} (${getFlagImgHtml(player.team)} ${escapeHtml(player.team)})` : escapeHtml(pick.player_id)}</td>
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

    let userSelectionHtml = "";
    const activeUser = getActiveUser();
    const rdOpen = isRoundOpen(_currentRound);

    if (activeUser && rdOpen) {
      const draft = loadUserDraft(activeUser);
      const selectedScorerId = draft.scorerPicks[_currentRound] || "";
      const selectedGKId = draft.goalkeeperPicks[_currentRound] || "";

      const outfieldPlayers = _data.players.filter(p => p.position === "outfield" && (p.active === true || p.active === "TRUE" || p.active === "true")).sort((a,b) => (a.name || "").localeCompare(b.name || ""));
      const goalkeeperPlayers = _data.players.filter(p => p.position === "goalkeeper" && (p.active === true || p.active === "TRUE" || p.active === "true")).sort((a,b) => (a.name || "").localeCompare(b.name || ""));

      userSelectionHtml = `
        <div class="card fade-in mb-2" style="border: 1px solid var(--color-green);">
          <h2 class="card-title" style="color:var(--color-green);">✍️ Tu Selección para ${CONFIG.roundLabels[_currentRound]}</h2>
          <p class="text-muted mb-3">Selecciona tus jugadores para esta jornada antes de que empiece el primer partido.</p>
          <div style="display:flex; flex-wrap:wrap; gap:16px;">
            <div class="form-group" style="flex:1; min-width:200px;">
              <label>🎯 Goleador:</label>
              <select id="select-user-scorer" class="form-select" style="width:100%;">
                <option value="">-- Seleccionar Goleador --</option>
                ${outfieldPlayers.map(p => `<option value="${p.id}" ${p.id === selectedScorerId ? "selected" : ""}>${escapeHtml(p.name)} (${escapeHtml(p.team)})</option>`).join("")}
              </select>
            </div>
            <div class="form-group" style="flex:1; min-width:200px;">
              <label>🧤 Portero:</label>
              <select id="select-user-goalkeeper" class="form-select" style="width:100%;">
                <option value="">-- Seleccionar Portero --</option>
                ${goalkeeperPlayers.map(p => `<option value="${p.id}" ${p.id === selectedGKId ? "selected" : ""}>${escapeHtml(p.name)} (${escapeHtml(p.team)})</option>`).join("")}
              </select>
            </div>
          </div>
        </div>
      `;
    }

    container.innerHTML = `
      <h1 class="page-title">🎯 Goleador y Portero</h1>
      ${roundSelector}
      ${userSelectionHtml}
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
    attachPlayerSelectListeners();
  }

  function attachPlayerSelectListeners() {
    const activeUser = getActiveUser();
    if (!activeUser) return;

    const scorerSelect = $("#select-user-scorer");
    const gkSelect = $("#select-user-goalkeeper");

    if (scorerSelect) convertSelectToSearchable(scorerSelect);
    if (gkSelect) convertSelectToSearchable(gkSelect);

    scorerSelect?.addEventListener("change", (e) => {
      const draft = loadUserDraft(activeUser);
      if (e.target.value) {
        draft.scorerPicks[_currentRound] = e.target.value;
      } else {
        delete draft.scorerPicks[_currentRound];
      }
      saveUserDraft(activeUser, draft);
    });

    gkSelect?.addEventListener("change", (e) => {
      const draft = loadUserDraft(activeUser);
      if (e.target.value) {
        draft.goalkeeperPicks[_currentRound] = e.target.value;
      } else {
        delete draft.goalkeeperPicks[_currentRound];
      }
      saveUserDraft(activeUser, draft);
    });
  }

  function renderSpecialEvents() {
    const container = $("#app-content");
    if (!container) return;

    const eventsEmojis = { E1: "⚽", E2: "🔥", E3: "🧤", E4: "😈", E5: "🎩", E6: "😬" };
    const activeUser = getActiveUser();

    const eventsHtml = _data.specialEvents.filter(ev => ev.id !== "E2").map(ev => {
      const picks = _data.specialEventPicks.filter(sp => sp.event_id === ev.id);
      const isResolved = ev.is_resolved === true || ev.is_resolved === "true" || ev.is_resolved === "TRUE";
      const isActive = ev.is_active === true || ev.is_active === "true" || ev.is_active === "TRUE";

      const statusBadge = isResolved
        ? '<span class="badge badge--resolved">✅ Resuelto</span>'
        : isActive
          ? '<span class="badge badge--open">🟢 Abierto</span>'
          : '<span class="badge badge--closed">🟡 Cerrado</span>';

      const picksHtml = picks.length > 0
        ? picks.map(pick => {
          const participant = _data.participants.find(p => p.id === pick.participant_id || p.name === pick.participant_id);
          const pts = pick.points_earned;
          const ptsClass = pts > 0 ? "text-green" : "text-muted";
          
          let displayPick = String(pick.pick_value || "-");
          if (ev.id === "E3" || ev.id === "E5") {
            const pl = _data.players.find(p => p.id === pick.pick_value);
            if (pl) displayPick = `${pl.name} (${pl.team})`;
          }

          return `
              <div class="event-pick-row">
                <span>${escapeHtml(participant ? participant.name : pick.participant_id)}</span>
                <span class="text-muted">${escapeHtml(displayPick)}</span>
                ${isResolved ? `<span class="score-pill ${ptsClass}">${pts ?? 0} pts</span>` : ""}
              </div>
            `;
        }).join("")
        : '<p class="text-muted">No picks yet.</p>';

      let userEditHtml = "";
      if (activeUser && isActive) {
        const draft = loadUserDraft(activeUser);
        const draftVal = draft.specialEventPicks[ev.id] || "";
        userEditHtml = `
          <div class="user-event-edit" style="margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--color-border);">
            <label style="font-size:var(--font-sm); color:var(--color-green); display:block; margin-bottom:6px; font-weight:bold;">✍️ Tu Apuesta:</label>
            ${renderEventInput(ev, draftVal)}
          </div>
        `;
      }

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
          ${isResolved && ev.result_description ? `<p class="text-gold">📋 Resultado: ${escapeHtml(ev.result_description)}</p>` : ""}
          ${userEditHtml}
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

    attachEventInputListeners();
  }

  function attachEventInputListeners() {
    const activeUser = getActiveUser();
    if (!activeUser) return;

    $$(".event-input").forEach(input => {
      if (input.tagName === "SELECT") {
        convertSelectToSearchable(input);
      }

      input.addEventListener("input", () => {
        const eventId = input.dataset.eventId;
        const draft = loadUserDraft(activeUser);
        let val = input.value.trim();
        if (val) {
          draft.specialEventPicks[eventId] = val;
        } else {
          delete draft.specialEventPicks[eventId];
        }
        saveUserDraft(activeUser, draft);
      });
      // also handle select change
      if (input.tagName === "SELECT") {
        input.addEventListener("change", () => {
          const eventId = input.dataset.eventId;
          const draft = loadUserDraft(activeUser);
          let val = input.value;
          if (val) {
            draft.specialEventPicks[eventId] = val;
          } else {
            delete draft.specialEventPicks[eventId];
          }
          saveUserDraft(activeUser, draft);
        });
      }
    });
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
              ${_data.specialEvents.filter(ev => ev.id !== "E2").map(ev => `
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

  function showPasswordModal(username, isSettingNew, onConfirm, onCancel) {
    // Eliminar modal anterior si existe
    $("#password-modal-overlay")?.remove();

    const overlay = el("div", { id: "password-modal-overlay", className: "modal-overlay" });
    const content = el("div", { className: "modal-content" });

    const header = el("div", { className: "modal-header" });
    const title = el("h3", { className: "modal-title" }, isSettingNew ? "🔒 Definir Contraseña" : "🔒 Acceso Seguro");
    const closeBtn = el("button", { className: "modal-close", innerHTML: "&times;" });
    header.appendChild(title);
    header.appendChild(closeBtn);

    const body = el("div", { className: "modal-body" });
    const desc = el("p", { className: "text-muted mb-4", style: "font-size: var(--font-sm); line-height: 1.5; margin-bottom: 16px;" }, isSettingNew 
      ? `Este usuario (${escapeHtml(username)}) no tiene una contraseña configurada en el sistema. Introduce una nueva contraseña para proteger tus pronósticos:` 
      : `Introduce tu contraseña para acceder a los pronósticos de ${escapeHtml(username)}:`);
    
    const inputGroup = el("div", { className: "form-group" });
    const input = el("input", { 
      type: "password", 
      id: "modal-password-input", 
      className: "form-input", 
      placeholder: isSettingNew ? "Nueva Contraseña" : "Contraseña"
    });
    inputGroup.appendChild(input);

    const errorMsg = el("p", { id: "modal-password-error", className: "text-red mt-1 hidden" });

    const footer = el("div", { className: "modal-footer mt-4", style: "display: flex; justify-content: flex-end; gap: 12px; margin-top: 16px;" });
    const btnCancel = el("button", { className: "btn btn--secondary", id: "modal-password-btn-cancel" }, "Cancelar");
    const btnConfirm = el("button", { className: "btn btn--primary", id: "modal-password-btn-confirm" }, isSettingNew ? "Establecer" : "Entrar");
    footer.appendChild(btnCancel);
    footer.appendChild(btnConfirm);

    body.appendChild(desc);
    body.appendChild(inputGroup);
    body.appendChild(errorMsg);
    body.appendChild(footer);

    content.appendChild(header);
    content.appendChild(body);
    overlay.appendChild(content);
    document.body.appendChild(overlay);

    // Animación de entrada y foco
    setTimeout(() => {
      overlay.classList.add("modal-overlay--open");
      input.focus();
    }, 10);

    const closeModal = () => {
      overlay.classList.remove("modal-overlay--open");
      setTimeout(() => overlay.remove(), 300);
    };

    const handleConfirm = () => {
      const value = input.value.trim();
      if (isSettingNew && !value) {
        errorMsg.textContent = "La contraseña no puede estar vacía.";
        errorMsg.classList.remove("hidden");
        return;
      }
      closeModal();
      onConfirm(value);
    };

    const handleCancel = () => {
      closeModal();
      onCancel();
    };

    btnConfirm.addEventListener("click", handleConfirm);
    btnCancel.addEventListener("click", handleCancel);
    closeBtn.addEventListener("click", handleCancel);

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleConfirm();
      if (e.key === "Escape") handleCancel();
    });
  }

  function renderUserSelector() {
    const menu = $(".navbar__menu");
    if (!menu) return;

    $("#navbar-user-selector-container")?.remove();

    const container = el("div", { id: "navbar-user-selector-container", className: "navbar__user-container" });
    const select = el("select", { id: "navbar-user-selector", className: "navbar__select" });
    
    select.appendChild(el("option", { value: "" }, "👀 Ver General (Público)"));
    
    _data.participants.forEach(p => {
      const opt = el("option", { value: p.name }, p.name);
      if (p.name === getActiveUser()) {
        opt.setAttribute("selected", "selected");
      }
      select.appendChild(opt);
    });

    select.addEventListener("change", (e) => {
      const selectedUser = e.target.value;
      if (selectedUser) {
        const participant = _data.participants.find(p => p.name === selectedUser);
        const pass = participant ? participant.password : null;
        
        const hasPasswordInSheet = (pass !== null && pass !== undefined && String(pass).trim() !== "");
        const localPass = localStorage.getItem("porra_password_" + selectedUser.trim().toLowerCase());
        
        if (hasPasswordInSheet) {
          showPasswordModal(selectedUser, false, (entered) => {
            if (entered === String(pass)) {
              localStorage.setItem("porra_active_user", selectedUser);
              localStorage.setItem("porra_password_" + selectedUser.trim().toLowerCase(), entered);
              loadUserDraft(selectedUser);
              updateFloatingSaveBar();
              handleRoute();
            } else {
              showToast("Contraseña incorrecta. Acceso denegado.", "error");
              select.value = getActiveUser();
            }
          }, () => {
            select.value = getActiveUser();
          });
        } else if (localPass) {
          showPasswordModal(selectedUser, false, (entered) => {
            if (entered === localPass) {
              localStorage.setItem("porra_active_user", selectedUser);
              loadUserDraft(selectedUser);
              updateFloatingSaveBar();
              handleRoute();
            } else {
              showToast("Contraseña incorrecta. Acceso denegado.", "error");
              select.value = getActiveUser();
            }
          }, () => {
            select.value = getActiveUser();
          });
        } else {
          showPasswordModal(selectedUser, true, (newPassword) => {
            if (!newPassword.trim()) {
              showToast("La contraseña no puede estar vacía.", "error");
              select.value = getActiveUser();
              return;
            }
            localStorage.setItem("porra_password_" + selectedUser.trim().toLowerCase(), newPassword);
            localStorage.setItem("porra_active_user", selectedUser);
            
            // Forzar que el borrador contenga la contraseña y guardarlo
            const draft = loadUserDraft(selectedUser);
            draft.password = newPassword;
            saveUserDraft(selectedUser, draft);
            
            updateFloatingSaveBar();
            handleRoute();
          }, () => {
            select.value = getActiveUser();
          });
        }
      } else {
        localStorage.removeItem("porra_active_user");
        updateFloatingSaveBar();
        handleRoute();
      }
    });

    container.appendChild(el("span", { className: "navbar__user-label" }, "Usuario:"));
    container.appendChild(select);
    menu.appendChild(container);
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
      document.addEventListener("click", (e) => {
        const link = e.target.closest("a");
        if (link && menu.classList.contains("navbar__menu--open")) {
          menu.classList.remove("navbar__menu--open");
          toggle.classList.remove("navbar__toggle--active");
        }
      });
    }
  }

  function initSPA() {
    document.addEventListener("click", (e) => {
      const link = e.target.closest("a");
      if (link) {
        const href = link.getAttribute("href");
        if (href && !href.startsWith("http") && !href.startsWith("#") && !link.target && !href.includes("mailto:") && !href.includes("tel:")) {
          try {
            history.pushState({}, "", href);
            e.preventDefault();
            handleRoute();
          } catch (err) {
            console.warn("SPA navigation not supported in this environment (likely file:/// protocol). Falling back to standard navigation.", err);
          }
        }
      }
    });

    window.addEventListener("popstate", () => {
      handleRoute();
    });
  }

  function handleRoute() {
    if (!_loaded) {
      const hasUrls = Object.values(CONFIG.googleSheets).every(url => url && !url.startsWith("URL_CSV"));
      if (hasUrls) {
        return; // Preserve the error screen shown by loadAllData()
      }
    }
    setActiveNav();
    
    // Close mobile menu if open
    const menu = $(".navbar__menu");
    const toggle = $(".navbar__toggle");
    if (menu && toggle) {
      menu.classList.remove("navbar__menu--open");
      toggle.classList.remove("navbar__toggle--active");
    }

    const page = detectCurrentPage();
    
    // Show skeleton loaders to simulate a transition
    const container = $("#app-content");
    if (container) {
      container.innerHTML = `
        <div class="skeleton-loader">
          <div class="skeleton skeleton--title"></div>
          <div class="skeleton skeleton--card"></div>
        </div>
      `;
    }

    // Render corresponding view
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

  function showConfigNotice() {
    const container = $("#app-content");
    if (container) {
      container.innerHTML = `
        <div class="card fade-in" style="max-width:600px;margin:2rem auto;padding:2rem;text-align:center;">
          <span style="font-size:3.5rem;">⚙️</span>
          <h2 class="mt-2 mb-2" style="color:var(--color-gold);">Porra del Mundial — Configuración Pendiente</h2>
          <p class="text-muted mb-4" style="line-height:1.6;">
            Aún no has vinculado tu base de datos de Google Sheets. Para poner en marcha tu porra:
          </p>
          <ol style="text-align:left;margin:0 auto 2rem;max-width:480px;line-height:1.8;color:var(--color-text-secondary);">
            <li>Importa las plantillas de la carpeta <code>database_templates/</code> en un archivo de Google Sheets (una por pestaña).</li>
            <li>Publica cada pestaña como CSV y copia sus enlaces.</li>
            <li>Pega los enlaces en tu archivo <code>config.js</code> local.</li>
            <li>Despliega en GitHub Pages ¡y listo!</li>
          </ol>
          <div class="flex-center gap-4">
            <a href="https://github.com/FabioBuron/porra-mundial-2026#quick-start" target="_blank" class="btn btn--primary" style="display:inline-block;">
              Ver Guía de Configuración
            </a>
          </div>
          <p class="mt-3 text-muted" style="font-size:var(--font-xs);">
            ¿Quieres probar cómo se ve? <a href="#" id="btn-load-demo" style="text-decoration:underline;color:var(--color-green);">Cargar datos de prueba locales</a>
          </p>
        </div>
      `;

      $("#btn-load-demo")?.addEventListener("click", (e) => {
        e.preventDefault();
        loadDemoData();
        _loaded = true;
        renderUserSelector();
        updateFloatingSaveBar();
        handleRoute();
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------

  async function init() {
    if (typeof window.confetti === "undefined") {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js";
      document.head.appendChild(script);
    }

    setActiveNav();
    initMobileMenu();
    initSPA();

    const musicScript = document.createElement("script");
    musicScript.src = "music.js";
    musicScript.onload = () => {
      if (typeof PorraMusic !== "undefined") {
        PorraMusic.init();
      }
    };
    document.head.appendChild(musicScript);

    const hasUrls = Object.values(CONFIG.googleSheets).every(url => url && !url.startsWith("URL_CSV"));

    if (hasUrls) {
      await loadAllData();
      renderUserSelector();
      updateFloatingSaveBar();
      handleRoute();
    } else {
      console.info("Google Sheets URLs not configured. Showing tutorial notice.");
      showConfigNotice();
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  return { init, loadAllData, renderLeaderboard, renderMatches, renderScorerGoalkeeper, renderSpecialEvents, renderAdmin };
})();

// Boot
document.addEventListener("DOMContentLoaded", App.init);
