// =============================================================================
// La Porra del Mundial — Actualización Automática de Resultados
// =============================================================================
// Pegar este código en el mismo proyecto de Apps Script que google-apps-script.gs
//
// FUENTES DE DATOS (híbrido):
//   • Resultados/marcadores y estado de partidos → worldcup26.ir
//       Repo: https://github.com/rezarahiminia/worldcup2026 · Docs: https://worldcup26.ir/api-docs/
//   • Goleadores (Módulo 2, top scorers) → football-data.org
//       Docs: https://www.football-data.org/documentation/quickstart (competición WC)
//     Se usa football-data.org para los goleadores porque worldcup26.ir no los expone.
//
// CONFIGURACIÓN INICIAL (Extensiones > Apps Script > ⚙️ Configuración > Propiedades del script):
//   worldcup26.ir (resultados): las rutas /get/* son PÚBLICAS (sin JWT), así que
//       normalmente NO necesitas configurar nada. Solo si en el futuro exigieran
//       token: WC_TOKEN, o bien WC_EMAIL + WC_PASSWORD (se autentica solo).
//       (Opcional WC_API_BASE para cambiar la base, por defecto https://worldcup26.ir)
//   football-data.org (goleadores): FD_TOKEN = <tu token de football-data.org>
//       (gratis en https://www.football-data.org/client/register; plan TIER ONE
//       incluye el Mundial). Opcional FD_COMPETITION (def. WC).
//
//   Después: ejecuta syncMatchIds() UNA vez y luego installTrigger() (cron 10 min).
//   La columna api_name de "players" se RELLENA SOLA cuando un jugador marca
//   (updateScorers aprende el nombre exacto). Si quieres adelantarlo a mano,
//   ejecuta syncPlayerNames() cuando ya haya goles (empareja por nombre los que
//   han marcado).
// =============================================================================

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------

function _getConfig() {
  const props = PropertiesService.getScriptProperties();
  return {
    base: (props.getProperty("WC_API_BASE") || "https://worldcup26.ir").replace(/\/+$/, ""),
    token: props.getProperty("WC_TOKEN") || "",
    email: props.getProperty("WC_EMAIL") || "",
    password: props.getProperty("WC_PASSWORD") || "",
    // --- football-data.org — solo para GOLEADORES (top scorers) ---
    // Resultados/marcadores siguen viniendo de worldcup26.ir; los goleadores de
    // aquí porque worldcup26.ir no los expone. Necesita un token propio gratuito
    // (https://www.football-data.org/client/register) en la propiedad FD_TOKEN.
    // El plan gratuito (TIER ONE) incluye el Mundial (competición WC).
    fdBase: "https://api.football-data.org/v4",
    fdToken: props.getProperty("FD_TOKEN") || "",
    fdCompetition: props.getProperty("FD_COMPETITION") || "WC"
  };
}

// Obtiene un token JWT válido: usa WC_TOKEN si existe; si no, intenta
// autenticarse con WC_EMAIL/WC_PASSWORD y cachea el token resultante 12h.
// Devuelve "" si no hay credenciales (se intentará lectura anónima).
function _wcToken() {
  const cfg = _getConfig();
  if (cfg.token) return cfg.token;
  if (!cfg.email || !cfg.password) return "";

  const cache = CacheService.getScriptCache();
  const cached = cache.get("WC_JWT");
  if (cached) return cached;

  const resp = UrlFetchApp.fetch(cfg.base + "/auth/authenticate", {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ email: cfg.email, password: cfg.password }),
    muteHttpExceptions: true
  });
  if (resp.getResponseCode() !== 200) {
    throw new Error("Autenticación worldcup26.ir falló (" + resp.getResponseCode() + "): " + resp.getContentText().slice(0, 200));
  }
  const token = JSON.parse(resp.getContentText()).token;
  if (token) cache.put("WC_JWT", token, 12 * 3600); // 12h
  return token || "";
}

