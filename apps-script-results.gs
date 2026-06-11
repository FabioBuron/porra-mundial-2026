// =============================================================================
// La Porra del Mundial — Actualización Automática de Resultados
// =============================================================================
// Pegar este código en el mismo proyecto de Apps Script que google-apps-script.gs
//
// CONFIGURACIÓN INICIAL:
//   1. Ve a Extensiones > Apps Script > ⚙️ Configuración del proyecto > Propiedades del script
//   2. Añade la propiedad: FD_TOKEN = <tu token de football-data.org>
//      Regístrate gratis en: https://www.football-data.org/client/register
//   3. Ejecuta syncMatchIds() UNA vez a mano para emparejar partidos.
//   4. Instala el trigger de tiempo: syncAndUpdate() cada 30 min.
//
// PRESUPUESTO API: 2 requests/ejecución × 2 ejecuciones/hora ≈ 96 req/día. Límite: 10/min. ✅
// =============================================================================

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------

function _getConfig() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty("FD_TOKEN");
  if (!token) throw new Error("FD_TOKEN no configurado. Ve a Propiedades del script y añade la clave FD_TOKEN.");
  return {
    token: token,
    base: "https://api.football-data.org/v4",
    competition: "WC"
  };
}

function _getSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error("Hoja '" + name + "' no encontrada. Verifica el nombre en tu Google Sheet.");
  return sheet;
}

function ensureResultsSchema() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const matches = _getSheet("matches");
  const matchHeaders = matches.getRange(1, 1, 1, matches.getLastColumn()).getValues()[0];
  if (matchHeaders.indexOf("api_id") === -1) {
    matches.getRange(1, matches.getLastColumn() + 1).setValue("api_id");
  }

  const players = _getSheet("players");
  const playerHeaders = players.getRange(1, 1, 1, players.getLastColumn()).getValues()[0];
  if (playerHeaders.indexOf("api_name") === -1) {
    const activeIdx = playerHeaders.indexOf("active");
    const insertCol = activeIdx === -1 ? players.getLastColumn() + 1 : activeIdx + 2;
    players.insertColumnBefore(insertCol);
    players.getRange(1, insertCol).setValue("api_name");
  }

  let snapshots = ss.getSheetByName("api_snapshots");
  if (!snapshots) {
    snapshots = ss.insertSheet("api_snapshots");
    snapshots.appendRow(["round_key", "player_api_name", "goals_total", "taken_at"]);
  }

  return {
    matches_has_api_id: true,
    players_has_api_name: true,
    api_snapshots_exists: true
  };
}

// ---------------------------------------------------------------------------
// Llamadas a la API
// ---------------------------------------------------------------------------

function _apiGet(path) {
  const cfg = _getConfig();
  const url = cfg.base + path.replace("{comp}", cfg.competition);
  const resp = UrlFetchApp.fetch(url, {
    headers: { "X-Auth-Token": cfg.token },
    muteHttpExceptions: true
  });
  const code = resp.getResponseCode();
  if (code !== 200) {
    throw new Error("API error " + code + " en " + url + ": " + resp.getContentText().slice(0, 200));
  }
  return JSON.parse(resp.getContentText());
}

// ---------------------------------------------------------------------------
// Helpers de normalización de nombres de equipos
// ---------------------------------------------------------------------------

