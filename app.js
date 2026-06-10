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
  let _leaderboardRound = "global";
  let _submissionsMap = {}; // name (lowercase) -> latest submission payload
  let _chartFocusParticipantId = null;

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
    const hasForm = CONFIG.googleForm && CONFIG.googleForm.formId && !CONFIG.googleForm.formId.startsWith("ID_DE_TU_GOOGLE_FORM");
    const hasScript = CONFIG.appsScriptUrl && !CONFIG.appsScriptUrl.startsWith("URL_DE_TU_APPS_SCRIPT");

    if (!hasForm && !hasScript) {
      showToast("La porra no está configurada para recibir envíos (falta configurar Google Form o Apps Script en config.js).", "error");
      return;
    }

    const draft = loadUserDraft(name);
    draft._submittedAt = new Date().toISOString();

    // --- Defensa en profundidad: filtrar jornadas y eventos ya cerrados ---
    const ignoredRounds = [];
    const ignoredEvents = [];
    const now = Date.now();

    // Filtrar matchPredictions: solo matches cuyo kickoff aún no ha pasado
    if (draft.matchPredictions) {
      const filteredMatchPredictions = {};
      Object.entries(draft.matchPredictions).forEach(([matchId, pred]) => {
        const match = _data.matches.find(m => m.id === matchId);
        if (match && new Date(match.kickoff_utc).getTime() > now) {
          filteredMatchPredictions[matchId] = pred;
        } else if (match) {
          // Inferir la jornada para el toast
          const rKey = match.phase === "group" ? "group_md" + match.matchday : match.phase;
          if (rKey && !ignoredRounds.includes(CONFIG.roundLabels[rKey] || rKey)) {
            ignoredRounds.push(CONFIG.roundLabels[rKey] || rKey);
          }
        }
      });
      draft.matchPredictions = filteredMatchPredictions;
    }

    // Filtrar scorerPicks / goalkeeperPicks: solo jornadas abiertas
    if (draft.scorerPicks) {
      const filteredScorer = {};
      Object.entries(draft.scorerPicks).forEach(([rKey, val]) => {
        if (isRoundOpen(rKey)) {
          filteredScorer[rKey] = val;
        } else if (!ignoredRounds.includes(CONFIG.roundLabels[rKey] || rKey)) {
          ignoredRounds.push(CONFIG.roundLabels[rKey] || rKey);
        }
      });
      draft.scorerPicks = filteredScorer;
    }
    if (draft.goalkeeperPicks) {
      const filteredGK = {};
      Object.entries(draft.goalkeeperPicks).forEach(([rKey, val]) => {
        if (isRoundOpen(rKey)) {
          filteredGK[rKey] = val;
        }
        // ya notificado por scorerPicks
      });
      draft.goalkeeperPicks = filteredGK;
    }

    // Filtrar specialEventPicks: solo eventos con deadline en el futuro
    if (draft.specialEventPicks) {
      const filteredEvents = {};
      Object.entries(draft.specialEventPicks).forEach(([evId, val]) => {
        const ev = _data.specialEvents.find(e => e.id === evId);
        const deadline = ev && ev.deadline_utc ? new Date(ev.deadline_utc).getTime() : null;
        const isActive = ev && (ev.is_active === true || ev.is_active === "true" || ev.is_active === "TRUE");
        const isResolved = ev && (ev.is_resolved === true || ev.is_resolved === "true" || ev.is_resolved === "TRUE");
        if (isActive && !isResolved && (!deadline || deadline > now)) {
          filteredEvents[evId] = val;
        } else if (ev) {
          ignoredEvents.push(ev.name || evId);
        }
      });
      draft.specialEventPicks = filteredEvents;
    }

    // Avisar al usuario de lo que se ignoró
    if (ignoredRounds.length > 0) {
      showToast("⚠️ Se han ignorado pronósticos de jornadas ya cerradas: " + ignoredRounds.join(", "), "error");
    }
    if (ignoredEvents.length > 0) {
      showToast("⚠️ Se han ignorado eventos ya cerrados: " + ignoredEvents.join(", "), "error");
    }

    showLoading(true);
    let success = false;
    let errorMsg = "Hubo un error al enviar. Por favor, vuelve a intentarlo.";

    // 1. Intentar enviar directamente al Web App de Apps Script (actualización inmediata)
    if (hasScript) {
      try {
        const response = await fetch(CONFIG.appsScriptUrl, {
          method: "POST",
          mode: "cors",
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify(draft)
        });
        if (response.ok) {
          const resJson = await response.json();
          if (resJson && resJson.success) {
            success = true;
          } else if (resJson && resJson.error) {
            errorMsg = `Error del servidor: ${resJson.error}`;
            // Si el error es de contraseña incorrecta, la borramos del localStorage para que pueda volver a introducirla
            if (resJson.error.toLowerCase().includes("contraseña incorrecta")) {
              localStorage.removeItem("porra_password_" + name.trim().toLowerCase());
            }
            showLoading(false);
            showToast(errorMsg, "error");
            return; // Detenemos aquí, no hacemos fallback a Google Forms
          }
        }
      } catch (err) {
        console.warn("Fallo al enviar directamente a Apps Script, intentando Google Forms...", err);
      }
    }

    // 2. Fallback al Google Form tradicional
    if (!success && hasForm) {
      try {
        const formUrl = `https://docs.google.com/forms/d/e/${CONFIG.googleForm.formId}/formResponse`;
        const params = new URLSearchParams();
        params.append(CONFIG.googleForm.entryId, JSON.stringify(draft));

        await fetch(formUrl, {
          method: "POST",
          mode: "no-cors",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: params.toString()
        });
        success = true;
      } catch (e) {
        console.error("Error en el envío al Google Form:", e);
      }
    }

    showLoading(false);

    if (success) {
      // Lanzar confeti brasileño y toast de éxito
      launchBrazilianCelebration();
      showToast("¡Listo! Tus pronósticos han sido enviados. La clasificación se actualizará en unos segundos.", "success");
      
      _submissionsMap[name.trim().toLowerCase()] = JSON.parse(JSON.stringify(draft));
      
      updateFloatingSaveBar();
      handleRoute();
    } else {
      showToast(errorMsg, "error");
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

  function _cacheKey(url) {
    return "porra_cache_" + url.replace(/[^a-z0-9]/gi, "").slice(-80);
  }

  function readSheetCache(url) {
    try {
      const raw = localStorage.getItem(_cacheKey(url));
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  async function fetchSheet(url) {
    if (!url || url.startsWith("URL_CSV")) {
      console.warn("Sheet URL not configured:", url);
      return [];
    }
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const text = await resp.text();
      const data = parseCSV(text);
      try { localStorage.setItem(_cacheKey(url), JSON.stringify(data)); } catch (e) {}
      return data;
    } catch (err) {
      console.error("Error fetching sheet:", url, err);
      // Fallback: usar la última copia cacheada si existe
      const cached = readSheetCache(url);
      if (cached) {
        console.warn("Usando datos cacheados para:", url);
        return cached;
      }
      throw err;
    }
  }

  // Carga instantánea desde caché (si hay copia de todas las hojas).
  // Devuelve true si pudo hidratar el estado desde localStorage.
  function hydrateFromCache() {
    const sheets = CONFIG.googleSheets;
    const cached = {
      participants: readSheetCache(sheets.participants),
      matches: readSheetCache(sheets.matches),
      players: readSheetCache(sheets.players),
      specialEvents: readSheetCache(sheets.special_events),
      predictions: readSheetCache(sheets.predictions)
    };
    if (Object.values(cached).some(v => !v)) return false;

    _data.participants = cached.participants;
    _data.matches = cached.matches;
    _data.players = cached.players;
    _data.specialEvents = cached.specialEvents;
    _data.predictions = cached.predictions;
    processPredictions();
    calculateScores();
    _loaded = true;
    return true;
  }

  async function loadAllData(silent) {
    if (!silent) showLoading(true);
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

      let periodico = [];
      if (sheets.periodico) {
        try {
          periodico = await fetchSheet(sheets.periodico);
        } catch (e) {
          console.warn("No se pudo cargar la hoja 'periodico':", e);
        }
      }

      _data.participants = participants;
      _data.matches = matches;
      _data.players = players;
      _data.specialEvents = specialEvents;
      _data.predictions = predictions;
      _data.periodico = periodico;
      _data.matchPredictions = [];
      _data.scorerPicks = [];
      _data.goalkeeperPicks = [];
      _data.specialEventPicks = [];

      processPredictions();
      calculateScores();

      _loaded = true;
    } catch (err) {
      console.error("Error loading data:", err);
      if (!silent) showError("Error loading data. Check your Google Sheets URLs in config.js.");
      if (silent) throw err;
    } finally {
      if (!silent) showLoading(false);
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
      { id: "m006", phase: "group", group: "A", matchday: 2, round_label: "Jornada 2", home_team: "Colombia", away_team: "USA", kickoff_utc: "2026-06-15T21:00:00Z", home_score: null, away_score: null, status: "scheduled", is_double_points: true }
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
          password: "demo",
          matchPredictions: { m001: { home: 2, away: 1 }, m002: { home: 2, away: 0 }, m003: { home: 3, away: 0 }, m004: { home: 2, away: 1 }, m005: { home: 0, away: 1 }, m006: { home: 1, away: 2 } },
          scorerPicks: { group_md1: "pl01" },
          goalkeeperPicks: { group_md1: "pl03" },
          specialEventPicks: { E1: "Argentina", E3: "pl03", E4: "Germany", E5: "Mbappé" }
        })
      },
      {
        Timestamp: "2026-06-09 19:31:00",
        Payload: JSON.stringify({
          name: "María",
          password: "demo",
          matchPredictions: { m001: { home: 1, away: 1 }, m002: { home: 1, away: 1 }, m003: { home: 1, away: 0 }, m004: { home: 1, away: 2 }, m005: { home: 1, away: 1 }, m006: { home: 2, away: 2 } },
          scorerPicks: { group_md1: "pl02" },
          goalkeeperPicks: { group_md1: "pl03" },
          specialEventPicks: { E1: "France", E3: "pl03", E4: "Spain", E5: "Haaland" }
        })
      },
      {
        Timestamp: "2026-06-09 19:32:00",
        Payload: JSON.stringify({
          name: "Javi",
          password: "demo",
          matchPredictions: { m001: { home: 2, away: 1 }, m002: { home: 1, away: 1 }, m003: { home: 2, away: 0 }, m004: { home: 2, away: 0 }, m005: { home: 1, away: 2 }, m006: { home: 1, away: 1 } },
          scorerPicks: { group_md1: "pl01" },
          goalkeeperPicks: { group_md1: "pl04" },
          specialEventPicks: { E1: "Brazil", E3: "pl04", E4: "Germany", E5: "Mbappé" }
        })
      },
      {
        Timestamp: "2026-06-09 19:33:00",
        Payload: JSON.stringify({
          name: "Laura",
          password: "demo",
          matchPredictions: { m001: { home: 3, away: 1 }, m002: { home: 0, away: 2 }, m003: { home: 3, away: 0 }, m004: { home: 1, away: 1 }, m005: { home: 1, away: 0 }, m006: { home: 0, away: 2 } },
          scorerPicks: { group_md1: "pl02" },
          goalkeeperPicks: { group_md1: "pl03" },
          specialEventPicks: { E1: "Spain", E3: "pl03", E4: "France", E5: "Haaland" }
        })
      },
      {
        Timestamp: "2026-06-09 19:34:00",
        Payload: JSON.stringify({
          name: "Pedro",
          password: "demo",
          matchPredictions: { m001: { home: 0, away: 1 }, m002: { home: 0, away: 0 }, m003: { home: 2, away: 1 }, m004: { home: 3, away: 1 }, m005: { home: 2, away: 1 }, m006: { home: 1, away: 3 } },
          scorerPicks: { group_md1: "pl01" },
          goalkeeperPicks: { group_md1: "pl04" },
          specialEventPicks: { E1: "England", E3: "pl04", E4: "Italy", E5: "Mbappé" }
        })
      },
      {
        Timestamp: "2026-06-09 19:35:00",
        Payload: JSON.stringify({
          name: "Ana",
          password: "demo",
          matchPredictions: { m001: { home: 2, away: 1 }, m002: { home: 1, away: 2 }, m003: { home: 4, away: 1 }, m004: { home: 1, away: 0 }, m005: { home: 1, away: 1 }, m006: { home: 1, away: 2 } },
          scorerPicks: { group_md1: "pl01" },
          goalkeeperPicks: { group_md1: "pl03" },
          specialEventPicks: { E1: "Germany", E3: "pl03", E4: "Portugal", E5: "Mbappé" }
        })
      },
      {
        Timestamp: "2026-06-09 19:36:00",
        Payload: JSON.stringify({
          name: "Diego",
          password: "demo",
          matchPredictions: { m001: { home: 2, away: 2 }, m002: { home: 1, away: 1 }, m003: { home: 0, away: 2 }, m004: { home: 2, away: 1 }, m005: { home: 1, away: 2 }, m006: { home: 0, away: 0 } },
          scorerPicks: { group_md1: "pl02" },
          goalkeeperPicks: { group_md1: "pl04" },
          specialEventPicks: { E1: "Portugal", E3: "pl04", E4: "Germany", E5: "Haaland" }
        })
      },
      {
        Timestamp: "2026-06-09 19:37:00",
        Payload: JSON.stringify({
          name: "Lucía",
          password: "demo",
          matchPredictions: { m001: { home: 1, away: 0 }, m002: { home: 2, away: 2 }, m003: { home: 3, away: 0 }, m004: { home: 0, away: 0 }, m005: { home: 0, away: 2 }, m006: { home: 1, away: 1 } },
          scorerPicks: { group_md1: "pl01" },
          goalkeeperPicks: { group_md1: "pl03" },
          specialEventPicks: { E1: "Argentina", E3: "pl03", E4: "Spain", E5: "Mbappé" }
        })
      }
    ];

    _data.periodico = [
      { clave: "edicion", valor: "1" },
      { clave: "fecha", valor: "Viernes, 12 de junio de 2026" },
      { clave: "titular", valor: "¡PACO COMPRA EL MUNDIAL Y CARLOS PIDE EXPLICACIONES EN EL BAR!" },
      { clave: "subtitulo", valor: "El líder de la porra se desmarca sospechosamente y Luis (farolillo rojo) afirma que 'el fútbol moderno está corrompido'." },
      { clave: "cronica", valor: "Señores, lo que vimos ayer en la primera jornada no tiene explicación científica. Paco se ha colocado líder con una flor en el culo de proporciones bíblicas. Que no nos vendan películas: aquí ha habido mano negra. Mi primo el del bar, que de esto sabe un rato largo, me lo confirmó anoche mientras me servía un carajillo templado: 'A Paco le ha soplado los resultados un cuñado que trabaja limpiando la sede de la FIFA'. Vaya tela, para habernos matao.\n\nMientras tanto, la risa de la jornada la protagoniza el figura de Luis, nuestro queridísimo farolillo rojo. Con el agua al cuello y una puntuación que parece el saldo de mi tarjeta después de pasar por la gasolinera. Es un auténtico especialista en fracasos deportivos. Ayer pronosticó un empate entre Curazao y los suplentes de la selección de solteros y casados, y casi le toca volverse a casa pidiendo aventón en la autopista. Cuidao con el figura, que sigue viendo los partidos con el palillo en la boca y dando lecciones tácticas a Carlo Ancelotti.\n\nEl grupo de WhatsApp está que echa chispas y las mofas ya rozan la ilegalidad en varios países de la Unión Europea. Por su parte, Diego va segundo de puro milagro: se le cayó el móvil al váter y al intentar rescatarlo pulsó sin querer tres resultados correctos. Esto es fútbol de verdad, señores, y no las tonterías del VAR. Paco ya está ofreciendo cubatas a cuenta del premio final, pero que no se confíe, que el Mundial es muy largo y la venganza se sirve con hielo en vaso de tubo. ¡A seguir remando!" }
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

    selectEl.dataset.searchableInitialized = "true";

    // Hide original select
    selectEl.style.display = "none";

    // Wrap select in a container
    const wrapper = document.createElement("div");
    wrapper.className = "custom-select-wrapper";
    selectEl.parentNode.insertBefore(wrapper, selectEl);
    wrapper.appendChild(selectEl);

    // Create trigger element
    const trigger = document.createElement("div");
    trigger.className = "custom-select-trigger";
    
    const updateTriggerText = () => {
      const selectedOption = selectEl.options[selectEl.selectedIndex];
      trigger.textContent = selectedOption ? selectedOption.textContent : "";
    };
    
    updateTriggerText();
    wrapper.appendChild(trigger);

    // Create dropdown container
    const dropdown = document.createElement("div");
    dropdown.className = "custom-select-dropdown";
    dropdown.style.display = "none";

    // Create search input
    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.className = "custom-select-search";
    searchInput.placeholder = "🔍 Buscar...";
    dropdown.appendChild(searchInput);

    // Create options list container
    const optionsList = document.createElement("div");
    optionsList.className = "custom-select-options-list";
    dropdown.appendChild(optionsList);

    wrapper.appendChild(dropdown);

    // Track original select change events
    selectEl.addEventListener("change", updateTriggerText);

    const cleanStr = str => str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    // Render list of filtered option elements
    const renderOptions = (filterQuery = "") => {
      optionsList.innerHTML = "";
      const normalizedQuery = cleanStr(filterQuery);

      Array.from(selectEl.options).forEach(opt => {
        const text = opt.textContent;
        const matchesQuery = cleanStr(text).includes(normalizedQuery);

        if (matchesQuery) {
          const item = document.createElement("div");
          item.className = "custom-select-option-item";
          if (opt.value === selectEl.value) {
            item.classList.add("custom-select-option-item--selected");
          }
          item.textContent = text;

          item.addEventListener("click", (e) => {
            e.stopPropagation();
            selectEl.value = opt.value;
            selectEl.dispatchEvent(new Event("change"));
            closeDropdown();
          });

          optionsList.appendChild(item);
        }
      });
    };

    const openDropdown = () => {
      // Close other open custom dropdowns
      document.querySelectorAll(".custom-select-dropdown").forEach(d => {
        if (d !== dropdown) {
          d.style.display = "none";
          d.parentNode.querySelector(".custom-select-trigger")?.classList.remove("custom-select-trigger--active");
          d.parentNode.classList.remove("custom-select-wrapper--active");
        }
      });

      dropdown.style.display = "block";
      trigger.classList.add("custom-select-trigger--active");
      wrapper.classList.add("custom-select-wrapper--active");
      searchInput.value = "";
      renderOptions("");
      
      // Auto-focus search input
      setTimeout(() => {
        searchInput.focus();
      }, 0);
    };

    const closeDropdown = () => {
      dropdown.style.display = "none";
      trigger.classList.remove("custom-select-trigger--active");
      wrapper.classList.remove("custom-select-wrapper--active");
    };

    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      const isVisible = dropdown.style.display === "block";
      if (isVisible) {
        closeDropdown();
      } else {
        openDropdown();
      }
    });

    searchInput.addEventListener("input", (e) => {
      renderOptions(e.target.value);
    });

    searchInput.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    // Close on click outside
    const handleDocumentClick = (e) => {
      if (!document.body.contains(wrapper)) {
        document.removeEventListener("click", handleDocumentClick);
        return;
      }
      if (!wrapper.contains(e.target)) {
        closeDropdown();
      }
    };
    document.addEventListener("click", handleDocumentClick);
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

  function participantOptions(selectedId) {
    return _data.participants.map(p =>
      `<option value="${escapeHtml(p.id)}" ${p.id === selectedId ? "selected" : ""}>${escapeHtml(p.name)}</option>`
    ).join("");
  }

  function firstOpenRoundKey() {
    const entries = Object.keys(CONFIG.roundLabels || {});
    return entries.find(key => isRoundOpen(key)) || entries[0] || "group_md1";
  }

  function leaderParticipant(board) {
    if (!board || board.length === 0) return null;
    return board.slice().sort((a, b) => a.position - b.position)[0];
  }

  function renderReminderControls(reminderEvents) {
    const nextReminder = reminderEvents.find(ev => new Date(ev.start).getTime() > Date.now()) || reminderEvents[0];
    const googleUrl = PorraExtras.googleCalendarUrl(nextReminder);
    return `
      <div class="hero__actions">
        <button type="button" class="btn btn--primary" id="download-ics-btn">Recordatorios</button>
        ${googleUrl ? `<a class="btn btn--ghost" href="${googleUrl}" target="_blank" rel="noopener">Proxima jornada en Google Calendar</a>` : ""}
      </div>
    `;
  }

  function downloadReminders(reminderEvents) {
    const ics = PorraExtras.buildIcs(reminderEvents);
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "porra-mundial-recordatorios.ics";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function formatParticipantName(id) {
    return (_data.participants.find(p => p.id === id) || {}).name || id || "-";
  }

  function renderComebackSimulator(board) {
    if (!_data.participants.length) return "";
    const activeUser = getActiveUser();
    const activeParticipant = activeUser ? _data.participants.find(p => p.name === activeUser) : null;
    const leader = leaderParticipant(board) || _data.participants[0];
    const defaultA = activeParticipant ? activeParticipant.id : (_data.participants[0] && _data.participants[0].id);
    const defaultB = leader && leader.id !== defaultA ? leader.id : (_data.participants[1] && _data.participants[1].id) || defaultA;
    const defaultRound = firstOpenRoundKey();
    const sim = PorraExtras.simulateScenarios(_data, defaultA, defaultB, defaultRound);
    const status = sim.bestDiff < 0
      ? `Imposible alcanzarle esta jornada: el mejor caso te deja a ${Math.abs(sim.bestDiff)} pts.`
      : sim.worstDiff > 0
        ? "Depende de ti: incluso el peor caso te deja por delante."
        : "Hay camino: necesitas que salgan varios resultados favorables.";
    const rows = sim.matches.length
      ? sim.matches.map(item => `
          <li class="scenario-row">
            <span>${escapeHtml(item.match.home_team)} - ${escapeHtml(item.match.away_team)}</span>
            <strong>${escapeHtml(item.match.home_team)} ${item.best.home}-${item.best.away}</strong>
            <span>tu +${item.best.pointsA}, rival +${item.best.pointsB}</span>
          </li>
        `).join("")
      : '<li class="scenario-row scenario-row--empty">No hay partidos pendientes en esta jornada.</li>';

    return `
      <div class="card fade-in mt-2 insight-card" id="comeback-card">
        <div class="tool-card__header">
          <h2 class="card-title">Calculadora de remontadas</h2>
          <span class="tool-card__note">Solo modula partidos; goleadores, porteros y eventos quedan fuera.</span>
        </div>
        <div class="tool-controls">
          <label>Yo <select id="sim-a" class="form-select">${participantOptions(defaultA)}</select></label>
          <label>Rival <select id="sim-b" class="form-select">${participantOptions(defaultB)}</select></label>
          <label>Jornada <select id="sim-round" class="form-select">${Object.entries(CONFIG.roundLabels).map(([k, v]) => `<option value="${k}" ${k === defaultRound ? "selected" : ""}>${v}</option>`).join("")}</select></label>
        </div>
        <div id="sim-result" class="scenario-result">
          <div class="scenario-summary">
            <strong>${escapeHtml(formatParticipantName(defaultA))}</strong> esta a ${Math.abs(sim.currentDiff)} pts de <strong>${escapeHtml(formatParticipantName(defaultB))}</strong>.
            <span>${status}</span>
          </div>
          <div class="scenario-range" style="--worst:${Math.max(0, Math.min(100, 50 + sim.worstDiff * 4))}%;--best:${Math.max(0, Math.min(100, 50 + sim.bestDiff * 4))}%;">
            <span>Peor ${sim.worstDiff}</span><span>Mejor ${sim.bestDiff}</span>
          </div>
          <ul class="scenario-list">${rows}</ul>
          ${sim.limited ? '<p class="tool-card__note">Hay mas de 6 partidos pendientes; se han usado los 6 proximos para acotar el calculo.</p>' : ""}
        </div>
      </div>
    `;
  }

  function renderHeadToHead() {
    if (_data.participants.length < 2) return "";
    const aId = _data.participants[0].id;
    const bId = _data.participants[1].id;
    const h2h = PorraExtras.headToHead(_data, aId, bId);
    const rows = h2h.rows.slice(-8).reverse().map(row => `
      <tr>
        <td>${escapeHtml(row.match.home_team)} ${row.match.home_score}-${row.match.away_score} ${escapeHtml(row.match.away_team)}</td>
        <td>${row.predA ? `${row.predA.home}-${row.predA.away}` : "-"}</td>
        <td>${row.predB ? `${row.predB.home}-${row.predB.away}` : "-"}</td>
        <td>${row.pointsA}-${row.pointsB}</td>
        <td>${row.winner === "A" ? "A" : row.winner === "B" ? "B" : "="}</td>
      </tr>
    `).join("");

    return `
      <div class="card fade-in mt-2 insight-card" id="h2h-card">
        <div class="tool-card__header">
          <h2 class="card-title">Cara a cara</h2>
          <span class="tool-card__note">Los totales salen de la misma puntuacion que la clasificacion.</span>
        </div>
        <div class="tool-controls">
          <label>Participante A <select id="h2h-a" class="form-select">${participantOptions(aId)}</select></label>
          <label>Participante B <select id="h2h-b" class="form-select">${participantOptions(bId)}</select></label>
        </div>
        <div id="h2h-result" class="h2h-result">
          <div class="h2h-summary">
            <strong>${escapeHtml(formatParticipantName(aId))} ${h2h.winsA}-${h2h.winsB} ${escapeHtml(formatParticipantName(bId))}</strong>
            <span>Empates: ${h2h.draws}. Racha: ${h2h.streakOwner === "=" ? "sin racha" : h2h.streakOwner + " x" + h2h.streakLength}</span>
          </div>
          <div class="h2h-modules">
            <span>M1 ${h2h.moduleTotals.matchA}-${h2h.moduleTotals.matchB}</span>
            <span>M2 ${h2h.moduleTotals.scorerA}-${h2h.moduleTotals.scorerB}</span>
            <span>M3 ${h2h.moduleTotals.goalkeeperA}-${h2h.moduleTotals.goalkeeperB}</span>
            <span>M4 ${h2h.moduleTotals.specialA}-${h2h.moduleTotals.specialB}</span>
          </div>
          <div class="table-container">
            <table class="picks-table">
              <thead><tr><th>Partido</th><th>A</th><th>B</th><th>Pts</th><th>Duelo</th></tr></thead>
              <tbody>${rows || '<tr><td colspan="5" class="text-muted">Aun no hay partidos terminados.</td></tr>'}</tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  function rerenderSimulator() {
    const aId = $("#sim-a")?.value;
    const bId = $("#sim-b")?.value;
    const roundKey = $("#sim-round")?.value;
    const target = $("#sim-result");
    if (!aId || !bId || !roundKey || !target) return;
    const sim = PorraExtras.simulateScenarios(_data, aId, bId, roundKey);
    const status = sim.bestDiff < 0
      ? `Imposible alcanzarle esta jornada: el mejor caso te deja a ${Math.abs(sim.bestDiff)} pts.`
      : sim.worstDiff > 0
        ? "Depende de ti: incluso el peor caso te deja por delante."
        : "Hay camino: necesitas que salgan varios resultados favorables.";
    const rows = sim.matches.length
      ? sim.matches.map(item => `
          <li class="scenario-row">
            <span>${escapeHtml(item.match.home_team)} - ${escapeHtml(item.match.away_team)}</span>
            <strong>${escapeHtml(item.match.home_team)} ${item.best.home}-${item.best.away}</strong>
            <span>tu +${item.best.pointsA}, rival +${item.best.pointsB}</span>
          </li>
        `).join("")
      : '<li class="scenario-row scenario-row--empty">No hay partidos pendientes en esta jornada.</li>';
    target.innerHTML = `
      <div class="scenario-summary">
        <strong>${escapeHtml(formatParticipantName(aId))}</strong> esta a ${Math.abs(sim.currentDiff)} pts de <strong>${escapeHtml(formatParticipantName(bId))}</strong>.
        <span>${status}</span>
      </div>
      <div class="scenario-range" style="--worst:${Math.max(0, Math.min(100, 50 + sim.worstDiff * 4))}%;--best:${Math.max(0, Math.min(100, 50 + sim.bestDiff * 4))}%;">
        <span>Peor ${sim.worstDiff}</span><span>Mejor ${sim.bestDiff}</span>
      </div>
      <ul class="scenario-list">${rows}</ul>
      ${sim.limited ? '<p class="tool-card__note">Hay mas de 6 partidos pendientes; se han usado los 6 proximos para acotar el calculo.</p>' : ""}
    `;
  }

  function rerenderHeadToHead() {
    const aId = $("#h2h-a")?.value;
    const bId = $("#h2h-b")?.value;
    const target = $("#h2h-result");
    if (!aId || !bId || !target) return;
    const h2h = PorraExtras.headToHead(_data, aId, bId);
    const rows = h2h.rows.slice(-8).reverse().map(row => `
      <tr>
        <td>${escapeHtml(row.match.home_team)} ${row.match.home_score}-${row.match.away_score} ${escapeHtml(row.match.away_team)}</td>
        <td>${row.predA ? `${row.predA.home}-${row.predA.away}` : "-"}</td>
        <td>${row.predB ? `${row.predB.home}-${row.predB.away}` : "-"}</td>
        <td>${row.pointsA}-${row.pointsB}</td>
        <td>${row.winner === "A" ? "A" : row.winner === "B" ? "B" : "="}</td>
      </tr>
    `).join("");
    target.innerHTML = `
      <div class="h2h-summary">
        <strong>${escapeHtml(formatParticipantName(aId))} ${h2h.winsA}-${h2h.winsB} ${escapeHtml(formatParticipantName(bId))}</strong>
        <span>Empates: ${h2h.draws}. Racha: ${h2h.streakOwner === "=" ? "sin racha" : h2h.streakOwner + " x" + h2h.streakLength}</span>
      </div>
      <div class="h2h-modules">
        <span>M1 ${h2h.moduleTotals.matchA}-${h2h.moduleTotals.matchB}</span>
        <span>M2 ${h2h.moduleTotals.scorerA}-${h2h.moduleTotals.scorerB}</span>
        <span>M3 ${h2h.moduleTotals.goalkeeperA}-${h2h.moduleTotals.goalkeeperB}</span>
        <span>M4 ${h2h.moduleTotals.specialA}-${h2h.moduleTotals.specialB}</span>
      </div>
      <div class="table-container">
        <table class="picks-table">
          <thead><tr><th>Partido</th><th>A</th><th>B</th><th>Pts</th><th>Duelo</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="5" class="text-muted">Aun no hay partidos terminados.</td></tr>'}</tbody>
        </table>
      </div>
    `;
  }

  function attachLeaderboardTools(reminderEvents) {
    $("#download-ics-btn")?.addEventListener("click", () => downloadReminders(reminderEvents));
    $$("#sim-a, #sim-b, #sim-round").forEach(elm => elm.addEventListener("change", rerenderSimulator));
    $$("#h2h-a, #h2h-b").forEach(elm => elm.addEventListener("change", rerenderHeadToHead));
    $$(".chart-legend-item").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.chartFocus;
        _chartFocusParticipantId = _chartFocusParticipantId === id ? null : id;
        const page = detectCurrentPage();
        if (page === "analisis") {
          renderAnalysis();
        } else {
          renderLeaderboard();
        }
      });
    });
  }

  // ---------------------------------------------------------------------------
  // View: Leaderboard (index.html)
  // ---------------------------------------------------------------------------

  function buildLeaderboardRoundSelector() {
    const rounds = Object.entries(CONFIG.roundLabels);
    return `
      <div class="round-selector leaderboard-round-selector" style="margin-bottom: var(--space-4); display: flex; overflow-x: auto; gap: var(--space-2); padding-bottom: var(--space-2);">
        <button class="round-selector__item leaderboard-round-btn ${_leaderboardRound === "global" ? "round-selector__item--active" : ""}" data-round="global" style="flex-shrink: 0;">
          General
        </button>
        ${rounds.map(([key, label]) => `
          <button class="round-selector__item leaderboard-round-btn ${key === _leaderboardRound ? "round-selector__item--active" : ""}" data-round="${key}" style="flex-shrink: 0;">
            ${label}
          </button>
        `).join("")}
      </div>
    `;
  }

  function renderLeaderboard() {
    const container = $("#app-content");
    if (!container) return;

    let matchPreds = _data.matchPredictions;
    let scorerPicks = _data.scorerPicks;
    let gkPicks = _data.goalkeeperPicks;
    let specialPicks = _data.specialEventPicks;

    if (_leaderboardRound !== "global") {
      const roundMatches = getMatchesByRound(_leaderboardRound);
      const roundMatchIds = new Set(roundMatches.map(m => m.id));
      matchPreds = _data.matchPredictions.filter(mp => roundMatchIds.has(mp.match_id));
      scorerPicks = _data.scorerPicks.filter(sp => sp.round_key === _leaderboardRound);
      gkPicks = _data.goalkeeperPicks.filter(gp => gp.round_key === _leaderboardRound);
      specialPicks = [];
    }

    const board = Scoring.buildLeaderboard(
      _data.participants,
      matchPreds,
      scorerPicks,
      gkPicks,
      specialPicks
    );

    const posEmoji = (pos) => {
      if (pos === 1) return "🥇";
      if (pos === 2) return "🥈";
      if (pos === 3) return "🥉";
      return pos;
    };

    // --- Extras: evolución, deltas, logros, próximo partido ---
    const activeUser = getActiveUser();
    const activeParticipant = activeUser ? _data.participants.find(p => p.name === activeUser) : null;
    if (!_chartFocusParticipantId && activeParticipant) _chartFocusParticipantId = activeParticipant.id;
    const evoModel = PorraExtras.computeRoundTotals(_data);
    const deltas = PorraExtras.computePositionDeltas(evoModel);
    const achievements = PorraExtras.computeAchievements(_data);
    const statsHtml = PorraExtras.funStatsHtml(_data);
    const hasDeltas = Object.keys(deltas).length > 0;
    const lastPos = Math.max(...board.map(p => p.position));
    const someonePlayed = board.some(p => p.totalPoints !== 0);
    const reminderEvents = PorraExtras.buildReminderEvents(_data);

    const nextMatch = PorraExtras.getNextMatch(_data);
    let countdownHtml = "";
    if (nextMatch) {
      countdownHtml = `
        <div class="next-match">
          <div class="next-match__label">Próximo partido</div>
          <div class="next-match__teams">
            <span class="next-match__team">${getFlagImgHtml(nextMatch.home_team)} ${escapeHtml(nextMatch.home_team)}</span>
            <span class="next-match__vs">vs</span>
            <span class="next-match__team">${escapeHtml(nextMatch.away_team)} ${getFlagImgHtml(nextMatch.away_team)}</span>
          </div>
          <div class="next-match__countdown" id="next-match-countdown"></div>
          <div class="next-match__date">${formatMatchDate(nextMatch.kickoff_utc)}</div>
        </div>
      `;
    }

    let html = `
      <div class="hero">
        <div class="hero__eyebrow">FIFA World Cup 2026 · USA · México · Canadá</div>
        <h1>${CONFIG.appName}</h1>
        <div class="hero__meta">
          <span class="hero__chip">${CONFIG.participants} participantes</span>
          <span class="hero__chip">${CONFIG.entryFee} € de entrada</span>
          <span class="hero__chip hero__chip--prize">🏆 ${escapeHtml(CONFIG.prize)}</span>
        </div>
        ${countdownHtml}
        ${renderReminderControls(reminderEvents)}
      </div>

      <div class="leaderboard-selector-container fade-in">
        ${buildLeaderboardRoundSelector()}
      </div>

      <div class="card fade-in">
        <h2 class="card-title">${_leaderboardRound === "global" ? "Clasificación general" : `Clasificación: ${CONFIG.roundLabels[_leaderboardRound] || _leaderboardRound}`}</h2>
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
              ${board.map((p) => {
                const isLantern = someonePlayed && p.position === lastPos && lastPos > 3;
                return `
                <tr class="leaderboard-row leaderboard-row--pos-${p.position} ${(_leaderboardRound === "global" && isLantern) ? "leaderboard-row--lantern" : ""}">
                  <td class="pos-cell">
                    <span class="pos-cell__rank">${posEmoji(p.position)}</span>
                    ${(_leaderboardRound === "global" && hasDeltas) ? PorraExtras.deltaBadgeHtml(deltas[p.id]) : ""}
                  </td>
                  <td class="name-cell">
                    <span class="name-cell__inner">
                      ${PorraExtras.avatarHtml(p.name, 30)}
                      <span class="name-cell__name">${escapeHtml(p.name)}</span>
                      ${(_leaderboardRound === "global" && isLantern) ? '<span class="achievement" title="Farolillo rojo: último clasificado">🏮</span>' : ""}
                      ${_leaderboardRound === "global" ? PorraExtras.achievementsHtml(achievements[p.id]) : ""}
                    </span>
                  </td>
                  <td class="total-cell"><strong>${p.totalPoints}</strong></td>
                  <td>${p.matchPoints}</td>
                  <td>${p.scorerPoints}</td>
                  <td>${p.goalkeeperPoints}</td>
                  <td>${p.specialEventPoints}</td>
                  <td>${p.paid ? '<span class="badge badge--paid">✓ Pagado</span>' : '<span class="badge badge--unpaid">Pendiente</span>'}</td>
                </tr>
              `;
              }).join("")}
            </tbody>
          </table>
        </div>
      </div>

      ${(_leaderboardRound === "global" && statsHtml) ? `
      <div class="card fade-in mt-2">
        <h2 class="card-title">El dato</h2>
        ${statsHtml}
      </div>` : ""}

      <div class="card fade-in mt-2" style="border: 1px solid var(--color-border);">
        <h3 class="card-title" id="rules-toggle-btn" style="cursor: pointer; display: flex; justify-content: space-between; align-items: center; margin: 0; user-select: none;">
          <span>💡 Reglamento y Sistema de Puntuación</span>
          <span id="rules-arrow" style="font-size: var(--font-sm); color: var(--color-text-secondary); transition: transform 0.3s ease;">▼</span>
        </h3>
        
        <div id="rules-content" style="display: none; margin-top: var(--space-4); border-top: 1px dashed var(--color-border); padding-top: var(--space-4);">
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--space-4);">
            <div>
              <h4 style="color: var(--color-green); margin-bottom: var(--space-2); font-size: var(--font-base);">⚽ M1: Partidos</h4>
              <ul style="list-style: none; padding: 0; font-size: var(--font-sm); display: flex; flex-direction: column; gap: var(--space-1);">
                <li><strong class="text-green">+3 pts:</strong> Marcador exacto (ej. 2-1).</li>
                <li><strong class="text-green">+2 pts:</strong> Diferencia exacta (ej. 2-1 frente a 1-0).</li>
                <li><strong class="text-green">+1 pt:</strong> Signo (ganador o empate) acertado.</li>
                <li><strong class="text-gold">×2 Puntos:</strong> Si el partido es un <strong>Partido Salvaje (E2)</strong>.</li>
              </ul>
            </div>
            <div>
              <h4 style="color: var(--color-green); margin-bottom: var(--space-2); font-size: var(--font-base);">🎯 M2: Goleador</h4>
              <ul style="list-style: none; padding: 0; font-size: var(--font-sm); display: flex; flex-direction: column; gap: var(--space-1);">
                <li><strong class="text-green">+1 pt</strong> por cada gol marcado por tu jugador de campo de la jornada.</li>
                <li style="font-size: var(--font-xs); color: var(--color-text-secondary); margin-top: var(--space-1);">* Goles en propia puerta y tanda de penaltis no computan.</li>
              </ul>
            </div>
            <div>
              <h4 style="color: var(--color-green); margin-bottom: var(--space-2); font-size: var(--font-base);">🧤 M3: Portero</h4>
              <ul style="list-style: none; padding: 0; font-size: var(--font-sm); display: flex; flex-direction: column; gap: var(--space-1);">
                <li><strong class="text-green">+2 pts:</strong> Portería a cero.</li>
                <li><strong class="text-green">+1 pt:</strong> Si encaja 1 gol.</li>
                <li><strong class="text-red">Resta:</strong> <code>2 - goles_encajados</code> si recibe 2+ goles (ej. 3 goles = -1 pt).</li>
                <li style="font-size: var(--font-xs); color: var(--color-text-secondary); margin-top: var(--space-1);">* Puntuación por cada partido disputado en la jornada.</li>
              </ul>
            </div>
            <div>
              <h4 style="color: var(--color-green); margin-bottom: var(--space-2); font-size: var(--font-base);">🌟 M4: Eventos</h4>
              <ul style="list-style: none; padding: 0; font-size: var(--font-sm); display: flex; flex-direction: column; gap: var(--space-1); line-height: 1.4;">
                <li><strong>E1 (Campeón):</strong> Acertar → <strong class="text-green">+5 pts</strong>.</li>
                <li><strong>E3 (Penaltis 🧤):</strong> Acertar portero → <strong class="text-green">+4 pts</strong>.</li>
                <li><strong>E4 (Maldición):</strong> Favorito eliminado en Octavos (<strong class="text-green">+3 pts</strong>) o Cuartos (<strong class="text-green">+2 pts</strong>).</li>
                <li><strong>E5 (Hat-Trick 🎩):</strong> Acertar jugador → <strong class="text-green">+5 pts</strong>.</li>
                <li><strong>E6 (Más goles):</strong> Exacto (<strong class="text-green">+3 pts</strong>) / Diferencia de 1 (<strong class="text-green">+1 pt</strong>).</li>
              </ul>
            </div>
          </div>
          <div style="margin-top: var(--space-4); padding-top: var(--space-3); border-top: 1px dashed var(--color-border); font-size: var(--font-sm); line-height: 1.5;">
            <strong>📋 Criterios de Desempate:</strong> En caso de empate en la general: 1º Puntos en partidos (M1) → 2º Puntos acumulados de Goleador+Portero (M2+M3) → 3º Puntos en eventos (M4) → 4º Moneda al aire.
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;

    // Adjuntar los event listeners para el selector de rondas del leaderboard
    container.querySelectorAll(".leaderboard-round-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        _leaderboardRound = btn.dataset.round;
        renderLeaderboard();
      });
    });

    // Cuenta atrás del próximo partido
    if (nextMatch) {
      PorraExtras.startCountdown("next-match-countdown", nextMatch.kickoff_utc);
    }

    // Attach collapsible rules listener
    const rulesBtn = $("#rules-toggle-btn");
    const rulesContent = $("#rules-content");
    const rulesArrow = $("#rules-arrow");
    
    rulesBtn?.addEventListener("click", () => {
      const isHidden = rulesContent.style.display === "none";
      if (isHidden) {
        rulesContent.style.display = "block";
        rulesArrow.style.transform = "rotate(180deg)";
      } else {
        rulesContent.style.display = "none";
        rulesArrow.style.transform = "rotate(0deg)";
      }
    });

    attachLeaderboardTools(reminderEvents);

    const leader = leaderParticipant(board);
    if (leader && someonePlayed && _leaderboardRound === "global") {
      const lastLeader = localStorage.getItem("porra_last_leader");
      if (lastLeader && lastLeader !== leader.id) {
        launchBrazilianCelebration();
        showToast(`Nuevo lider: ${escapeHtml(leader.name)}`, "success");
      }
      localStorage.setItem("porra_last_leader", leader.id);
    }
  }

  // ---------------------------------------------------------------------------
  // View: Analysis (analisis.html)
  // ---------------------------------------------------------------------------

  function renderAnalysis() {
    const container = $("#app-content");
    if (!container) return;

    const board = Scoring.buildLeaderboard(
      _data.participants,
      _data.matchPredictions,
      _data.scorerPicks,
      _data.goalkeeperPicks,
      _data.specialEventPicks
    );

    const activeUser = getActiveUser();
    const activeParticipant = activeUser ? _data.participants.find(p => p.name === activeUser) : null;
    if (!_chartFocusParticipantId && activeParticipant) _chartFocusParticipantId = activeParticipant.id;

    const evoModel = PorraExtras.computeRoundTotals(_data);
    const chartPointsHtml = PorraExtras.evolutionChartHtml(evoModel, _chartFocusParticipantId);
    const chartPositionHtml = PorraExtras.evolutionPositionChartHtml(evoModel, _chartFocusParticipantId);
    const reminderEvents = PorraExtras.buildReminderEvents(_data);

    let html = `
      <div class="hero">
        <div class="hero__eyebrow">Análisis de la Porra</div>
        <h1>Estadísticas y Análisis</h1>
        <div class="hero__meta">
          <span class="hero__chip">Gráficas de Evolución</span>
          <span class="hero__chip">Simulador de Remontadas</span>
          <span class="hero__chip">Cara a Cara</span>
        </div>
      </div>

      ${chartPointsHtml ? `
      <div class="card fade-in">
        <h2 class="card-title">Evolución de Puntos por Jornada</h2>
        <p class="text-muted mb-3" style="font-size: var(--font-sm);">Puntos acumulados de cada participante jornada tras jornada. Pulsa en la leyenda para destacar a un jugador.</p>
        ${chartPointsHtml}
      </div>` : ""}

      ${chartPositionHtml ? `
      <div class="card fade-in mt-2">
        <h2 class="card-title">Evolución de Posiciones en la Tabla</h2>
        <p class="text-muted mb-3" style="font-size: var(--font-sm);">Posición en el ranking de cada participante por jornada (1º arriba de todo). Pulsa en la leyenda para destacar.</p>
        ${chartPositionHtml}
      </div>` : ""}

      ${renderComebackSimulator(board)}
      ${renderHeadToHead()}
    `;

    container.innerHTML = html;
    attachLeaderboardTools(reminderEvents);
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
    const roundOpen = isRoundOpen(_currentRound);

    // Banner de cuenta atrás (jornada abierta) o candado (jornada cerrada)
    let roundStatusBanner = "";
    if (roundMatches.length > 0) {
      const kickoffs = roundMatches
        .map(m => m.kickoff_utc).filter(Boolean)
        .map(k => new Date(k).getTime()).filter(t => !isNaN(t));
      const earliestKickoff = kickoffs.length > 0 ? Math.min(...kickoffs) : null;

      if (roundOpen && earliestKickoff) {
        // Jornada abierta: banner con cuenta atrás al primer partido
        const cdId = "cd-matches-" + _currentRound;
        const msTillClose = earliestKickoff - Date.now();
        const urgency = msTillClose < 3 * 3600000 ? "round-banner--red"
                      : msTillClose < 24 * 3600000 ? "round-banner--amber"
                      : "round-banner--green";
        roundStatusBanner = `
          <div class="round-banner ${urgency}">
            <span class="round-banner__icon">⏰</span>
            <span>Cierre de pronósticos en <span id="${cdId}" class="round-banner__countdown"></span></span>
          </div>
        `;
        // Arranca cuenta atrás tras render
        setTimeout(() => PorraExtras.startCountdown(cdId, new Date(earliestKickoff).toISOString()), 0);
      } else if (!roundOpen && earliestKickoff) {
        // Jornada cerrada: banner candado con fecha de inicio
        const closedSince = formatDateTime(new Date(earliestKickoff).toISOString());
        roundStatusBanner = `
          <div class="round-banner round-banner--locked">
            <span class="round-banner__icon">🔒</span>
            <span>Jornada cerrada — empezó el ${closedSince}. Los pronósticos de todos están visibles.</span>
          </div>
        `;
      }
    }

    let matchCardsHtml = "";
    if (roundMatches.length === 0) {
      matchCardsHtml = '<p class="text-muted text-center mt-2">No matches found for this round.</p>';
    } else {
      const activeUser = getActiveUser();

      matchCardsHtml = roundMatches.map(match => {
        const isFinished = match.status === "finished";
        const isLive = match.status === "live";
        const isWild = match.is_double_points === true || match.is_double_points === "true" || match.is_double_points === "TRUE";
        const matchOpen = new Date(match.kickoff_utc) > new Date();

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
        const lockClass = !matchOpen ? "match-card--locked" : "";
        const lockOverlay = !matchOpen ? `
          <div class="match-card__lock-overlay" aria-hidden="true">
            <span>🔒</span>
            <span>Pronósticos bloqueados desde ${formatDateTime(match.kickoff_utc)}</span>
          </div>
        ` : "";

        let userEditHtml = "";
        if (activeUser && matchOpen) {
          // Partido individual aún no empezado: input editable
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
        } else if (activeUser && !matchOpen) {
          // Partido cerrado: mostrar el pronóstico guardado del usuario (solo lectura)
          const submitted = _submissionsMap[activeUser.trim().toLowerCase()];
          const userPred = submitted && submitted.matchPredictions && submitted.matchPredictions[match.id];
          if (userPred) {
            userEditHtml = `
              <div class="user-prediction-edit user-prediction-edit--locked" style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px dashed var(--color-border);">
                <span style="font-size:var(--font-sm); color:var(--color-text-secondary); display:block; margin-bottom:4px;">🔒 Tu pronóstico:</span>
                <span class="text-muted" style="font-size:var(--font-sm);">${userPred.home ?? "?"} - ${userPred.away ?? "?"}</span>
              </div>
            `;
          }
        }

        return `
          <div class="card match-card ${statusClass} ${wildClass} ${lockClass} fade-in">
            ${lockOverlay}
            ${isWild ? '<span class="badge badge--wild">🔥 Partido Salvaje ×2</span>' : ""}
            <div class="match-card__date" style="text-align: center; font-size: var(--font-xs); color: var(--color-text-secondary); margin-bottom: var(--space-2); font-weight: 600; opacity: 0.85;">
              📅 ${formatMatchDate(match.kickoff_utc)} · ${formatTime(match.kickoff_utc)}
            </div>
            <div class="match-card__teams">
              <span class="team-name team-name--home">${escapeHtml(match.home_team || "TBD")} ${getFlagImgHtml(match.home_team)}</span>
              <span class="match-score">
                ${isFinished || isLive ? `${match.home_score} - ${match.away_score}` : "VS"}
              </span>
              <span class="team-name team-name--away">${getFlagImgHtml(match.away_team)} ${escapeHtml(match.away_team || "TBD")}</span>
            </div>
            <div class="match-card__status">
              ${isFinished ? '<span class="badge badge--resolved">Finalizado</span>' : ""}
              ${isLive ? '<span class="badge badge--open">🔴 En directo</span>' : ""}
              ${!isFinished && !isLive ? '<span class="badge badge--closed">Programado</span>' : ""}
            </div>
            ${userEditHtml}
            ${(!roundOpen && predictions.length > 0) || isFinished ? `
              <div class="match-card__predictions">
                <h4>Predicciones</h4>
                ${predictionsHtml}
              </div>
            ` : (roundOpen && predictions.length > 0 ? "" : "")}
          </div>
        `;
      }).join("");
    }

    container.innerHTML = `
      <h1 class="page-title">⚽ Predicciones de Partidos</h1>
      ${roundSelector}
      ${roundStatusBanner}
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
    const rdOpen = isRoundOpen(_currentRound);

    // Banner de estado de la jornada
    const roundMatches = getMatchesByRound(_currentRound);
    let roundStatusBanner = "";
    if (roundMatches.length > 0) {
      const kickoffs = roundMatches.map(m => m.kickoff_utc).filter(Boolean)
        .map(k => new Date(k).getTime()).filter(t => !isNaN(t));
      const earliestKickoff = kickoffs.length > 0 ? Math.min(...kickoffs) : null;

      if (rdOpen && earliestKickoff) {
        const cdId = "cd-sgk-" + _currentRound;
        const msTillClose = earliestKickoff - Date.now();
        const urgency = msTillClose < 3 * 3600000 ? "round-banner--red"
                      : msTillClose < 24 * 3600000 ? "round-banner--amber"
                      : "round-banner--green";
        roundStatusBanner = `
          <div class="round-banner ${urgency}">
            <span class="round-banner__icon">⏰</span>
            <span>Elige tu goleador y portero antes de <span id="${cdId}" class="round-banner__countdown"></span></span>
          </div>
        `;
        setTimeout(() => PorraExtras.startCountdown(cdId, new Date(earliestKickoff).toISOString()), 0);
      } else if (!rdOpen && earliestKickoff) {
        roundStatusBanner = `
          <div class="round-banner round-banner--locked">
            <span class="round-banner__icon">🔒</span>
            <span>Jornada cerrada — empezó el ${formatDateTime(new Date(earliestKickoff).toISOString())}. Las selecciones son públicas.</span>
          </div>
        `;
      }
    }

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

    if (activeUser && rdOpen) {
      // Jornada abierta: selects editables
      const draft = loadUserDraft(activeUser);
      const selectedScorerId = draft.scorerPicks[_currentRound] || "";
      const selectedGKId = draft.goalkeeperPicks[_currentRound] || "";

      const isActive = p => p.active !== "FALSE" && p.active !== false && p.active !== "false";
      const outfieldPlayers = _data.players.filter(p => p.position === "outfield" && isActive(p)).sort((a,b) => (a.name || "").localeCompare(b.name || ""));
      const goalkeeperPlayers = _data.players.filter(p => p.position === "goalkeeper" && isActive(p)).sort((a,b) => (a.name || "").localeCompare(b.name || ""));

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
    } else if (activeUser && !rdOpen) {
      // Jornada cerrada: mostrar selección enviada (solo lectura)
      const submitted = _submissionsMap[activeUser.trim().toLowerCase()];
      const scorerId = submitted && submitted.scorerPicks && submitted.scorerPicks[_currentRound];
      const gkId = submitted && submitted.goalkeeperPicks && submitted.goalkeeperPicks[_currentRound];
      const scorerPlayer = scorerId && _data.players.find(p => p.id === scorerId);
      const gkPlayer = gkId && _data.players.find(p => p.id === gkId);

      if (scorerPlayer || gkPlayer) {
        userSelectionHtml = `
          <div class="card fade-in mb-2 round-locked-card">
            <h2 class="card-title">🔒 Tu Selección para ${CONFIG.roundLabels[_currentRound]}</h2>
            <div style="display:flex; flex-wrap:wrap; gap:16px; opacity:0.75;">
              <div style="flex:1; min-width:180px;">
                <div class="text-muted" style="font-size:var(--font-sm); margin-bottom:4px;">🎯 Goleador</div>
                <div>${scorerPlayer ? `${escapeHtml(scorerPlayer.name)} (${escapeHtml(scorerPlayer.team)})` : '<span class="text-muted">Sin selección</span>'}</div>
              </div>
              <div style="flex:1; min-width:180px;">
                <div class="text-muted" style="font-size:var(--font-sm); margin-bottom:4px;">🧤 Portero</div>
                <div>${gkPlayer ? `${escapeHtml(gkPlayer.name)} (${escapeHtml(gkPlayer.team)})` : '<span class="text-muted">Sin selección</span>'}</div>
              </div>
            </div>
          </div>
        `;
      }
    }

    container.innerHTML = `
      <h1 class="page-title">🎯 Goleador y Portero</h1>
      ${roundSelector}
      ${roundStatusBanner}
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
    if (rdOpen) attachPlayerSelectListeners();
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
    const activeUser = getActiveUser();
    const now = Date.now();

    const eventsHtml = _data.specialEvents.filter(ev => ev.id !== "E2").map(ev => {
      const picks = _data.specialEventPicks.filter(sp => sp.event_id === ev.id);
      const isResolved = ev.is_resolved === true || ev.is_resolved === "true" || ev.is_resolved === "TRUE";
      const isActive = ev.is_active === true || ev.is_active === "true" || ev.is_active === "TRUE";

      // Calcular si está cerrado por deadline
      const deadlineTs = ev.deadline_utc ? new Date(ev.deadline_utc).getTime() : null;
      const isPastDeadline = deadlineTs && deadlineTs <= now;
      const isEditable = isActive && !isResolved && !isPastDeadline;

      // Badge de estado
      const statusBadge = isResolved
        ? '<span class="badge badge--resolved">✅ Resuelto</span>'
        : isPastDeadline
          ? '<span class="badge badge--locked">🔒 Cerrado</span>'
          : isActive
            ? '<span class="badge badge--open">🟢 Abierto</span>'
            : '<span class="badge badge--closed">🟡 Cerrado</span>';

      // Banner de cuenta atrás o candado para el evento
      let eventBanner = "";
      if (isEditable && deadlineTs) {
        const cdId = "cd-ev-" + ev.id;
        const msTillClose = deadlineTs - now;
        const urgency = msTillClose < 3 * 3600000 ? "round-banner--red"
                      : msTillClose < 24 * 3600000 ? "round-banner--amber"
                      : "round-banner--green";
        eventBanner = `
          <div class="round-banner ${urgency}" style="margin:8px 0; padding:8px 12px; font-size:var(--font-sm);">
            <span>⏰ Cierre en <span id="${cdId}" class="round-banner__countdown"></span></span>
          </div>
        `;
        setTimeout(() => PorraExtras.startCountdown(cdId, ev.deadline_utc), 0);
      } else if (isPastDeadline && !isResolved) {
        eventBanner = `
          <div class="round-banner round-banner--locked" style="margin:8px 0; padding:8px 12px; font-size:var(--font-sm);">
            <span>🔒 Cerrado el ${formatDateTime(ev.deadline_utc)}. Las apuestas son públicas.</span>
          </div>
        `;
      }

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
      if (activeUser && isEditable) {
        const draft = loadUserDraft(activeUser);
        const draftVal = draft.specialEventPicks[ev.id] || "";
        userEditHtml = `
          <div class="user-event-edit" style="margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--color-border);">
            <label style="font-size:var(--font-sm); color:var(--color-green); display:block; margin-bottom:6px; font-weight:bold;">✍️ Tu Apuesta:</label>
            ${renderEventInput(ev, draftVal)}
          </div>
        `;
      } else if (activeUser && (isPastDeadline || !isActive) && !isResolved) {
        // Evento cerrado pero no resuelto: mostrar el pick enviado (solo lectura)
        const submitted = _submissionsMap[activeUser.trim().toLowerCase()];
        const submittedVal = submitted && submitted.specialEventPicks && submitted.specialEventPicks[ev.id];
        if (submittedVal) {
          let displaySubmitted = String(submittedVal);
          if (ev.id === "E3" || ev.id === "E5") {
            const pl = _data.players.find(p => p.id === submittedVal);
            if (pl) displaySubmitted = `${pl.name} (${pl.team})`;
          }
          userEditHtml = `
            <div class="user-event-edit" style="margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--color-border);">
              <span style="font-size:var(--font-sm); color:var(--color-text-secondary); display:block; margin-bottom:4px;">🔒 Tu apuesta:</span>
              <span class="text-muted">${escapeHtml(displaySubmitted)}</span>
            </div>
          `;
        }
      }

      // Mostrar picks de todos si está cerrado/resuelto; solo el propio si está abierto
      const showAllPicks = isResolved || isPastDeadline || !isActive;

      return `
        <div class="card event-card fade-in">
          <div class="event-card__header">
            <h3>${escapeHtml(ev.id)} — ${escapeHtml(ev.name)}</h3>
            ${statusBadge}
          </div>
          <p class="event-description">${escapeHtml(ev.description)}</p>
          ${eventBanner}
          ${isResolved && ev.result_description ? `<p class="text-gold">📋 Resultado: ${escapeHtml(ev.result_description)}</p>` : ""}
          ${userEditHtml}
          ${showAllPicks ? `
            <div class="event-card__picks">
              <h4>Picks</h4>
              ${picksHtml}
            </div>
          ` : ""}
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
          sessionStorage.setItem("admin_password", input.value);
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
        <h2 class="card-title">🔄 Resultados API</h2>
        <p class="text-muted">Fuerza la actualización inmediata de resultados y goleadores vía football-data.org (requiere que Apps Script esté configurado con el token FD_TOKEN).</p>
        <div style="display:flex; gap:var(--space-2); flex-wrap:wrap; margin-top:var(--space-2);">
          <button id="admin-refresh-btn" class="btn btn--primary">🔄 Actualizar resultados ahora</button>
          <button id="admin-close-round-btn" class="btn btn--ghost">🔒 Cerrar jornada…</button>
        </div>
        <div id="admin-api-result" class="text-muted" style="margin-top:var(--space-2); font-size:var(--font-sm); min-height:1.5em;"></div>
        <div id="admin-close-round-ui" class="hidden" style="margin-top:var(--space-2); display:flex; gap:var(--space-2); align-items:center; flex-wrap:wrap;">
          <select id="admin-round-select" class="form-input" style="max-width:200px;">
            ${Object.entries(CONFIG.roundLabels).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}
          </select>
          <button id="admin-close-round-confirm" class="btn btn--primary">Cerrar esta jornada</button>
          <button id="admin-close-round-cancel" class="btn btn--ghost">Cancelar</button>
        </div>
      </div>

      <div class="card fade-in mt-2">
        <h2 class="card-title">🤖 El Diario (Gemini IA)</h2>
        <p class="text-muted">Genera la crónica satírica y cuñada de la jornada con inteligencia artificial basándote en la clasificación actual de la porra.</p>
        <div style="display:flex; gap:var(--space-2); align-items:center; flex-wrap:wrap; margin-top:var(--space-2);">
          <select id="admin-cronica-round" class="form-input" style="max-width:200px;">
            ${Object.entries(CONFIG.roundLabels).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}
          </select>
          <button id="admin-gen-cronica-btn" class="btn btn--primary">✍️ Redactar crónica con IA</button>
        </div>
        <div id="admin-cronica-result" class="text-muted" style="margin-top:var(--space-2); font-size:var(--font-sm); min-height:1.5em;"></div>
      </div>

      <div class="card fade-in mt-2">
        <button id="admin-logout-btn" class="btn btn--danger">🚪 Cerrar sesión admin</button>
      </div>
    `;

    // --- Botón actualizar resultados ---
    $("#admin-refresh-btn")?.addEventListener("click", async () => {
      const btn = $("#admin-refresh-btn");
      const result = $("#admin-api-result");
      btn.disabled = true;
      btn.textContent = "⏳ Actualizando…";
      result.textContent = "";
      try {
        const resp = await fetch(CONFIG.appsScriptUrl + "?action=refresh");
        const json = await resp.json();
        if (json.error) {
          result.textContent = "❌ Error: " + json.error;
        } else {
          result.textContent = "✅ Listo — " +
            (json.matches_updated || 0) + " partidos, " +
            (json.scorers_updated || 0) + " goleadores, " +
            (json.rounds_closed && json.rounds_closed.length > 0 ? "jornadas cerradas: " + json.rounds_closed.join(", ") : "sin jornadas cerradas") +
            " · " + new Date().toLocaleTimeString("es-ES");
        }
      } catch (e) {
        result.textContent = "❌ Error de red: " + e.message;
      } finally {
        btn.disabled = false;
        btn.textContent = "🔄 Actualizar resultados ahora";
      }
    });

    // --- Botón cerrar jornada ---
    $("#admin-close-round-btn")?.addEventListener("click", () => {
      const ui = $("#admin-close-round-ui");
      if (ui) { ui.classList.remove("hidden"); ui.style.display = "flex"; }
    });
    $("#admin-close-round-cancel")?.addEventListener("click", () => {
      const ui = $("#admin-close-round-ui");
      if (ui) { ui.classList.add("hidden"); ui.style.display = "none"; }
    });
    $("#admin-close-round-confirm")?.addEventListener("click", async () => {
      const round = $("#admin-round-select")?.value;
      if (!round) return;
      const result = $("#admin-api-result");
      result.textContent = "⏳ Cerrando jornada " + round + "…";
      try {
        const resp = await fetch(CONFIG.appsScriptUrl + "?action=closeRound&round=" + encodeURIComponent(round));
        const json = await resp.json();
        if (json.error) {
          result.textContent = "❌ Error: " + json.error;
        } else {
          result.textContent = "✅ Jornada " + round + " cerrada · " + new Date().toLocaleTimeString("es-ES");
        }
      } catch (e) {
        result.textContent = "❌ Error de red: " + e.message;
      }
      const ui = $("#admin-close-round-ui");
      if (ui) { ui.classList.add("hidden"); ui.style.display = "none"; }
    });

    $("#admin-gen-cronica-btn")?.addEventListener("click", async () => {
      const btn = $("#admin-gen-cronica-btn");
      const result = $("#admin-cronica-result");
      const round = $("#admin-cronica-round")?.value;
      if (!round) return;

      btn.disabled = true;
      btn.textContent = "⏳ Generando crónica cuñada...";
      result.textContent = "";

      try {
        const board = Scoring.buildLeaderboard(
          _data.participants,
          _data.matchPredictions,
          _data.scorerPicks,
          _data.goalkeeperPicks,
          _data.specialEventPicks
        );

        const leaderboardData = board.map(item => ({
          name: item.name,
          points: item.totalPoints
        }));

        // Calcular la clasificación SOLO de esta jornada para enviarla a Gemini
        const roundMatches = getMatchesByRound(round);
        const roundMatchIds = new Set(roundMatches.map(m => m.id));
        const roundMatchPreds = _data.matchPredictions.filter(mp => roundMatchIds.has(mp.match_id));
        const roundScorerPicks = _data.scorerPicks.filter(sp => sp.round_key === round);
        const roundGkPicks = _data.goalkeeperPicks.filter(gp => gp.round_key === round);

        const roundBoard = Scoring.buildLeaderboard(
          _data.participants,
          roundMatchPreds,
          roundScorerPicks,
          roundGkPicks,
          [] // Sin eventos especiales por jornada individual
        );

        const leaderboardJornadaData = roundBoard.map(item => ({
          name: item.name,
          points: item.totalPoints
        }));

        // Recuperar la password que se usó al hacer login
        const password = sessionStorage.getItem("admin_password") || "";

        const resp = await fetch(CONFIG.appsScriptUrl, {
          method: "POST",
          mode: "cors",
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify({
            action: "generarCronica",
            round: round,
            leaderboard: leaderboardData,
            leaderboardJornada: leaderboardJornadaData,
            password: password
          })
        });

        const json = await resp.json();
        if (json.success) {
          result.innerHTML = `<span style="color:var(--color-green)">✅ Crónica generada con éxito. ¡Recarga la app!</span>`;
        } else {
          result.textContent = "❌ Error: " + (json.error || "Fallo de comunicación.");
        }
      } catch (e) {
        result.textContent = "❌ Error de red: " + e.message;
      } finally {
        btn.disabled = false;
        btn.textContent = "✍️ Redactar crónica con IA";
      }
    });

    $("#admin-logout-btn")?.addEventListener("click", () => {
      sessionStorage.removeItem("admin_auth");
      renderAdmin();
    });
  }

  // ---------------------------------------------------------------------------
  // View: El Diario del Cuñao (periodico.html)
  // ---------------------------------------------------------------------------

  function renderPeriodico() {
    const container = $("#app-content");
    if (!container) return;

    // Transformar los datos del CSV en un objeto key-value
    const info = {};
    if (Array.isArray(_data.periodico)) {
      _data.periodico.forEach(row => {
        const key = row.clave || row.Clave;
        const val = row.valor || row.Valor;
        if (key) {
          info[String(key).trim().toLowerCase()] = val || "";
        }
      });
    }

    // Si no hay crónica o está vacía, mostramos el cartel de "Próximamente"
    if (!info.cronica || info.cronica.trim() === "") {
      container.innerHTML = `
        <div class="newspaper-paper">
          <div class="newspaper-header">
            <div class="newspaper-header__top">
              <span>Edición Especial</span>
              <span>El Diario de la Porra</span>
              <span>Precio: 1 Cubata</span>
            </div>
            <h1 class="newspaper-header__logo">EL CUÑADO DEPORTIVO</h1>
            <div class="newspaper-header__bottom">
              <span>Nº 0 — Pretemporada</span>
              <span>Edición Mundial 2026</span>
            </div>
          </div>
          
          <div class="newspaper-body">
            <div class="newspaper-coming-soon">
              <span class="newspaper-coming-soon__icon">🍷</span>
              <h2 class="newspaper-coming-soon__title">ROTATIVA CERRADA POR ALMUERZO DE REDACCIÓN</h2>
              <p class="newspaper-coming-soon__desc">
                Nuestros redactores están todos metidos en el bar de la esquina debatiendo con un palillo en la boca y no van a escribir nada hasta que termine la primera jornada. 
              </p>
              <p class="newspaper-coming-soon__subdesc">
                Vuelve cuando haya partidos finalizados y veas la clasificación moverse. Ahí es cuando empezará el verdadero festival de la mofa, la cuñadez y la ironía.
              </p>
              <div class="newspaper-coming-soon__stamp">
                PRÓXIMAMENTE<br>Edición Nº 1 tras la Jornada 1
              </div>
            </div>
          </div>
        </div>
      `;
      return;
    }

    const title = info.titular || "¡BOMBAZO EN LA PORRA!";
    const subtitle = info.subtitulo || "La clasificación echa humo y las mofas ya están aquí.";
    const date = info.fecha || new Date().toLocaleDateString("es-ES", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const edicion = info.edicion || "1";

    const parrafosHtml = info.cronica
      .split("\n")
      .filter(p => p.trim() !== "")
      .map(p => `<p class="newspaper-paragraph">${escapeHtml(p)}</p>`)
      .join("");

    let noticiasSecundarias = [];
    if (info.noticias_secundarias) {
      try {
        noticiasSecundarias = JSON.parse(info.noticias_secundarias);
      } catch (e) {
        try {
          const clean = info.noticias_secundarias.replace(/\\"/g, '"');
          noticiasSecundarias = JSON.parse(clean);
        } catch(err) {
          console.warn("No se pudieron parsear las noticias secundarias:", err);
        }
      }
    }

    if (!Array.isArray(noticiasSecundarias) || noticiasSecundarias.length === 0) {
      noticiasSecundarias = [
        {
          titular: "EL GRUPO DE WHATSAPP AL BORDE DE LA ESCISIÓN",
          resumen: "Varios participantes exigen audios del VAR tras los últimos resultados. 'A mí que no me vengan con películas', declara un participante anónimo desde la barra."
        },
        {
          titular: "EL COLISTA PROTESTA: 'HAY MANO NEGRA EN EL RECUENTO'",
          resumen: "El último de la clasificación insinúa que el líder tiene contactos en la FIFA. Se está debatiendo una moción de censura en el bar."
        }
      ];
    }

    const noticiasHtml = noticiasSecundarias.map(n => `
      <div class="newspaper-sec-news-item">
        <h4 class="newspaper-sec-news-title">${escapeHtml(n.titular)}</h4>
        <p class="newspaper-sec-news-desc">${escapeHtml(n.resumen)}</p>
      </div>
    `).join("");

    const adsPool = [
      {
        highlight: "CLUB LA FLOR DE PACO",
        desc: "El fútbol de la porra también es vida. Visita nuestro local en la Carretera Nacional, Km 124. Cubatas baratos y debate táctico con palillo gratis en barra."
      },
      {
        highlight: "¿TE CLAREA EL CARTÓN?",
        desc: "Crecepelo milagroso 'El Cuñao'. Resultados garantizados en tres jornadas o te regalamos una boina de rosca. De venta en la trastienda de la taberna."
      },
      {
        highlight: "COMPRA DE PUNTOS",
        desc: "Trato discreto. Se compran puntos de la clasificación general. Pago en cobre, baterías usadas o recambios para un Seat Ibiza del 98. Razón aquí."
      },
      {
        highlight: "GAFAS ANTI-VAR HOMOLOGADAS",
        desc: "Las únicas del mercado que borran las líneas del fuera de juego semiautomático en televisores de bar. Cristales oscuros. Garantía del fabricante."
      },
      {
        highlight: "FUTUROLOGÍA Y CARAJILLOS",
        desc: "Acierto garantizado en empates a cero y expulsiones rigurosas. Lectura del porvenir en la espuma del café de media mañana. Preguntar por Pepe."
      },
      {
        highlight: "SE ALQUILA CUÑADO",
        desc: "Especialista para comidas dominicales o debates deportivos. Experto en táctica nacional, mecánica general y 'saber de fútbol'. Tarifas a convenir."
      },
      {
        highlight: "TALLERES EL FIGURA",
        desc: "Reparamos tu coche para que aguante el viaje de huida de las broncas de la parienta. Especialistas en embragues gastados y excusas para quedarte en el bar."
      },
      {
        highlight: "PENALTIS DE URGENCIA",
        desc: "Servicio 24h para el Real Madrid. ¿Llega el minuto 90 y vais perdiendo? Te tramitamos una mano en el área o un tropiezo sospechoso. Efectividad garantizada."
      },
      {
        highlight: "ASESORÍA NEGREIRA",
        desc: "Informes arbitrales de máxima confidencialidad. Asegura tus ligas de la porra sin levantar sospechas en el VAR. Pagos en cómodas facturas de consultoría."
      },
      {
        highlight: "VITRINAS EL COLCHÓN",
        desc: "Especialistas en estanterías reforzadas para guardar subcampeonatos de Champions League. Espacio de sobra garantizado. Descuento para socios del Atleti."
      },
      {
        highlight: "PASAPORTES EXPRESS",
        desc: "¿Sin físico en tu porra? Nacionalizamos atletas franceses en tiempo récord. Si corren los 100 metros en menos de 10 segundos, no hacemos preguntas sobre su origen."
      },
      {
        highlight: "BENGALAS LAS RAMBLAS",
        desc: "Banderas y bengalas para celebrar victorias de Marruecos en el centro de Barcelona. Descuento si traes un iPhone robado o sabes regatear a la autoridad como Achraf."
      }
    ];

    // Seleccionar 3 anuncios aleatorios sin repetir
    const shuffledAds = [...adsPool].sort(() => 0.5 - Math.random());
    const selectedAds = shuffledAds.slice(0, 3);

    const publicidadHtml = selectedAds.map(ad => `
      <div class="newspaper-ad">
        <div class="newspaper-ad__highlight">${escapeHtml(ad.highlight)}</div>
        <p class="newspaper-ad__desc">${escapeHtml(ad.desc)}</p>
      </div>
    `).join("");

    container.innerHTML = `
      <div class="newspaper-paper">
        <div class="newspaper-header">
          <div class="newspaper-header__top">
            <span>Edición Especial</span>
            <span>El Diario de la Porra</span>
            <span>Precio: 1 Cubata</span>
          </div>
          <h1 class="newspaper-header__logo">EL CUÑADO DEPORTIVO</h1>
          <div class="newspaper-header__bottom">
            <span>Edición Nº ${escapeHtml(edicion)}</span>
            <span>${escapeHtml(date)}</span>
          </div>
        </div>

        <div class="newspaper-main-headline">
          <h2 class="newspaper-headline-title">${escapeHtml(title)}</h2>
          <p class="newspaper-headline-subtitle">${escapeHtml(subtitle)}</p>
        </div>

        <div class="newspaper-columns-container">
          <div class="newspaper-text-columns">
            ${parrafosHtml}
          </div>
          <div class="newspaper-sidebar">
            <div class="newspaper-sec-news-box">
              <h3 class="newspaper-sec-news-title" style="border-bottom: 2px solid #000; padding-bottom: 4px; margin-bottom: 12px; font-size: 15px; text-transform: uppercase;">Breves de la Porra</h3>
              ${noticiasHtml}
            </div>
            ${publicidadHtml}
          </div>
        </div>
      </div>
    `;
  }

  // ---------------------------------------------------------------------------
  // View: El Oráculo del Cuñao (oraculo.html)
  // ---------------------------------------------------------------------------

  function renderOraculo() {
    const container = $("#app-content");
    if (!container) return;

    const chatHistory = []; // { role: "user"|"oracle", text: string }

    container.innerHTML = `
      <div style="max-width:720px; margin:0 auto; padding: 0 0 2rem;">
        <div class="fade-in" style="text-align:center; padding: 2rem 1rem 1.5rem;">
          <div style="font-size:4rem; margin-bottom:0.5rem;">🧙‍♂️</div>
          <h1 class="page-title" style="margin-bottom:0.25rem;">El Oráculo del Cuñao</h1>
          <p class="text-muted" style="font-size:var(--font-sm);">
            Consultor futbolístico de barra. Sabe un rato de esto. Alimentado por <strong>Gemma 4 31B</strong>.
          </p>
        </div>

        <div id="oraculo-chat-box" style="
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          min-height: 320px;
          max-height: 520px;
          overflow-y: auto;
          padding: 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
          margin-bottom: 1rem;
        ">
          <div class="oraculo-msg oraculo-msg--oracle">
            <span class="oraculo-avatar">🧙‍♂️</span>
            <div class="oraculo-bubble oraculo-bubble--oracle">
              Buenas, buenas. El Oráculo de la Barra al aparato. Pregunta lo que quieras sobre fútbol, que de esto sé un rato. Y si no sé, me lo invento con mucha convicción, que para eso tengo palillo en la boca y veinte años viendo el fútbol en el bar del Paco.
            </div>
          </div>
        </div>

        <div style="display:flex; gap:0.5rem; align-items:flex-end;">
          <textarea
            id="oraculo-input"
            class="form-select"
            placeholder="Pregúntale algo al Oráculo… (Enter para enviar)"
            rows="2"
            style="flex:1; resize:none; border-radius:var(--radius-md); font-family:inherit; font-size:var(--font-sm); padding: 0.75rem 1rem; line-height:1.5;"
          ></textarea>
          <button id="oraculo-send-btn" class="btn btn--primary" style="height:52px; padding: 0 1.25rem; flex-shrink:0;">
            Enviar 📨
          </button>
        </div>
        <p class="text-muted" style="font-size:0.72rem; text-align:center; margin-top:0.5rem;">
          El Oráculo puede equivocarse con mucha confianza. Es un cuñao.
        </p>
      </div>
    `;

    const chatBox = $("#oraculo-chat-box");
    const input = $("#oraculo-input");
    const sendBtn = $("#oraculo-send-btn");

    function scrollToBottom() {
      chatBox.scrollTop = chatBox.scrollHeight;
    }

    function appendMessage(role, text) {
      const isOracle = role === "oracle";
      const div = document.createElement("div");
      div.className = `oraculo-msg ${isOracle ? "oraculo-msg--oracle" : "oraculo-msg--user"}`;
      div.innerHTML = `
        ${isOracle ? '<span class="oraculo-avatar">🧙‍♂️</span>' : ""}
        <div class="oraculo-bubble ${isOracle ? "oraculo-bubble--oracle" : "oraculo-bubble--user"}">${escapeHtml(text)}</div>
        ${!isOracle ? '<span class="oraculo-avatar">👤</span>' : ""}
      `;
      chatBox.appendChild(div);
      scrollToBottom();
      return div;
    }

    /**
     * Creates an oracle bubble that can be updated incrementally during streaming.
     * Returns an object with an `append(chunk)` method and a `finalize(fullText)` method.
     */
    function createStreamingBubble() {
      const div = document.createElement("div");
      div.className = "oraculo-msg oraculo-msg--oracle";
      div.innerHTML = `
        <span class="oraculo-avatar">🧙‍♂️</span>
        <div class="oraculo-bubble oraculo-bubble--oracle oraculo-bubble--streaming"></div>
      `;
      chatBox.appendChild(div);
      scrollToBottom();
      const bubble = div.querySelector(".oraculo-bubble");
      let accumulated = "";
      return {
        append(chunk) {
          accumulated += chunk;
          bubble.textContent = accumulated;
          scrollToBottom();
        },
        finalize() {
          bubble.classList.remove("oraculo-bubble--streaming");
          return accumulated;
        }
      };
    }

    function appendTypingIndicator() {
      const div = document.createElement("div");
      div.className = "oraculo-msg oraculo-msg--oracle";
      div.id = "oraculo-typing";
      div.innerHTML = `
        <span class="oraculo-avatar">🧙‍♂️</span>
        <div class="oraculo-bubble oraculo-bubble--oracle oraculo-typing">
          <span></span><span></span><span></span>
        </div>
      `;
      chatBox.appendChild(div);
      scrollToBottom();
    }

    function removeTypingIndicator() {
      $("#oraculo-typing")?.remove();
    }

    /**
     * Fetches the porra context from GAS (fast, no AI call).
     * Falls back to null if unavailable.
     */
    async function fetchPorraContext() {
      try {
        const resp = await fetch(CONFIG.appsScriptUrl, {
          method: "POST",
          mode: "cors",
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify({ action: "getOracleContext" })
        });
        const json = await resp.json();
        if (json.success && json.result) {
          return {
            context: json.result.context,
            geminiApiKey: json.result.geminiApiKey
          };
        }
        return null;
      } catch {
        return null;
      }
    }

    /**
     * Builds the full prompt text for the oracle (system + history + question).
     */
    function buildOraclePrompt(question, history, porraContext) {
      let contextBlock = "";
      if (porraContext) {
        contextBlock = "\n\n--- DATOS ACTUALES DE LA PORRA (úsalos cuando sean relevantes) ---\n" +
          "Jornada en curso: " + porraContext.jornada + "\n" +
          "Clasificación global:\n" + porraContext.clasificacion + "\n" +
          "Picks de goleador esta jornada: " + porraContext.goleadores + "\n" +
          "Picks de portero esta jornada: " + porraContext.porteros + "\n" +
          "--- FIN DATOS PORRA ---";
      }

      const systemPrompt = "Eres 'El Oráculo de la Barra', un tío que sabe demasiado de fútbol y no puede callarse. Tu tono es humor español de Twitter: takes calientes, ironía seca, frases cortas y contundentes, algún emoji bien puesto (no más de 2), nada de parrafadas. Tienes acceso a los datos reales de una porra del Mundial entre amigos y DEBES usarlos cuando sean relevantes: liquida al colista, ensalza al líder, opina sobre los picks con total seguridad. Responde en máximo 3-4 frases. Estilo: si alguien dice algo obvio tú ya lo sabías. Si hay un colista, es culpa suya. Si hay un líder, es por suerte. Nunca admitas incertidumbre." + contextBlock;

      let promptText = systemPrompt + "\n\n";
      if (Array.isArray(history)) {
        history.forEach(msg => {
          promptText += (msg.role === "user" ? "Usuario: " : "Cuñado: ") + msg.text + "\n";
        });
      }
      promptText += "Usuario: " + question + "\nCuñado:";
      return promptText;
    }

    /**
     * Calls Gemini generateContent directly from the browser (non-streaming).
     */
    async function callGemini(promptText, apiKey) {
      const key = apiKey || CONFIG.geminiApiKey;
      const modelName = "gemma-4-31b-it";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${key}`;

      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }]
        })
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Gemini error ${resp.status}: ${errText}`);
      }

      const data = await resp.json();
      const parts = data?.candidates?.[0]?.content?.parts || [];
      let text = "";
      for (const part of parts) {
        if (part.thought !== true && part.text) {
          text += part.text;
        }
      }
      if (!text) throw new Error("Respuesta vacía de la IA");
      return text;
    }

    async function sendMessage() {
      const question = input.value.trim();
      if (!question) return;

      input.value = "";
      input.style.height = "auto";
      sendBtn.disabled = true;
      sendBtn.textContent = "…";

      appendMessage("user", question);
      chatHistory.push({ role: "user", text: question });

      // Step 1: fetch porra context from GAS (lightweight, no AI)
      appendTypingIndicator();
      const resultObj = await fetchPorraContext();

      // Step 2: call Gemini
      try {
        const promptText = buildOraclePrompt(question, chatHistory.slice(-10), resultObj?.context);
        const apiKey = resultObj?.geminiApiKey;
        const fullAnswer = await callGemini(promptText, apiKey);
        removeTypingIndicator();
        appendMessage("oracle", fullAnswer);
        chatHistory.push({ role: "oracle", text: fullAnswer });
      } catch (err) {
        removeTypingIndicator();
        appendMessage("oracle", "Tío, que se ha caído la Wi-Fi del bar. Vuelve a intentarlo, que mi primo el del bar ya está mirando el router. (" + err.message + ")");
      } finally {
        sendBtn.disabled = false;
        sendBtn.textContent = "Enviar 📨";
        input.focus();
      }
    }

    function buildPorraContext() {
      try {
        const board = Scoring.buildLeaderboard(
          _data.participants,
          _data.matchPredictions,
          _data.scorerPicks,
          _data.goalkeeperPicks,
          _data.specialEventPicks
        );

        const clasificacion = board.map((item, i) =>
          `${i + 1}. ${item.name} — ${item.totalPoints} pts`
        ).join("\n");

        // Picks de la jornada actual
        const scorerPicksJornada = _data.scorerPicks
          .filter(sp => sp.round_key === _currentRound)
          .map(sp => {
            const p = _data.players.find(pl => pl.id === sp.player_id);
            const participant = _data.participants.find(pa => pa.id === sp.participant_id);
            return `${participant ? participant.name : sp.participant_id}: ${p ? p.name + " (" + p.team + ")" : sp.player_id}`;
          }).join(", ");

        const gkPicksJornada = _data.goalkeeperPicks
          .filter(gp => gp.round_key === _currentRound)
          .map(gp => {
            const p = _data.players.find(pl => pl.id === gp.player_id);
            const participant = _data.participants.find(pa => pa.id === gp.participant_id);
            return `${participant ? participant.name : gp.participant_id}: ${p ? p.name + " (" + p.team + ")" : gp.player_id}`;
          }).join(", ");

        const roundLabel = (CONFIG.roundLabels && CONFIG.roundLabels[_currentRound]) || _currentRound;

        return {
          clasificacion,
          jornada: roundLabel,
          goleadores: scorerPicksJornada || "Aún no hay picks",
          porteros: gkPicksJornada || "Aún no hay picks"
        };
      } catch (e) {
        return null;
      }
    }



    sendBtn.addEventListener("click", sendMessage);

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    input.focus();
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
    if (path.includes("analisis")) return "analisis";
    if (path.includes("periodico")) return "periodico";
    if (path.includes("oraculo")) return "oraculo";
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

  function formatMatchDate(utcString) {
    if (!utcString) return "";
    try {
      const d = new Date(utcString);
      const weekday = d.toLocaleDateString("es-ES", { weekday: "short" });
      const dayMonth = d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
      return `${weekday.charAt(0).toUpperCase() + weekday.slice(1)} ${dayMonth}`;
    } catch { return ""; }
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

    select.addEventListener("change", async (e) => {
      const selectedUser = e.target.value;
      if (selectedUser) {
        const participant = _data.participants.find(p => p.name === selectedUser);
        const pass = participant ? participant.password : null;
        
        const hasPasswordInSheet = (pass !== null && pass !== undefined && String(pass).trim() !== "");
        const localPass = localStorage.getItem("porra_password_" + selectedUser.trim().toLowerCase());
        
        const onLoginSuccess = (entered) => {
          localStorage.setItem("porra_active_user", selectedUser);
          localStorage.setItem("porra_password_" + selectedUser.trim().toLowerCase(), entered);
          loadUserDraft(selectedUser);
          updateFloatingSaveBar();
          handleRoute();
        };
        
        const onLoginFailure = () => {
          showToast("Contraseña incorrecta. Acceso denegado.", "error");
          select.value = getActiveUser();
        };

        const validateRemote = async (entered, onValid, onInvalid) => {
          if (CONFIG.appsScriptUrl && !CONFIG.appsScriptUrl.startsWith("URL_DE_TU_APPS_SCRIPT")) {
            showLoading(true);
            try {
              const draft = loadUserDraft(selectedUser) || { name: selectedUser };
              const originalPassword = draft.password;
              draft.password = entered;
              draft._submittedAt = new Date().toISOString();
              
              const response = await fetch(CONFIG.appsScriptUrl, {
                method: "POST",
                mode: "cors",
                headers: { "Content-Type": "text/plain" },
                body: JSON.stringify(draft)
              });
              
              if (response.ok) {
                const resJson = await response.json();
                if (resJson && resJson.success) {
                  showLoading(false);
                  onValid();
                  return;
                }
              }
              // Restore password in local draft if rejected
              draft.password = originalPassword;
              saveUserDraft(selectedUser, draft);
            } catch (err) {
              console.warn("Fallo al validar contra el servidor:", err);
            } finally {
              showLoading(false);
            }
          }
          onInvalid();
        };
        
        if (hasPasswordInSheet) {
          showPasswordModal(selectedUser, false, async (entered) => {
            if (entered === String(pass) || entered === localPass) {
              onLoginSuccess(entered);
            } else {
              await validateRemote(entered, () => onLoginSuccess(entered), onLoginFailure);
            }
          }, () => {
            select.value = getActiveUser();
          });
        } else if (localPass) {
          showPasswordModal(selectedUser, false, async (entered) => {
            if (entered === localPass || entered === String(pass)) {
              onLoginSuccess(entered);
            } else {
              await validateRemote(entered, () => onLoginSuccess(entered), onLoginFailure);
            }
          }, () => {
            select.value = getActiveUser();
          });
        } else {
          showPasswordModal(selectedUser, true, async (newPassword) => {
            if (!newPassword.trim()) {
              showToast("La contraseña no puede estar vacía.", "error");
              select.value = getActiveUser();
              return;
            }
            localStorage.setItem("porra_password_" + selectedUser.trim().toLowerCase(), newPassword);
            localStorage.setItem("porra_active_user", selectedUser);
            
            const draft = loadUserDraft(selectedUser);
            draft.password = newPassword;
            saveUserDraft(selectedUser, draft);
            
            // Registrar inmediatamente en el servidor la nueva contraseña
            if (CONFIG.appsScriptUrl && !CONFIG.appsScriptUrl.startsWith("URL_DE_TU_APPS_SCRIPT")) {
              showLoading(true);
              try {
                draft._submittedAt = new Date().toISOString();
                const response = await fetch(CONFIG.appsScriptUrl, {
                  method: "POST",
                  mode: "cors",
                  headers: { "Content-Type": "text/plain" },
                  body: JSON.stringify(draft)
                });
                if (response.ok) {
                  const resJson = await response.json();
                  if (resJson && resJson.success) {
                    showToast("Contraseña registrada y vinculada a tu usuario.", "success");
                  } else if (resJson && resJson.error) {
                    showToast(`Error del servidor al guardar contraseña: ${resJson.error}`, "error");
                  }
                }
              } catch (err) {
                console.warn("Fallo al registrar contraseña en el servidor:", err);
              } finally {
                showLoading(false);
              }
            }
            
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
      case "analisis":
        renderAnalysis();
        break;
      case "periodico":
        renderPeriodico();
        break;
      case "oraculo":
        renderOraculo();
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

  function initFlagsTicker() {
    const footer = $(".footer");
    if (!footer) return;

    if (footer.querySelector(".footer-ticker")) return;

    const countries = [
      "USA", "mexico", "canada", "argentina", "brazil", "spain", "france", "germany", 
      "japan", "morocco", "portugal", "uruguay", "colombia", "belgium", "netherlands", 
      "south korea", "senegal", "switzerland", "ghana", "australia", "norway", "sweden", 
      "turkey", "egypt", "south africa", "iran", "qatar", "saudi arabia", "tunisia", 
      "panama", "paraguay", "ecuador", "new zealand", "cameroon", "ivory coast", "algeria", 
      "croatia", "austria", "denmark", "poland", "czech republic", "uzbekistan"
    ];

    const flagsHtml = countries.map(c => getFlagImgHtml(c)).join("");

    const ticker = document.createElement("div");
    ticker.className = "footer-ticker";
    ticker.innerHTML = `
      <div class="footer-ticker-inner">
        <div class="footer-ticker-group">${flagsHtml}</div>
        <div class="footer-ticker-group">${flagsHtml}</div>
      </div>
    `;

    footer.insertBefore(ticker, footer.firstChild);
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

    initFlagsTicker();
    setActiveNav();
    initMobileMenu();
    initSPA();

    const musicScript = document.createElement("script");
    musicScript.src = "music.js?v=" + Date.now();
    musicScript.onload = () => {
      if (typeof PorraMusic !== "undefined") {
        PorraMusic.init();
      }
    };
    document.head.appendChild(musicScript);

    const hasUrls = Object.values(CONFIG.googleSheets).every(url => url && !url.startsWith("URL_CSV"));

    if (hasUrls) {
      // Pintado instantáneo desde caché si hay copia local, refresco en segundo plano
      if (hydrateFromCache()) {
        renderUserSelector();
        updateFloatingSaveBar();
        handleRoute();
        loadAllData(true).then(() => {
          renderUserSelector();
          updateFloatingSaveBar();
          handleRoute();
        }).catch(() => {});
      } else {
        await loadAllData();
        renderUserSelector();
        updateFloatingSaveBar();
        handleRoute();
      }
    } else {
      console.info("Google Sheets URLs not configured. Showing tutorial notice.");
      showConfigNotice();
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  return { init, loadAllData, renderLeaderboard, renderMatches, renderScorerGoalkeeper, renderSpecialEvents, renderAnalysis, renderPeriodico, renderOraculo, renderAdmin };
})();

// Boot
document.addEventListener("DOMContentLoaded", App.init);