// GET genérico contra worldcup26.ir con Bearer opcional.
function _apiGet(path) {
  const cfg = _getConfig();
  const headers = { "Accept": "application/json" };
  const token = _wcToken();
  if (token) headers["Authorization"] = "Bearer " + token;

  const url = cfg.base + path;
  const resp = UrlFetchApp.fetch(url, { headers: headers, muteHttpExceptions: true });
  const code = resp.getResponseCode();
  if (code !== 200) {
    throw new Error("API error " + code + " en " + url + ": " + resp.getContentText().slice(0, 200));
  }
  return JSON.parse(resp.getContentText());
}

// Normaliza respuestas que pueden venir como array directo o envueltas.
function _asArray(json) {
  if (Array.isArray(json)) return json;
  if (!json || typeof json !== "object") return [];
  var keys = ["data", "games", "matches", "teams", "result", "results", "items"];
  for (var i = 0; i < keys.length; i++) {
    if (Array.isArray(json[keys[i]])) return json[keys[i]];
  }
  return [];
}

// Lista de partidos (104). Cada uno: { id, home_team_id, away_team_id,
// home_score, away_score, group, matchday, local_date, finished, type, ... }
function _wcGames() {
  return _asArray(_apiGet("/get/games"));
}

// Mapa { String(teamId) → name_en } para emparejar contra los nombres del Sheet.
function _wcTeamNameMap() {
  var teams = _asArray(_apiGet("/get/teams"));
  var map = {};
  teams.forEach(function (t) {
    if (t && t.id !== undefined) map[String(t.id)] = t.name_en || t.fifa_code || "";
  });
  return map;
}

// Estado local ("finished" | "live" | "scheduled") a partir de un partido de la API.
// Esquema real de worldcup26.ir: finished="TRUE"/"FALSE" (string), time_elapsed="notstarted".
function _wcStatus(game) {
  var fin = String(game.finished).trim().toLowerCase();
  if (fin === "true" || fin === "1" || fin === "yes") return "finished";
  var status = String(game.status || game.state || "").toLowerCase();
  if (status.indexOf("finish") !== -1) return "finished";
  var te = String(game.time_elapsed || "").trim().toLowerCase();
  if (te && te !== "notstarted" && te !== "not started" && te !== "null") return "live";
  if (status.indexOf("live") !== -1 || status.indexOf("play") !== -1 || status.indexOf("progress") !== -1) return "live";
  if (game.live === true || game.is_live === true) return "live";
  return "scheduled";
}

// --- Goleadores vía football-data.org -----------------------------------------
// worldcup26.ir no expone goleadores, así que para el Módulo 2 usamos el endpoint
// /competitions/WC/scorers de football-data.org. Devuelve el ranking ACUMULADO
// del torneo: [{ name, goals }]. Se cachea 30 min porque el plan gratuito limita
// las peticiones (10/min) y el ranking se actualiza despacio.
function _fdGet(path) {
  const cfg = _getConfig();
  if (!cfg.fdToken) {
    throw new Error("FD_TOKEN no configurado. Añádelo en Propiedades del script (token de football-data.org).");
  }
  const url = cfg.fdBase + path.replace("{comp}", cfg.fdCompetition);
  const resp = UrlFetchApp.fetch(url, {
    headers: { "X-Auth-Token": cfg.fdToken },
    muteHttpExceptions: true
  });
  const code = resp.getResponseCode();
  if (code !== 200) {
    throw new Error("football-data error " + code + " en " + url + ": " + resp.getContentText().slice(0, 200));
  }
  return JSON.parse(resp.getContentText());
}