// Mapa de alias API (inglés) → nombre en el Sheet (español/local)
const TEAM_ALIAS = {
  // Formato: "nombre_en_api": "nombre_en_sheet"
  "Spain": "España",
  "Germany": "Alemania",
  "France": "Francia",
  "England": "Inglaterra",
  "Netherlands": "Países Bajos",
  "Portugal": "Portugal",
  "Brazil": "Brasil",
  "Argentina": "Argentina",
  "USA": "USA",
  "Mexico": "México",
  "Morocco": "Marruecos",
  "Japan": "Japón",
  "Colombia": "Colombia",
  "Ecuador": "Ecuador",
  "Uruguay": "Uruguay",
  "Chile": "Chile",
  "Peru": "Perú",
  "Switzerland": "Suiza",
  "Belgium": "Bélgica",
  "Croatia": "Croacia",
  "Serbia": "Serbia",
  "Denmark": "Dinamarca",
  "Senegal": "Senegal",
  "Ghana": "Ghana",
  "Cameroon": "Camerún",
  "Nigeria": "Nigeria",
  "South Korea": "Corea del Sur",
  "Australia": "Australia",
  "Saudi Arabia": "Arabia Saudí",
  "Iran": "Irán",
  "Qatar": "Catar",
  "Canada": "Canadá",
  "Costa Rica": "Costa Rica",
  "Panama": "Panamá",
  "Honduras": "Honduras",
  "Bolivia": "Bolivia",
  "Paraguay": "Paraguay",
  "Venezuela": "Venezuela",
  "Tunisia": "Túnez",
  "Algeria": "Argelia",
  "Egypt": "Egipto",
  "South Africa": "Sudáfrica",
  "New Zealand": "Nueva Zelanda",
  "Poland": "Polonia",
  "Ukraine": "Ucrania",
  "Czech Republic": "República Checa",
  "Slovakia": "Eslovaquia",
  "Hungary": "Hungría",
  "Romania": "Rumanía",
  "Turkey": "Turquía",
  "Greece": "Grecia",
  "Scotland": "Escocia",
  "Wales": "Gales",
  "Republic of Ireland": "Irlanda",
  "Northern Ireland": "Irlanda del Norte",
  "Sweden": "Suecia",
  "Norway": "Noruega",
  "Finland": "Finlandia",
  "Austria": "Austria",
  "Italy": "Italia",
  "Russia": "Rusia",
  "Israel": "Israel",
  "Albania": "Albania",
  "Slovenia": "Eslovenia",
  "Bosnia and Herzegovina": "Bosnia",
  "Ivory Coast": "Costa de Marfil",
  "Mali": "Malí",
  "Guinea": "Guinea",
  "Angola": "Angola",
  "Congo DR": "RD Congo",
  "Tanzania": "Tanzania",
  "Uganda": "Uganda",
  "Zimbabwe": "Zimbabue",
  "Iraq": "Irak",
  "UAE": "Emiratos Árabes",
  "China PR": "China",
  "India": "India",
  "Thailand": "Tailandia",
  "Vietnam": "Vietnam",
  "Indonesia": "Indonesia",
  "Philippines": "Filipinas",
  "Jamaica": "Jamaica",
  "Haiti": "Haití",
  "Trinidad and Tobago": "Trinidad y Tobago",
  "Curaçao": "Curazao",
  "Guatemala": "Guatemala",
  "El Salvador": "El Salvador",
  "Nicaragua": "Nicaragua",
  "Bermuda": "Bermudas",
  
  // Soporte para variaciones de nombres de la API y localizaciones
  "United States": "USA",
  "Czechia": "Czech Republic",
  "Democratic Republic of the Congo": "DR Congo",
  "Cabo Verde": "Cape Verde",
  "Côte d'Ivoire": "Ivory Coast"
};

