// =============================================================================
// La Porra del Mundial — Actualización Automática de Resultados
// =============================================================================
// Pegar este código en el mismo proyecto de Apps Script que google-apps-script.gs
//
// CONFIGURACIÓN INICIAL:
//   1. Ve a Extensiones > Apps Script > ⚙️ Configuración del proyecto > Propiedades del script
//   2. Añade la propiedad: AF_TOKEN = <tu token de api-football.com>
//      Regístrate gratis en: https://www.api-football.com/
//   3. Ejecuta syncMatchIds() UNA vez a mano para emparejar partidos.
//   4. Instala el trigger de tiempo: syncAndUpdate() cada 10 min (smart trigger).
//
// PRESUPUESTO API: Smart trigger solo llama a la API durante partidos en vivo.
// ~60 req/día máximo en días de grupo. Límite free: 100 req/día. ✅
// =============================================================================

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------

function _getConfig() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty("AF_TOKEN");
  if (!token) throw new Error("AF_TOKEN no configurado. Ve a Propiedades del script y añade la clave AF_TOKEN.");
  return {
    token: token,
    base: "https://v3.football.api-sports.io",
    league: "1",
    season: "2026"
  };
}

function _getSheet(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error("Hoja '" + name + "' no encontrada. Verifica el nombre en tu Google Sheet.");
  return sheet;
}

function ensureResultsSchema() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var matches = _getSheet("matches");
  var matchHeaders = matches.getRange(1, 1, 1, matches.getLastColumn()).getValues()[0];
  if (matchHeaders.indexOf("api_id") === -1) {
    matches.getRange(1, matches.getLastColumn() + 1).setValue("api_id");
  }

  var players = _getSheet("players");
  var playerHeaders = players.getRange(1, 1, 1, players.getLastColumn()).getValues()[0];
  if (playerHeaders.indexOf("api_name") === -1) {
    var activeIdx = playerHeaders.indexOf("active");
    var insertCol = activeIdx === -1 ? players.getLastColumn() + 1 : activeIdx + 2;
    players.insertColumnBefore(insertCol);
    players.getRange(1, insertCol).setValue("api_name");
  }

  var snapshots = ss.getSheetByName("api_snapshots");
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

function _apiGet(endpoint) {
  var cfg = _getConfig();
  var url = cfg.base + endpoint;
  var resp = UrlFetchApp.fetch(url, {
    headers: { "x-apisports-key": cfg.token },
    muteHttpExceptions: true
  });
  var code = resp.getResponseCode();
  if (code !== 200) {
    throw new Error("API error " + code + " en " + url + ": " + resp.getContentText().slice(0, 200));
  }
  return JSON.parse(resp.getContentText());
}

// ---------------------------------------------------------------------------
// Helpers de normalización de nombres de equipos
// ---------------------------------------------------------------------------