function _fdScorers() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get("FD_SCORERS");
  if (cached) {
    try { return JSON.parse(cached); } catch (e) {}
  }

  const json = _fdGet("/competitions/{comp}/scorers?limit=200");
  const rows = (json && json.scorers) || [];
  const scorers = rows.map(function (sc) {
    var name = (sc.player && sc.player.name) ? sc.player.name : "";
    // En v4 "goals" es un número; toleramos también el formato antiguo {scored}.
    var goals = Number(sc.goals && typeof sc.goals === "object" ? sc.goals.scored : sc.goals) || 0;
    return { name: name, goals: goals };
  }).filter(function (s) { return s.name; });

  try { cache.put("FD_SCORERS", JSON.stringify(scorers), 1800); } catch (e) {} // 30 min
  return scorers;
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

  const cleanApi = _superClean(apiName);
  const cleanSheet = _superClean(sheetName);
  if (cleanApi === cleanSheet) return true;

  // Casos especiales directos
  if (apiName === "Bosnia and Herzegovina" && (cleanSheet === "bosnia" || cleanSheet === "bosniaherzegovina")) return true;
  if ((apiName === "Cape Verde Islands" || apiName === "Cabo Verde" || apiName === "Cape Verde") && 
      (cleanSheet === "capeverde" || cleanSheet === "caboverde")) return true;

  // Caso 2: Coincide el alias en español/inglés de TEAM_ALIAS
  const alias = TEAM_ALIAS[apiName];
  if (alias) {
    if (_superClean(alias) === cleanSheet) return true;
  }

  // Fallback antiguo
  const a = _normalizeTeam(apiName);
  const bNorm = sheetName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
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
  const idxMd = headers.indexOf("matchday");
  const idxApiId = headers.indexOf("api_id");

  if (idxApiId === -1) throw new Error("Columna 'api_id' no encontrada en hoja 'matches'. Añádela primero.");

  const games = _wcGames();
  const teamName = _wcTeamNameMap(); // { teamId → name_en }

  let matched = 0, skipped = 0, unmatched = [];

  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    if (!row[idxId]) continue;
    if (row[idxApiId]) { skipped++; continue; } // ya tiene api_id

    const sheetHome = row[idxHome];
    const sheetAway = row[idxAway];
    const sheetMd = idxMd !== -1 ? String(row[idxMd]).trim() : "";

    // La API solo da local_date (sin hora exacta), así que emparejamos por
    // equipos (con alias) y, como desempate, por jornada (matchday) si existe.
    const candidates = games.filter(g => {
      const apiHome = teamName[String(g.home_team_id)] || "";
      const apiAway = teamName[String(g.away_team_id)] || "";
      return _teamMatches(apiHome, sheetHome) && _teamMatches(apiAway, sheetAway);
    });

    let found = null;
    if (candidates.length === 1) {
      found = candidates[0];
    } else if (candidates.length > 1 && sheetMd) {
      found = candidates.find(g => String(g.matchday).trim() === sheetMd) || null;
    }

    if (found) {
      sheet.getRange(r + 1, idxApiId + 1).setValue(found.id);
      matched++;
      Logger.log("✅ " + row[idxId] + " → api_id " + found.id + " (" + sheetHome + " vs " + sheetAway + ")");
    } else {
      unmatched.push(row[idxId] + ": " + sheetHome + " vs " + sheetAway +
        (candidates.length > 1 ? " (ambiguo: " + candidates.length + " candidatos)" : ""));
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
// 1bis. syncPlayerNames() — rellenar api_name en la hoja "players"
// ---------------------------------------------------------------------------
// Análogo a syncMatchIds, pero para JUGADORES: empareja cada fila de "players"
// con el nombre EXACTO que usa football-data.org y lo escribe en la columna
// api_name (para que el cálculo de goleadores acierte sin tocarlo a mano).
//
// Fuente: /competitions/WC/scorers (la única lista de jugadores con nombre exacto
// disponible en football-data). Por eso SOLO empareja jugadores que YA han marcado;
// el resto se irá rellenando a medida que marquen (no pasa nada: el módulo goleador
// solo actúa cuando un jugador anota, y updateScorers ya hace match por nombre
// normalizado como respaldo). Puedes reejecutarla cuando quieras; respeta los
// api_name ya rellenados.

function _playerNameNorm(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // quitar acentos
    .replace(/[^a-z0-9\s]/g, " ")                     // quitar puntuación
    .replace(/\s+/g, " ")
    .trim();
}

// True si dos nombres de jugador coinciden (igual normalizado, o mismas palabras
// en distinto orden — p.ej. nombres coreanos "In-beom Hwang" vs "Hwang In-beom").
function _playerNameMatches(a, b) {
  var na = _playerNameNorm(a), nb = _playerNameNorm(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  var ta = na.split(" ").sort().join(" ");
  var tb = nb.split(" ").sort().join(" ");
  return ta === tb;
}

function syncPlayerNames() {
  const sheet = _getSheet("players");
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idxName    = headers.indexOf("name");
  const idxTeam    = headers.indexOf("team");
  const idxApiName = headers.indexOf("api_name");

  if (idxName === -1) throw new Error("Columna 'name' no encontrada en hoja 'players'.");
  if (idxApiName === -1) throw new Error("Columna 'api_name' no encontrada en hoja 'players'. Añádela primero (o ejecuta ensureResultsSchema()).");

  // Lista de jugadores con nombre exacto + equipo desde football-data.org.
  var json = _fdGet("/competitions/{comp}/scorers?limit=200");
  var apiPlayers = ((json && json.scorers) || []).map(function (sc) {
    return {
      name: (sc.player && sc.player.name) ? sc.player.name : "",
      team: (sc.team && sc.team.name) ? sc.team.name : ""
    };
  }).filter(function (p) { return p.name; });

  if (apiPlayers.length === 0) {
    Logger.log("syncPlayerNames: la API aún no devuelve goleadores (nadie ha marcado todavía). Vuelve a ejecutar cuando haya goles.");
    return "syncPlayerNames: 0 goleadores en la API por ahora.";
  }

  var matched = 0, already = 0, unmatched = [];

  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    var localName = row[idxName] ? String(row[idxName]).trim() : "";
    if (!localName) continue;
    if (String(row[idxApiName]).trim() !== "") { already++; continue; } // ya tiene api_name

    var localTeam = idxTeam !== -1 ? String(row[idxTeam]).trim() : "";

    // 1) nombre coincide Y (mismo equipo o equipo desconocido)
    var found = apiPlayers.find(function (ap) {
      return _playerNameMatches(ap.name, localName) &&
             (!localTeam || !ap.team || _teamMatches(ap.team, localTeam));
    });
    // 2) si no, solo por nombre
    if (!found) {
      found = apiPlayers.find(function (ap) { return _playerNameMatches(ap.name, localName); });
    }

    if (found) {
      sheet.getRange(r + 1, idxApiName + 1).setValue(found.name);
      matched++;
      Logger.log("✅ " + localName + " → api_name '" + found.name + "'" + (found.team ? " (" + found.team + ")" : ""));
    } else {
      unmatched.push(localName + (localTeam ? " (" + localTeam + ")" : ""));
    }
  }

  var summary = "syncPlayerNames: " + matched + " emparejados, " + already + " ya tenían api_name, " + unmatched.length + " sin emparejar.";
  Logger.log(summary);
  if (unmatched.length > 0) {
    Logger.log("ℹ️ Sin emparejar (aún no han marcado o el nombre difiere; se completarán al marcar o ponlos a mano):\n" + unmatched.join("\n"));
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

  const apiData = _wcGames();
  const apiMap = {};
  apiData.forEach(m => { apiMap[String(m.id)] = m; });

  let updated = 0;

  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    const apiId = row[idxApiId];
    if (apiId === "" || apiId === null || apiId === undefined) continue;

    const currStatus = row[idxStatus];
    if (currStatus === "finished") continue;

    const am = apiMap[String(apiId)];
    if (!am) continue;

    // Estado local a partir del partido de worldcup26.ir.
    const newStatus = _wcStatus(am);

    // OJO: en worldcup26.ir los marcadores son strings con valor por defecto "0",
    // así que un partido no jugado llega como 0-0. No debemos escribir ese 0-0
    // en la hoja: solo actualizamos partidos en juego o finalizados.
    if (newStatus === "scheduled") continue;

    const rawHome = am.home_score;
    const rawAway = am.away_score;
    const newHome = (rawHome === null || rawHome === undefined || rawHome === "") ? null : Number(rawHome);
    const newAway = (rawAway === null || rawAway === undefined || rawAway === "") ? null : Number(rawAway);

    // Si el partido empezó o finalizó pero los goles de la API son nulos,
    // significa que la API tiene datos incompletos. Omitimos esta actualización.
    if ((newStatus === "finished" || newStatus === "live") && (newHome === null || newAway === null)) {
      continue;
    }

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
  const mIdxPhase   = mHeaders.indexOf("phase");
  const mIdxMd      = mHeaders.indexOf("matchday");

  const pIdxApiName = pHeaders.indexOf("api_name");
  const pIdxName    = pHeaders.indexOf("name");
  const pIdxTeam    = pHeaders.indexOf("team");
  const pIdxPos     = pHeaders.indexOf("position");

  // Determinar round_key actual: la última ronda con al menos 1 partido finished.
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
    if (finishedRounds.has(ROUND_ORDER[i])) { currentRound = ROUND_ORDER[i]; break; }
  }
  if (!currentRound) {
    Logger.log("updateScorers: no hay jornadas terminadas aún.");
    return 0;
  }

  // Ranking ACUMULADO de goleadores (football-data.org). [{ name, goals }]
  let apiScorers;
  try {
    apiScorers = _fdScorers();
  } catch (e) {
    Logger.log("updateScorers: no se pudo leer goleadores de football-data.org (" + e.message + "). Se omite.");
    return 0;
  }

  // Snapshots previos: { round_key|player_name → goals_total }
  const snapMap = {};
  const sIdxRound  = sHeaders.indexOf("round_key");
  const sIdxPlayer = sHeaders.indexOf("player_api_name");
  const sIdxGoals  = sHeaders.indexOf("goals_total");
  for (let r = 1; r < snapData.length; r++) {
    const sRow = snapData[r];
    if (!sRow[sIdxRound] || !sRow[sIdxPlayer]) continue;
    snapMap[sRow[sIdxRound] + "|" + sRow[sIdxPlayer]] = Number(sRow[sIdxGoals]) || 0;
  }

  const currentIdx = ROUND_ORDER.indexOf(currentRound);
  const prevRound  = currentIdx > 0 ? ROUND_ORDER[currentIdx - 1] : null;

  const goalsCol = "goals_" + currentRound;
  const pIdxGoals = pHeaders.indexOf(goalsCol);
  if (pIdxGoals === -1) {
    Logger.log("⚠️ Columna '" + goalsCol + "' no existe en hoja players. Añádela y vuelve a ejecutar.");
    return 0;
  }

  function _norm(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  }

  let updated = 0;
  for (let r = 1; r < playerData.length; r++) {
    const pRow = playerData[r];
    const apiName   = pRow[pIdxApiName] ? String(pRow[pIdxApiName]).trim() : "";
    const localName = pRow[pIdxName] ? String(pRow[pIdxName]).trim() : "";
    const team = pRow[pIdxTeam] ? String(pRow[pIdxTeam]).trim() : "";
    const pos  = pRow[pIdxPos] ? String(pRow[pIdxPos]).trim().toLowerCase() : "";
    if (pos === "goalkeeper") continue; // los porteros se calculan por encajados

    // Buscar en el ranking: prioridad api_name exacto; si no, nombre normalizado.
    const apiEntry = apiScorers.find(function (sc) {
      if (apiName) return sc.name === apiName;
      return _norm(sc.name) === _norm(localName);
    });
    if (!apiEntry) continue; // todavía sin goles en el torneo → no sobreescribir

    const totalGoals = Number(apiEntry.goals) || 0;
    const playerApiName = apiEntry.name;

    // Auto-aprendizaje: si el jugador se emparejó por nombre normalizado y la
    // celda api_name estaba vacía, la rellenamos con el nombre exacto de la API.
    // Así api_name se completa solo, sin tener que ejecutar syncPlayerNames().
    if (pIdxApiName !== -1 && !apiName && playerApiName) {
      playerSheet.getRange(r + 1, pIdxApiName + 1).setValue(playerApiName);
    }

    // Goles de ESTA jornada = acumulado − snapshot de la jornada anterior.
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

  // --- 1) Snapshot de goleadores (football-data.org) ---
  // Guarda el acumulado de goles por jugador al cierre de la jornada. Sirve para
  // calcular los goles incrementales de la jornada siguiente y marca la jornada
  // como cerrada para detectAndCloseRounds(). Si falla la API, escribimos una
  // fila marcadora para no reprocesar la jornada en bucle.
  const takenAt = new Date().toISOString();
  let scorerSnapRows = [];
  try {
    scorerSnapRows = _fdScorers().map(function (sc) {
      return [roundKey, sc.name, Number(sc.goals) || 0, takenAt];
    });
  } catch (e) {
    Logger.log("closeRound(" + roundKey + "): no se pudo leer goleadores de football-data.org (" + e.message + ").");
  }
  const snapRows = scorerSnapRows.length > 0
    ? scorerSnapRows
    : [[roundKey, "__round_closed__", 0, takenAt]];

  if (snapRows.length > 0) {
    // Añadir filas al final de api_snapshots
    const lastRow = snapSheet.getLastRow();
    snapSheet.getRange(lastRow + 1, 1, snapRows.length, 4).setValues(snapRows);
    Logger.log("closeRound(" + roundKey + "): " + snapRows.length + " filas de snapshot guardadas.");
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
//   ?action=refresh        → updateResults() + updateScorers() + detectAndCloseRounds()
//   ?action=closeRound&round=group_md1  → closeRound manual
//   ?action=syncMatchIds   → (solo uso manual/debug, proteger en producción)
//   ?action=syncPlayerNames → rellena api_name en la hoja players (manual/debug)
//   ?action=ensureSchema   → crea columnas/hojas necesarias para resultados si faltan

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
    } else if (action === "syncPlayerNames") {
      result = { message: syncPlayerNames(), timestamp: new Date().toISOString() };
    } else if (action === "adminOverride") {
      result = adminOverrideFromParams(e.parameter);
    } else if (action === "ensureSchema") {
      result = { schema: ensureResultsSchema(), timestamp: new Date().toISOString() };
    } else {
      throw new Error("Acción desconocida: " + action + ". Usar: refresh, closeRound, syncMatchIds, syncPlayerNames, adminOverride, ensureSchema.");
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

function testApiConnection() {
  try {
    const games = _wcGames();
    Logger.log("worldcup26.ir OK — " + games.length + " partidos recibidos.");
    if (games.length > 0) Logger.log("Ejemplo partido: " + JSON.stringify(games[0], null, 2));
    const teams = _wcTeamNameMap();
    Logger.log("Equipos recibidos: " + Object.keys(teams).length);
  } catch (err) {
    Logger.log("Error conectando con worldcup26.ir: " + err.toString());
  }
  try {
    const scorers = _fdScorers();
    Logger.log("football-data.org goleadores OK — " + scorers.length + " jugadores.");
    if (scorers.length > 0) Logger.log("Top goleador: " + JSON.stringify(scorers[0]));
  } catch (err) {
    Logger.log("Error conectando con football-data.org (goleadores): " + err.toString());
  }
}