function _normalizeTeam(name) {
  if (!name) return "";
  // Primero intentar alias directo
  if (TEAM_ALIAS[name]) return TEAM_ALIAS[name].toLowerCase().trim();
  // Si no, devolver en minúsculas sin acentos
  return name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function _teamMatches(apiName, sheetName) {
  if (!apiName || !sheetName) return false;
  const aNorm = apiName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const bNorm = sheetName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

  // Caso 1: Coinciden directamente en inglés (nombre de API y de Sheet son inglés)
  if (aNorm === bNorm) return true;

  // Casos especiales de doble alias (Español / Inglés / Variaciones API)
  if (apiName === "Bosnia and Herzegovina" && (bNorm === "bosnia" || bNorm === "bosnia & herzegovina")) return true;
  if (apiName === "Congo DR" && (bNorm === "rd congo" || bNorm === "dr congo" || bNorm === "congo dr")) return true;
  if (apiName === "Democratic Republic of the Congo" && (bNorm === "rd congo" || bNorm === "dr congo" || bNorm === "congo dr")) return true;
  if (apiName === "United States" && (bNorm === "usa" || bNorm === "estados unidos")) return true;
  if (apiName === "USA" && (bNorm === "usa" || bNorm === "estados unidos")) return true;
  if (apiName === "Cabo Verde" && (bNorm === "cape verde" || bNorm === "cabo verde")) return true;
  if (apiName === "Cape Verde" && (bNorm === "cape verde" || bNorm === "cabo verde")) return true;
  if (apiName === "Côte d'Ivoire" && (bNorm === "costa de marfil" || bNorm === "ivory coast")) return true;
  if (apiName === "Ivory Coast" && (bNorm === "costa de marfil" || bNorm === "ivory coast")) return true;
  if (apiName === "Czechia" && (bNorm === "republica checa" || bNorm === "czech republic")) return true;
  if (apiName === "Czech Republic" && (bNorm === "republica checa" || bNorm === "czech republic")) return true;

  // Caso 2: Coincide el alias en español
  const alias = TEAM_ALIAS[apiName];
  if (alias) {
    const aliasNorm = alias.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    if (aliasNorm === bNorm) return true;
  }

  // Fallback antiguo
  const a = _normalizeTeam(apiName);
  return a === bNorm || TEAM_ALIAS[apiName] === sheetName;
}

// ---------------------------------------------------------------------------
// 1. syncMatchIds() — emparejar partidos API con filas del Sheet
// ---------------------------------------------------------------------------
// Ejecutar UNA sola vez a mano desde Apps Script > Ejecutar.
// Escribe el api_id (int) en la columna "api_id" de la hoja "matches".

function syncMatchIds() {
  const sheet = _getSheet("matches");
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idxId = headers.indexOf("id");
  const idxHome = headers.indexOf("home_team");
  const idxAway = headers.indexOf("away_team");
  const idxKickoff = headers.indexOf("kickoff_utc");
  const idxApiId = headers.indexOf("api_id");

  if (idxApiId === -1) throw new Error("Columna 'api_id' no encontrada en hoja 'matches'. Añádela primero.");

  const apiData = _apiGet("/competitions/{comp}/matches");
  const apiMatches = apiData.matches || [];

  let matched = 0, skipped = 0, unmatched = [];

  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    if (!row[idxId]) continue;
    if (row[idxApiId]) { skipped++; continue; } // ya tiene api_id

    const sheetHome = row[idxHome];
    const sheetAway = row[idxAway];
    const sheetKickoff = new Date(row[idxKickoff]).getTime();

    // Buscar el partido en la API: mismos equipos (con alias) y fecha ± 1 día
    const found = apiMatches.find(am => {
      const apiHome = am.homeTeam && am.homeTeam.name;
      const apiAway = am.awayTeam && am.awayTeam.name;
      const apiDate = new Date(am.utcDate).getTime();
      const dateOk = Math.abs(apiDate - sheetKickoff) <= 86400000; // ±1 día
      return dateOk && _teamMatches(apiHome, sheetHome) && _teamMatches(apiAway, sheetAway);
    });

    if (found) {
      sheet.getRange(r + 1, idxApiId + 1).setValue(found.id);
      matched++;
      Logger.log("✅ " + row[idxId] + " → api_id " + found.id + " (" + sheetHome + " vs " + sheetAway + ")");
    } else {
      unmatched.push(row[idxId] + ": " + sheetHome + " vs " + sheetAway + " (" + row[idxKickoff] + ")");
    }
  }

  const summary = "syncMatchIds: " + matched + " emparejados, " + skipped + " ya tenían id, " + unmatched.length + " sin emparejar.";
  Logger.log(summary);
  if (unmatched.length > 0) {
    Logger.log("⚠️ Sin emparejar (revisar manualmente):\n" + unmatched.join("\n"));
  }
  return summary;
}