// Mapa de alias API (inglés) → nombre en el Sheet (español/local)
var TEAM_ALIAS = {
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

function _superClean(name) {
  if (!name) return "";
  return name.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quitar acentos
    .replace(/[^a-z0-9]/g, "") // quitar todo lo que no sea letra o número
    .replace("and", "")
    .replace("y", "")
    .replace("islands", "") // quitar islands para Cape Verde Islands
    .replace("cabo", "cape")
    .replace("czechia", "czechrepublic")
    .replace("unitedstates", "usa")
    .replace("drcongo", "congodr")
    .replace("rdcongo", "congodr")
    .replace("democraticrepubliccongo", "congodr");
}

function _teamMatches(apiName, sheetName) {
  if (!apiName || !sheetName) return false;

  var cleanApi = _superClean(apiName);
  var cleanSheet = _superClean(sheetName);
  if (cleanApi === cleanSheet) return true;

  // Casos especiales directos
  if (apiName === "Bosnia and Herzegovina" && (cleanSheet === "bosnia" || cleanSheet === "bosniaherzegovina")) return true;
  if ((apiName === "Cape Verde Islands" || apiName === "Cabo Verde" || apiName === "Cape Verde") && 
      (cleanSheet === "capeverde" || cleanSheet === "caboverde")) return true;

  // Caso 2: Coincide el alias en español/inglés de TEAM_ALIAS
  var alias = TEAM_ALIAS[apiName];
  if (alias) {
    if (_superClean(alias) === cleanSheet) return true;
  }

  // Fallback antiguo
  var a = _normalizeTeam(apiName);
  var bNorm = sheetName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  return a === bNorm || TEAM_ALIAS[apiName] === sheetName;
}

// ---------------------------------------------------------------------------
// 1. syncMatchIds() — emparejar partidos API con filas del Sheet
// ---------------------------------------------------------------------------
// Ejecutar UNA sola vez a mano desde Apps Script > Ejecutar.
// Escribe el api_id (int) en la columna "api_id" de la hoja "matches".

function syncMatchIds() {
  var sheet = _getSheet("matches");
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var idxId = headers.indexOf("id");
  var idxHome = headers.indexOf("home_team");
  var idxAway = headers.indexOf("away_team");
  var idxKickoff = headers.indexOf("kickoff_utc");
  var idxApiId = headers.indexOf("api_id");

  if (idxApiId === -1) throw new Error("Columna 'api_id' no encontrada en hoja 'matches'. Añádela primero.");

  var cfg = _getConfig();
  var apiData = _apiGet("/fixtures?league=" + cfg.league + "&season=" + cfg.season);
  var apiMatches = apiData.response || [];

  var matched = 0, skipped = 0, unmatched = [];

  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    if (!row[idxId]) continue;
    if (row[idxApiId]) { skipped++; continue; } // ya tiene api_id

    var sheetHome = row[idxHome];
    var sheetAway = row[idxAway];
    var sheetKickoff = new Date(row[idxKickoff]).getTime();

    // Buscar el partido en la API: mismos equipos (con alias) y fecha ± 1 día
    var found = apiMatches.find(function(am) {
      var apiHome = am.teams && am.teams.home ? am.teams.home.name : "";
      var apiAway = am.teams && am.teams.away ? am.teams.away.name : "";
      var apiDate = new Date(am.fixture.date).getTime();
      var dateOk = Math.abs(apiDate - sheetKickoff) <= 86400000; // ±1 día
      return dateOk && _teamMatches(apiHome, sheetHome) && _teamMatches(apiAway, sheetAway);
    });

    if (found) {
      sheet.getRange(r + 1, idxApiId + 1).setValue(found.fixture.id);
      matched++;
      Logger.log("✅ " + row[idxId] + " → api_id " + found.fixture.id + " (" + sheetHome + " vs " + sheetAway + ")");
    } else {
      unmatched.push(row[idxId] + ": " + sheetHome + " vs " + sheetAway + " (" + row[idxKickoff] + ")");
    }
  }

  var summary = "syncMatchIds: " + matched + " emparejados, " + skipped + " ya tenían id, " + unmatched.length + " sin emparejar.";
  Logger.log(summary);
  if (unmatched.length > 0) {
    Logger.log("⚠️ Sin emparejar (revisar manualmente):\n" + unmatched.join("\n"));
  }
  return summary;
}

// ---------------------------------------------------------------------------
// 2. updateResults() — actualizar marcadores y estado de partidos
// ---------------------------------------------------------------------------
// CRON: cada 10 min (smart trigger). Solo escribe si hay cambios reales.