// ---------------------------------------------------------------------------
// 2. updateResults() — actualizar marcadores y estado de partidos
// ---------------------------------------------------------------------------
// CRON: cada 30 min. Solo escribe si hay cambios reales.

function updateResults() {
  const sheet = _getSheet("matches");
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  const idxApiId   = headers.indexOf("api_id");
  const idxHome    = headers.indexOf("home_score");
  const idxAway    = headers.indexOf("away_score");
  const idxStatus  = headers.indexOf("status");

  if (idxApiId === -1) throw new Error("Columna 'api_id' no encontrada.");

  const apiData = _apiGet("/competitions/{comp}/matches");
  const apiMap = {};
  (apiData.matches || []).forEach(m => { apiMap[m.id] = m; });

  let updated = 0;

  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    const apiId = row[idxApiId];
    if (!apiId) continue;

    const am = apiMap[apiId];
    if (!am) continue;

    // Mapear estado API → estado local
    let newStatus;
    const st = (am.status || "").toUpperCase();
    if (st === "FINISHED" || st === "AWARDED") newStatus = "finished";
    else if (st === "IN_PLAY" || st === "PAUSED" || st === "SUSPENDED") newStatus = "live";
    else newStatus = "scheduled";

    const newHome = am.score && am.score.fullTime ? am.score.fullTime.home : null;
    const newAway = am.score && am.score.fullTime ? am.score.fullTime.away : null;

    const currStatus = row[idxStatus];
    const currHome = row[idxHome];
    const currAway = row[idxAway];

    const hasChange = newStatus !== currStatus ||
      (newHome !== null && String(newHome) !== String(currHome)) ||
      (newAway !== null && String(newAway) !== String(currAway));

    if (hasChange) {
      if (idxHome !== -1) sheet.getRange(r + 1, idxHome + 1).setValue(newHome !== null ? newHome : "");
      if (idxAway !== -1) sheet.getRange(r + 1, idxAway + 1).setValue(newAway !== null ? newAway : "");
      if (idxStatus !== -1) sheet.getRange(r + 1, idxStatus + 1).setValue(newStatus);
      updated++;
      Logger.log("🔄 Fila " + (r + 1) + " → " + newStatus + " " + newHome + "-" + newAway);
    }
  }

  Logger.log("updateResults: " + updated + " filas actualizadas.");
  return updated;
}

// ---------------------------------------------------------------------------
// 3. updateScorers() — actualizar goles por jornada en hoja players
// ---------------------------------------------------------------------------
// Usa snapshots de la jornada anterior para calcular goles incrementales.

function updateScorers() {
  const matchSheet   = _getSheet("matches");
  const playerSheet  = _getSheet("players");
  const snapSheet    = _getSheet("api_snapshots");

  const matchData   = matchSheet.getDataRange().getValues();
  const playerData  = playerSheet.getDataRange().getValues();
  const snapData    = snapSheet.getDataRange().getValues();

  const mHeaders = matchData[0];
  const pHeaders = playerData[0];
  const sHeaders = snapData[0];

  const mIdxStatus  = mHeaders.indexOf("status");
  const mIdxApiId   = mHeaders.indexOf("api_id");
  const mIdxPhase   = mHeaders.indexOf("phase");
  const mIdxMd      = mHeaders.indexOf("matchday");

  const pIdxApiName = pHeaders.indexOf("api_name");
  const pIdxName    = pHeaders.indexOf("name");
  const pIdxTeam    = pHeaders.indexOf("team");
  const pIdxPos     = pHeaders.indexOf("position");

  // Determinar round_key actual: la última ronda con al menos 1 partido finished
  // y cuya siguiente ronda aún no ha empezado (ningún partido finished)
  const finishedRounds = new Set();
  for (let r = 1; r < matchData.length; r++) {
    const row = matchData[r];
    if ((row[mIdxStatus] || "").toLowerCase() === "finished") {
      const key = _matchRoundKey(row[mIdxPhase], row[mIdxMd]);
      if (key) finishedRounds.add(key);
    }
  }

  const ROUND_ORDER = ["group_md1", "group_md2", "group_md3", "r32", "r16", "qf", "sf", "3rd", "final"];
  let currentRound = null;
  for (let i = ROUND_ORDER.length - 1; i >= 0; i--) {
    if (finishedRounds.has(ROUND_ORDER[i])) {
      currentRound = ROUND_ORDER[i];
      break;
    }
  }
  if (!currentRound) {
    Logger.log("updateScorers: no hay jornadas terminadas aún.");
    return 0;
  }

  // Obtener goles acumulados de la API
  const scorersData = _apiGet("/competitions/{comp}/scorers?limit=200");
  const apiScorers = scorersData.scorers || [];

  // Cargar snapshots previos: { player_api_name+round_key → goals_total }
  const snapMap = {};
  const sIdxRound  = sHeaders.indexOf("round_key");
  const sIdxPlayer = sHeaders.indexOf("player_api_name");
  const sIdxGoals  = sHeaders.indexOf("goals_total");
  for (let r = 1; r < snapData.length; r++) {
    const sRow = snapData[r];
    if (!sRow[sIdxRound] || !sRow[sIdxPlayer]) continue;
    const key = sRow[sIdxRound] + "|" + sRow[sIdxPlayer];
    snapMap[key] = Number(sRow[sIdxGoals]) || 0;
  }

  // Calcular índice de jornada anterior
  const currentIdx = ROUND_ORDER.indexOf(currentRound);
  const prevRound  = currentIdx > 0 ? ROUND_ORDER[currentIdx - 1] : null;

  // Buscar columna goals_<round> en players
  const goalsCol = "goals_" + currentRound;
  let pIdxGoals  = pHeaders.indexOf(goalsCol);
  if (pIdxGoals === -1) {
    Logger.log("⚠️ Columna '" + goalsCol + "' no existe en hoja players. Añádela y vuelve a ejecutar.");
    return 0;
  }

  let updated = 0;

  for (let r = 1; r < playerData.length; r++) {
    const pRow = playerData[r];
    const apiName = pRow[pIdxApiName] ? String(pRow[pIdxApiName]).trim() : "";
    const localName = pRow[pIdxName] ? String(pRow[pIdxName]).trim() : "";
    const team = pRow[pIdxTeam] ? String(pRow[pIdxTeam]).trim() : "";
    const pos = pRow[pIdxPos] ? String(pRow[pIdxPos]).trim().toLowerCase() : "";

    if (pos === "goalkeeper") continue; // porteros se calculan por encajados, no goles

    // Buscar en API: prioridad api_name; si está vacío, normalizar contra name
    const apiEntry = apiScorers.find(sc => {
      const n = sc.player && sc.player.name ? sc.player.name : "";
      if (apiName) return n === apiName;
      const normN = n.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const normL = localName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return normN === normL;
    });

    if (!apiEntry) continue; // jugador no en ranking de goleadores aún → 0 goles (no sobreescribir)

    const totalGoals = Number(apiEntry.goals && typeof apiEntry.goals === 'object' ? apiEntry.goals.scored : apiEntry.goals) || 0;
    const playerApiName = apiEntry.player.name;

    // Goles de esta jornada = acumulado − snapshot jornada anterior
    const prevKey = prevRound ? prevRound + "|" + playerApiName : null;
    const prevGoals = prevKey ? (snapMap[prevKey] || 0) : 0;
    const jornada = Math.max(0, totalGoals - prevGoals);

    const currVal = pRow[pIdxGoals];
    if (String(jornada) !== String(currVal)) {
      playerSheet.getRange(r + 1, pIdxGoals + 1).setValue(jornada);
      updated++;
      Logger.log("⚽ " + localName + " (" + team + ") goals_" + currentRound + " = " + jornada + " (total API: " + totalGoals + ", prev: " + prevGoals + ")");
    }
  }

  Logger.log("updateScorers: " + updated + " filas actualizadas. Jornada: " + currentRound);
  return updated;
}