function updateResults() {
  var sheet = _getSheet("matches");
  var data = sheet.getDataRange().getValues();
  var headers = data[0];

  var idxApiId   = headers.indexOf("api_id");
  var idxHome    = headers.indexOf("home_score");
  var idxAway    = headers.indexOf("away_score");
  var idxStatus  = headers.indexOf("status");

  if (idxApiId === -1) throw new Error("Columna 'api_id' no encontrada.");

  var cfg = _getConfig();
  var apiData = _apiGet("/fixtures?league=" + cfg.league + "&season=" + cfg.season);
  var apiMap = {};
  (apiData.response || []).forEach(function(m) { apiMap[m.fixture.id] = m; });

  var updated = 0;

  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    var apiId = row[idxApiId];
    if (!apiId) continue;

    var currStatus = row[idxStatus];
    if (currStatus === "finished") continue;

    var am = apiMap[apiId];
    if (!am) continue;

    // Mapear estado API → estado local
    var newStatus;
    var st = (am.fixture.status.short || "").toUpperCase();
    if (st === "FT" || st === "AET" || st === "AWD") newStatus = "finished";
    else if (st === "1H" || st === "HT" || st === "2H" || st === "ET" || st === "P" || st === "PEN") newStatus = "live";
    else newStatus = "scheduled";

    var newHome = am.goals.home;
    var newAway = am.goals.away;

    // Si el partido empezó o finalizó pero los goles de la API son nulos,
    // significa que la API tiene datos incompletos. Omitimos esta actualización.
    if ((newStatus === "finished" || newStatus === "live") && (newHome === null || newAway === null)) {
      continue;
    }

    var currHome = row[idxHome];
    var currAway = row[idxAway];

    var hasChange = newStatus !== currStatus ||
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
  var matchSheet   = _getSheet("matches");
  var playerSheet  = _getSheet("players");
  var snapSheet    = _getSheet("api_snapshots");

  var matchData   = matchSheet.getDataRange().getValues();
  var playerData  = playerSheet.getDataRange().getValues();
  var snapData    = snapSheet.getDataRange().getValues();

  var mHeaders = matchData[0];
  var pHeaders = playerData[0];
  var sHeaders = snapData[0];

  var mIdxStatus  = mHeaders.indexOf("status");
  var mIdxApiId   = mHeaders.indexOf("api_id");
  var mIdxPhase   = mHeaders.indexOf("phase");
  var mIdxMd      = mHeaders.indexOf("matchday");

  var pIdxApiName = pHeaders.indexOf("api_name");
  var pIdxName    = pHeaders.indexOf("name");
  var pIdxTeam    = pHeaders.indexOf("team");
  var pIdxPos     = pHeaders.indexOf("position");

  // Determinar round_key actual: la última ronda con al menos 1 partido finished
  // y cuya siguiente ronda aún no ha empezado (ningún partido finished)
  var finishedRounds = new Set();
  for (var r = 1; r < matchData.length; r++) {
    var row = matchData[r];
    if ((row[mIdxStatus] || "").toLowerCase() === "finished") {
      var key = _matchRoundKey(row[mIdxPhase], row[mIdxMd]);
      if (key) finishedRounds.add(key);
    }
  }

  var ROUND_ORDER = ["group_md1", "group_md2", "group_md3", "r32", "r16", "qf", "sf", "3rd", "final"];
  var currentRound = null;
  for (var i = ROUND_ORDER.length - 1; i >= 0; i--) {
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
  var cfg = _getConfig();
  var scorersData = _apiGet("/players/topscorers?league=" + cfg.league + "&season=" + cfg.season);
  var apiScorers = scorersData.response || [];

  // Cargar snapshots previos: { player_api_name+round_key → goals_total }
  var snapMap = {};
  var sIdxRound  = sHeaders.indexOf("round_key");
  var sIdxPlayer = sHeaders.indexOf("player_api_name");
  var sIdxGoals  = sHeaders.indexOf("goals_total");
  for (var r = 1; r < snapData.length; r++) {
    var sRow = snapData[r];
    if (!sRow[sIdxRound] || !sRow[sIdxPlayer]) continue;
    var snapKey = sRow[sIdxRound] + "|" + sRow[sIdxPlayer];
    snapMap[snapKey] = Number(sRow[sIdxGoals]) || 0;
  }

  // Calcular índice de jornada anterior
  var currentIdx = ROUND_ORDER.indexOf(currentRound);
  var prevRound  = currentIdx > 0 ? ROUND_ORDER[currentIdx - 1] : null;

  // Buscar columna goals_<round> en players
  var goalsCol = "goals_" + currentRound;
  var pIdxGoals  = pHeaders.indexOf(goalsCol);
  if (pIdxGoals === -1) {
    Logger.log("⚠️ Columna '" + goalsCol + "' no existe en hoja players. Añádela y vuelve a ejecutar.");
    return 0;
  }

  var updated = 0;

  for (var r = 1; r < playerData.length; r++) {
    var pRow = playerData[r];
    var apiName = pRow[pIdxApiName] ? String(pRow[pIdxApiName]).trim() : "";
    var localName = pRow[pIdxName] ? String(pRow[pIdxName]).trim() : "";
    var team = pRow[pIdxTeam] ? String(pRow[pIdxTeam]).trim() : "";
    var pos = pRow[pIdxPos] ? String(pRow[pIdxPos]).trim().toLowerCase() : "";

    if (pos === "goalkeeper") continue; // porteros se calculan por encajados, no goles

    // Buscar en API: prioridad api_name; si está vacío, normalizar contra name
    var apiEntry = apiScorers.find(function(sc) {
      var n = sc.player && sc.player.name ? sc.player.name : "";
      if (apiName) return n === apiName;
      var normN = n.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      var normL = localName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return normN === normL;
    });

    if (!apiEntry) continue; // jugador no en ranking de goleadores aún → 0 goles (no sobreescribir)

    var totalGoals = Number(apiEntry.statistics[0].goals.total) || 0;
    var playerApiName = apiEntry.player.name;

    // Goles de esta jornada = acumulado − snapshot jornada anterior
    var prevKey = prevRound ? prevRound + "|" + playerApiName : null;
    var prevGoals = prevKey ? (snapMap[prevKey] || 0) : 0;
    var jornada = Math.max(0, totalGoals - prevGoals);

    var currVal = pRow[pIdxGoals];
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

  var matchSheet   = _getSheet("matches");
  var playerSheet  = _getSheet("players");
  var snapSheet    = _getSheet("api_snapshots");

  var matchData  = matchSheet.getDataRange().getValues();
  var playerData = playerSheet.getDataRange().getValues();
  var pHeaders   = playerData[0];
  var mHeaders   = matchData[0];

  // --- 1) Snapshot de goleadores ---
  var cfg = _getConfig();
  var scorersData = _apiGet("/players/topscorers?league=" + cfg.league + "&season=" + cfg.season);
  var apiScorers = scorersData.response || [];
  var takenAt = new Date().toISOString();

  var snapRows = apiScorers.map(function(sc) {
    return [
      roundKey,
      sc.player ? sc.player.name : "",
      Number(sc.statistics[0].goals.total) || 0,
      takenAt
    ];
  });

  if (snapRows.length > 0) {
    // Añadir filas al final de api_snapshots
    var lastRow = snapSheet.getLastRow();
    snapSheet.getRange(lastRow + 1, 1, snapRows.length, 4).setValues(snapRows);
    Logger.log("closeRound(" + roundKey + "): " + snapRows.length + " snapshots guardados.");
  }

  // --- 2) Goles encajados por portero ---
  // Lógica: para cada portero activo, sumar goles en contra de su equipo
  // en los partidos finished de esta jornada.
  var mIdxStatus  = mHeaders.indexOf("status");
  var mIdxPhase   = mHeaders.indexOf("phase");
  var mIdxMd      = mHeaders.indexOf("matchday");
  var mIdxHome    = mHeaders.indexOf("home_team");
  var mIdxAway    = mHeaders.indexOf("away_team");
  var mIdxHScore  = mHeaders.indexOf("home_score");
  var mIdxAScore  = mHeaders.indexOf("away_score");

  // Filtrar partidos de esta jornada terminados
  var roundMatches = [];
  for (var r = 1; r < matchData.length; r++) {
    var row = matchData[r];
    var matchKey = _matchRoundKey(row[mIdxPhase], row[mIdxMd]);
    if (matchKey === roundKey && (row[mIdxStatus] || "").toLowerCase() === "finished") {
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
  var concededByTeam = {};
  roundMatches.forEach(function(m) {
    concededByTeam[m.home] = (concededByTeam[m.home] || 0) + m.awayScore;
    concededByTeam[m.away] = (concededByTeam[m.away] || 0) + m.homeScore;
  });

  // Columna conceded_<roundKey> en players
  var concededCol = "conceded_" + roundKey;
  var pIdxConceded = pHeaders.indexOf(concededCol);
  if (pIdxConceded === -1) {
    Logger.log("⚠️ Columna '" + concededCol + "' no existe en hoja players.");
    return;
  }

  var pIdxPos  = pHeaders.indexOf("position");
  var pIdxTeam = pHeaders.indexOf("team");
  var pIdxActive = pHeaders.indexOf("active");

  var gkUpdated = 0;
  for (var r = 1; r < playerData.length; r++) {
    var pRow = playerData[r];
    var pos    = String(pRow[pIdxPos] || "").trim().toLowerCase();
    var active = String(pRow[pIdxActive] || "").trim().toLowerCase();
    if (pos !== "goalkeeper") continue;
    if (active !== "true" && active !== "1") continue;

    var team = String(pRow[pIdxTeam] || "").trim();
    var conceded = concededByTeam[team] !== undefined ? concededByTeam[team] : null;
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
  var matchSheet = _getSheet("matches");
  var snapSheet  = _getSheet("api_snapshots");

  var matchData = matchSheet.getDataRange().getValues();
  var snapData  = snapSheet.getDataRange().getValues();
  var mHeaders  = matchData[0];
  var sHeaders  = snapData[0];

  var mIdxStatus = mHeaders.indexOf("status");
  var mIdxPhase  = mHeaders.indexOf("phase");
  var mIdxMd     = mHeaders.indexOf("matchday");
  var sIdxRound  = sHeaders.indexOf("round_key");

  // Jornadas que ya tienen snapshot
  var snapshotted = new Set();
  for (var r = 1; r < snapData.length; r++) {
    if (snapData[r][sIdxRound]) snapshotted.add(String(snapData[r][sIdxRound]).trim());
  }

  // Agrupar partidos por round_key
  var byRound = {};
  for (var r = 1; r < matchData.length; r++) {
    var row = matchData[r];
    var key = _matchRoundKey(row[mIdxPhase], row[mIdxMd]);
    if (!key) continue;
    if (!byRound[key]) byRound[key] = { total: 0, finished: 0 };
    byRound[key].total++;
    if ((row[mIdxStatus] || "").toLowerCase() === "finished") byRound[key].finished++;
  }

  var ROUND_ORDER = ["group_md1", "group_md2", "group_md3", "r32", "r16", "qf", "sf", "3rd", "final"];
  var closed = [];

  ROUND_ORDER.forEach(function(rKey) {
    var info = byRound[rKey];
    if (!info || info.total === 0) return;
    if (snapshotted.has(rKey)) return; // ya cerrada
    if (info.finished < info.total) return; // no todos terminados
    // ¡Todos terminados y sin snapshot → cerrar!
    Logger.log("🔒 Cerrando automáticamente jornada: " + rKey);
    closeRound(rKey);
    closed.push(rKey);

    // Generar la crónica con la IA de Gemini automáticamente
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var leaderboardGlobal = calcularLeaderboardEnBackend(ss);
      var leaderboardJornada = calcularLeaderboardEnBackend(ss, rKey);
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
// 6. syncAndUpdate() — función CRON principal (ejecutar cada 10 min)
// ---------------------------------------------------------------------------
// Smart trigger: solo consume API si hay partidos en ventana de juego.

function syncAndUpdate() {
  try {
    // --- Smart trigger guard: verificar si hay partidos en ventana live ---
    var matchSheet = _getSheet("matches");
    var matchData = matchSheet.getDataRange().getValues();
    var mHeaders = matchData[0];
    var mIdxKickoff = mHeaders.indexOf("kickoff_utc");
    var mIdxStatus  = mHeaders.indexOf("status");

    var now = new Date().getTime();
    var hasLiveWindow = false;
    var hasRecentFinish = false;

    for (var r = 1; r < matchData.length; r++) {
      var row = matchData[r];
      var status = (row[mIdxStatus] || "").toLowerCase();
      var kickoff = row[mIdxKickoff] ? new Date(row[mIdxKickoff]).getTime() : 0;

      // Partido en ventana live: now >= kickoff AND now <= kickoff + 180 min
      if (kickoff && now >= kickoff && now <= kickoff + 180 * 60 * 1000) {
        if (status !== "finished") {
          hasLiveWindow = true;
          break;
        }
      }

      // Partido recién terminado: status=finished y ahora <= kickoff + 210 min (30 min extra)
      if (status === "finished" && kickoff && now <= kickoff + 210 * 60 * 1000 && now >= kickoff) {
        hasRecentFinish = true;
      }
    }

    if (!hasLiveWindow && !hasRecentFinish) {
      Logger.log("⏸️ Sin partidos en juego. Saltando actualización para ahorrar cuota API.");
      return { skipped: true, reason: "no_live_matches", timestamp: new Date().toISOString() };
    }

    var updatedMatches  = updateResults();
    var updatedScorers  = updateScorers();
    var closedRounds    = detectAndCloseRounds();
    var summary = {
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
  var action = (e && e.parameter && e.parameter.action) || "";
  var result;

  try {
    if (action === "refresh") {
      result = syncAndUpdate();
    } else if (action === "closeRound") {
      var round = e.parameter.round;
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
// instalar el smart trigger de 10 minutos. Solo consume API cuando hay
// partidos en ventana de juego.

function installTrigger() {
  // Eliminar triggers previos de syncAndUpdate para evitar duplicados
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === "syncAndUpdate") ScriptApp.deleteTrigger(t);
  });

  ScriptApp.newTrigger("syncAndUpdate")
    .timeBased()
    .everyMinutes(10)
    .create();

  Logger.log("✅ Trigger instalado: syncAndUpdate cada 10 min (smart trigger — solo consume API con partidos en juego).");
}

// ---------------------------------------------------------------------------
// Helper interno: calcular round_key desde phase + matchday
// ---------------------------------------------------------------------------

function _matchRoundKey(phase, matchday) {
  if (!phase) return null;
  var p = String(phase).trim().toLowerCase();
  if (p === "group") {
    var md = Number(matchday);
    if (!md || md < 1 || md > 3) return null;
    return "group_md" + md;
  }
  // Para knockout, phase ya es el round_key
  var validKeys = ["r32", "r16", "qf", "sf", "3rd", "final"];
  return validKeys.includes(p) ? p : null;
}