// ---------------------------------------------------------------------------
// 4. closeRound(roundKey) — snapshot al cierre de jornada + porteros
// ---------------------------------------------------------------------------

function closeRound(roundKey) {
  if (!roundKey) throw new Error("roundKey requerido.");

  const matchSheet   = _getSheet("matches");
  const playerSheet  = _getSheet("players");
  const snapSheet    = _getSheet("api_snapshots");

  const matchData  = matchSheet.getDataRange().getValues();
  const playerData = playerSheet.getDataRange().getValues();
  const pHeaders   = playerData[0];
  const mHeaders   = matchData[0];

  // --- 1) Snapshot de goleadores ---
  const scorersData = _apiGet("/competitions/{comp}/scorers?limit=200");
  const apiScorers = scorersData.scorers || [];
  const takenAt = new Date().toISOString();

  const snapRows = apiScorers.map(sc => [
    roundKey,
    sc.player ? sc.player.name : "",
    Number(sc.goals && typeof sc.goals === 'object' ? sc.goals.scored : sc.goals) || 0,
    takenAt
  ]);

  if (snapRows.length > 0) {
    // Añadir filas al final de api_snapshots
    const lastRow = snapSheet.getLastRow();
    snapSheet.getRange(lastRow + 1, 1, snapRows.length, 4).setValues(snapRows);
    Logger.log("closeRound(" + roundKey + "): " + snapRows.length + " snapshots guardados.");
  }

  // --- 2) Goles encajados por portero ---
  // Lógica: para cada portero activo, sumar goles en contra de su equipo
  // en los partidos finished de esta jornada.
  const mIdxStatus  = mHeaders.indexOf("status");
  const mIdxPhase   = mHeaders.indexOf("phase");
  const mIdxMd      = mHeaders.indexOf("matchday");
  const mIdxHome    = mHeaders.indexOf("home_team");
  const mIdxAway    = mHeaders.indexOf("away_team");
  const mIdxHScore  = mHeaders.indexOf("home_score");
  const mIdxAScore  = mHeaders.indexOf("away_score");

  // Filtrar partidos de esta jornada terminados
  const roundMatches = [];
  for (let r = 1; r < matchData.length; r++) {
    const row = matchData[r];
    const key = _matchRoundKey(row[mIdxPhase], row[mIdxMd]);
    if (key === roundKey && (row[mIdxStatus] || "").toLowerCase() === "finished") {
      roundMatches.push({
        home: String(row[mIdxHome] || "").trim(),
        away: String(row[mIdxAway] || "").trim(),
        homeScore: Number(row[mIdxHScore]) || 0,
        awayScore: Number(row[mIdxAScore]) || 0
      });
    }
  }

  if (roundMatches.length === 0) {
    Logger.log("closeRound: no hay partidos finished de " + roundKey + " para calcular porteros.");
    return;
  }

  // Construir mapa equipo → goles encajados en la jornada
  const concededByTeam = {};
  roundMatches.forEach(m => {
    concededByTeam[m.home] = (concededByTeam[m.home] || 0) + m.awayScore;
    concededByTeam[m.away] = (concededByTeam[m.away] || 0) + m.homeScore;
  });

  // Columna conceded_<roundKey> en players
  const concededCol = "conceded_" + roundKey;
  const pIdxConceded = pHeaders.indexOf(concededCol);
  if (pIdxConceded === -1) {
    Logger.log("⚠️ Columna '" + concededCol + "' no existe en hoja players.");
    return;
  }

  const pIdxPos  = pHeaders.indexOf("position");
  const pIdxTeam = pHeaders.indexOf("team");
  const pIdxActive = pHeaders.indexOf("active");

  let gkUpdated = 0;
  for (let r = 1; r < playerData.length; r++) {
    const pRow = playerData[r];
    const pos    = String(pRow[pIdxPos] || "").trim().toLowerCase();
    const active = String(pRow[pIdxActive] || "").trim().toLowerCase();
    if (pos !== "goalkeeper") continue;
    if (active !== "true" && active !== "1") continue;

    const team = String(pRow[pIdxTeam] || "").trim();
    const conceded = concededByTeam[team] !== undefined ? concededByTeam[team] : null;
    if (conceded === null) continue; // equipo no jugó en esta jornada

    playerSheet.getRange(r + 1, pIdxConceded + 1).setValue(conceded);
    gkUpdated++;
    Logger.log("🧤 Portero " + pRow[pHeaders.indexOf("name")] + " (" + team + ") conceded_" + roundKey + " = " + conceded);
  }
  Logger.log("closeRound: " + gkUpdated + " porteros actualizados.");
}

// ---------------------------------------------------------------------------
// 5. detectAndCloseRounds() — cierre automático si todos los partidos terminaron
// ---------------------------------------------------------------------------

function detectAndCloseRounds() {
  const matchSheet = _getSheet("matches");
  const snapSheet  = _getSheet("api_snapshots");

  const matchData = matchSheet.getDataRange().getValues();
  const snapData  = snapSheet.getDataRange().getValues();
  const mHeaders  = matchData[0];
  const sHeaders  = snapData[0];

  const mIdxStatus = mHeaders.indexOf("status");
  const mIdxPhase  = mHeaders.indexOf("phase");
  const mIdxMd     = mHeaders.indexOf("matchday");
  const sIdxRound  = sHeaders.indexOf("round_key");

  // Jornadas que ya tienen snapshot
  const snapshotted = new Set();
  for (let r = 1; r < snapData.length; r++) {
    if (snapData[r][sIdxRound]) snapshotted.add(String(snapData[r][sIdxRound]).trim());
  }

  // Agrupar partidos por round_key
  const byRound = {};
  for (let r = 1; r < matchData.length; r++) {
    const row = matchData[r];
    const key = _matchRoundKey(row[mIdxPhase], row[mIdxMd]);
    if (!key) continue;
    if (!byRound[key]) byRound[key] = { total: 0, finished: 0 };
    byRound[key].total++;
    if ((row[mIdxStatus] || "").toLowerCase() === "finished") byRound[key].finished++;
  }

  const ROUND_ORDER = ["group_md1", "group_md2", "group_md3", "r32", "r16", "qf", "sf", "3rd", "final"];
  const closed = [];

  ROUND_ORDER.forEach(rKey => {
    const info = byRound[rKey];
    if (!info || info.total === 0) return;
    if (snapshotted.has(rKey)) return; // ya cerrada
    if (info.finished < info.total) return; // no todos terminados
    // ¡Todos terminados y sin snapshot → cerrar!
    Logger.log("🔒 Cerrando automáticamente jornada: " + rKey);
    closeRound(rKey);
    closed.push(rKey);

    // Generar la crónica con la IA de Gemini automáticamente
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const leaderboardGlobal = calcularLeaderboardEnBackend(ss);
      const leaderboardJornada = calcularLeaderboardEnBackend(ss, rKey);
      Logger.log("Auto-generando crónica de Gemini para " + rKey);
      generarCronicaConGemini(rKey, leaderboardGlobal, leaderboardJornada);
      Logger.log("✅ Crónica auto-generada con éxito.");
    } catch (e) {
      Logger.log("⚠️ No se pudo generar la crónica de Gemini automáticamente: " + e.message);
    }
  });

  Logger.log("detectAndCloseRounds: " + (closed.length > 0 ? "cerradas: " + closed.join(", ") : "nada que cerrar."));
  return closed;
}

// ---------------------------------------------------------------------------
// 6. syncAndUpdate() — función CRON principal (ejecutar cada 30 min)
// ---------------------------------------------------------------------------

function syncAndUpdate() {
  try {
    const updatedMatches  = updateResults();
    const updatedScorers  = updateScorers();
    const closedRounds    = detectAndCloseRounds();
    const summary = {
      matches_updated: updatedMatches,
      scorers_updated: updatedScorers,
      rounds_closed: closedRounds,
      timestamp: new Date().toISOString()
    };
    Logger.log("syncAndUpdate completo: " + JSON.stringify(summary));
    return summary;
  } catch (e) {
    Logger.log("❌ Error en syncAndUpdate: " + e.message);
    throw e;
  }
}

// ---------------------------------------------------------------------------
// 7. doGet(e) — ampliado (se añade al doGet existente o se combina)
// ---------------------------------------------------------------------------
// ⚠️ Si ya tienes un doGet en google-apps-script.gs, combina las acciones
//    en un único doGet. No puede haber dos funciones doGet en el mismo proyecto.
//
// Acciones nuevas:
//   ?action=refresh       → updateResults() + updateScorers() + detectAndCloseRounds()
//   ?action=closeRound&round=group_md1  → closeRound manual
//   ?action=syncMatchIds  → (solo uso manual/debug, proteger en producción)
//   ?action=ensureSchema  → crea columnas/hojas necesarias para resultados si faltan

function doGetResults(e) {
  const action = (e && e.parameter && e.parameter.action) || "";
  let result;

  try {
    if (action === "refresh") {
      result = syncAndUpdate();
    } else if (action === "closeRound") {
      const round = e.parameter.round;
      if (!round) throw new Error("Parámetro 'round' requerido.");
      closeRound(round);
      result = { closed: round, timestamp: new Date().toISOString() };
    } else if (action === "syncMatchIds") {
      // Proteger: solo ejecutar si se pasa un token admin extra (opcional)
      result = { message: syncMatchIds(), timestamp: new Date().toISOString() };
    } else if (action === "ensureSchema") {
      result = { schema: ensureResultsSchema(), timestamp: new Date().toISOString() };
    } else {
      throw new Error("Acción desconocida: " + action + ". Usar: refresh, closeRound, syncMatchIds, ensureSchema.");
    }
  } catch (err) {
    result = { error: err.message };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------------------
// INSTALACIÓN DEL TRIGGER — ejecutar ONCE a mano
// ---------------------------------------------------------------------------
// Ejecuta installTrigger() desde Apps Script > Ejecutar una vez para
// instalar el CRON de 30 minutos.

function installTrigger() {
  // Eliminar triggers previos de syncAndUpdate para evitar duplicados
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === "syncAndUpdate") ScriptApp.deleteTrigger(t);
  });

  ScriptApp.newTrigger("syncAndUpdate")
    .timeBased()
    .everyMinutes(10)
    .create();

  Logger.log("✅ Trigger instalado: syncAndUpdate cada 10 min.");
}

// ---------------------------------------------------------------------------
// Helper interno: calcular round_key desde phase + matchday
// ---------------------------------------------------------------------------

function _matchRoundKey(phase, matchday) {
  if (!phase) return null;
  const p = String(phase).trim().toLowerCase();
  if (p === "group") {
    const md = Number(matchday);
    if (!md || md < 1 || md > 3) return null;
    return "group_md" + md;
  }
  // Para knockout, phase ya es el round_key
  const validKeys = ["r32", "r16", "qf", "sf", "3rd", "final"];
  return validKeys.includes(p) ? p : null;
}
