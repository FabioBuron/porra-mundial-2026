const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Cargar el código de apps-script-results.gs en contexto virtual
const root = path.resolve(__dirname, "..");
const scriptContent = fs.readFileSync(path.join(root, "apps-script-results.gs"), "utf8");

// Mock de las clases globales de Google Apps Script
class MockRange {
  constructor(values, sheet, startRow, startCol, numRows, numCols) {
    this._values = values; // Matriz de valores del Sheet
    this._sheet = sheet;
    this._startRow = startRow;
    this._startCol = startCol;
    this._numRows = numRows;
    this._numCols = numCols;
  }
  getValues() {
    // Devolver submatriz
    const rows = [];
    for (let r = 0; r < this._numRows; r++) {
      const row = [];
      for (let c = 0; c < this._numCols; c++) {
        row.push(this._values[this._startRow - 1 + r][this._startCol - 1 + c]);
      }
      rows.push(row);
    }
    return rows;
  }
  setValue(val) {
    this._sheet._setValue(this._startRow, this._startCol, val);
    return this;
  }
  setValues(matrix) {
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        this._sheet._setValue(this._startRow + r, this._startCol + c, matrix[r][c]);
      }
    }
    return this;
  }
}

class MockSheet {
  constructor(name, headers, initialRows = []) {
    this._name = name;
    this._rows = [headers, ...initialRows];
  }
  getName() { return this._name; }
  getLastColumn() { return this._rows[0].length; }
  getLastRow() { return this._rows.length; }
  getDataRange() {
    return new MockRange(this._rows, this, 1, 1, this.getLastRow(), this.getLastColumn());
  }
  getRange(row, col, numRows = 1, numCols = 1) {
    return new MockRange(this._rows, this, row, col, numRows, numCols);
  }
  appendRow(rowValues) {
    this._rows.push(rowValues);
  }
  insertColumnBefore(colIndex) {
    this._rows.forEach(r => {
      r.splice(colIndex - 1, 0, "");
    });
  }
  _setValue(row, col, val) {
    // Expandir matriz si es necesario
    while (this._rows.length < row) {
      this._rows.push(new Array(this._rows[0] ? this._rows[0].length : 1).fill(""));
    }
    while (this._rows[row - 1].length < col) {
      this._rows[row - 1].push("");
    }
    this._rows[row - 1][col - 1] = val;
  }
}

class MockSpreadsheet {
  constructor() {
    this._sheets = {
      "matches": new MockSheet("matches", 
        ["id", "phase", "group", "matchday", "round_label", "home_team", "away_team", "kickoff_utc", "home_score", "away_score", "status", "is_double_points", "api_id"],
        [
          ["m001", "group", "A", "1", "Jornada 1", "USA", "Marruecos", "2026-06-11T18:00:00Z", "", "", "scheduled", "FALSE", ""],
          ["m002", "group", "A", "1", "Jornada 1", "México", "Colombia", "2026-06-11T21:00:00Z", "", "", "scheduled", "FALSE", ""],
          ["m003", "group", "A", "2", "Jornada 2", "Francia", "Bélgica", "2026-06-15T18:00:00Z", "", "", "scheduled", "FALSE", ""],
          ["m004", "group", "A", "2", "Jornada 2", "Colombia", "USA", "2026-06-15T21:00:00Z", "", "", "scheduled", "FALSE", ""]
        ]
      ),
      "players": new MockSheet("players",
        ["id", "name", "team", "position", "active", "api_name", "goals_group_md1", "conceded_group_md1", "goals_group_md2", "conceded_group_md2"],
        [
          ["pl01", "Mbappé", "Francia", "outfield", "TRUE", "Kylian Mbappé", "", "", "", ""],
          ["pl02", "Courtois", "Bélgica", "goalkeeper", "TRUE", "Thibaut Courtois", "", "", "", ""],
          ["pl03", "Camilo Vargas", "Colombia", "goalkeeper", "TRUE", "", "", "", "", ""]
        ]
      ),
      "api_snapshots": new MockSheet("api_snapshots", ["round_key", "player_api_name", "goals_total", "taken_at"], [])
    };
  }
  getSheetByName(name) {
    return this._sheets[name] || null;
  }
  insertSheet(name) {
    this._sheets[name] = new MockSheet(name, [], []);
    return this._sheets[name];
  }
}

// Mocks globales de Apps Script
const mockSS = new MockSpreadsheet();
const mockProperties = { "FD_TOKEN": "test-token" };
const mockUrlFetch = {
  _responses: {},
  fetch(url, options) {
    let route = url.replace("https://api.football-data.org/v4", "");
    route = route.replace("https://worldcup26.ir", "");
    const resp = this._responses[route];
    if (!resp) {
      return {
        getResponseCode() { return 404; },
        getContentText() { return "Route not mocked: " + route + " (original: " + url + ")"; }
      };
    }
    return {
      getResponseCode() { return 200; },
      getContentText() { return JSON.stringify(resp); }
    };
  }
};

const context = {
  console,
  Math,
  Date,
  parseInt,
  parseFloat,
  isNaN,
  Array,
  Logger: {
    log(msg) { console.log("   [AppsScript Logger]", msg); }
  },
  SpreadsheetApp: {
    getActiveSpreadsheet() { return mockSS; }
  },
  CacheService: {
    getScriptCache() {
      return {
        get(key) { return null; },
        put(key, value, expirationInSeconds) {}
      };
    }
  },
  PropertiesService: {
    getScriptProperties() {
      return {
        getProperty(key) { return mockProperties[key] || null; }
      };
    }
  },
  UrlFetchApp: mockUrlFetch,
  ScriptApp: {
    getProjectTriggers() { return []; },
    deleteTrigger() {},
    newTrigger() {
      return {
        timeBased() {
          return {
            everyMinutes() {
              return {
                create() {}
              };
            }
          };
        }
      };
    }
  }
};

vm.createContext(context);
vm.runInContext(scriptContent, context);

// =============================================================================
// TESTS DE LOGICA
// =============================================================================

// 1. Normalización de nombres de equipos
assert.equal(context._normalizeTeam("Spain"), "españa");
assert.equal(context._normalizeTeam("Valparaíso"), "valparaiso");

// 2. Matching de nombres
assert.equal(context._teamMatches("Spain", "España"), true);
assert.equal(context._teamMatches("Netherlands", "Países Bajos"), true);
assert.equal(context._teamMatches("France", "Francia"), true);
assert.equal(context._teamMatches("Germany", "Alemania"), true);
assert.equal(context._teamMatches("USA", "USA"), true);

// 3. ensureResultsSchema
const schemaResult = context.ensureResultsSchema();
assert.equal(schemaResult.matches_has_api_id, true);
assert.equal(schemaResult.players_has_api_name, true);
assert.equal(schemaResult.api_snapshots_exists, true);

// 4. syncMatchIds (vinculación)
// Mockear respuesta API de partidos y equipos de worldcup26.ir
mockUrlFetch._responses["/get/teams"] = [
  { id: 1, name_en: "USA", fifa_code: "USA" },
  { id: 2, name_en: "Morocco", fifa_code: "MAR" },
  { id: 3, name_en: "Mexico", fifa_code: "MEX" },
  { id: 4, name_en: "Colombia", fifa_code: "COL" },
  { id: 5, name_en: "France", fifa_code: "FRA" },
  { id: 6, name_en: "Belgium", fifa_code: "BEL" }
];

mockUrlFetch._responses["/get/games"] = [
  { id: 2001, home_team_id: 1, away_team_id: 2, matchday: 1, finished: "FALSE", time_elapsed: "notstarted" },
  { id: 2002, home_team_id: 3, away_team_id: 4, matchday: 1, finished: "FALSE", time_elapsed: "notstarted" },
  { id: 2003, home_team_id: 5, away_team_id: 6, matchday: 2, finished: "FALSE", time_elapsed: "notstarted" },
  { id: 2004, home_team_id: 4, away_team_id: 1, matchday: 2, finished: "FALSE", time_elapsed: "notstarted" }
];

// Sincronizar
context.syncMatchIds();

// Verificar que se escribieron los api_id correctos
const matchesSheet = mockSS.getSheetByName("matches");
const matchesData = matchesSheet.getDataRange().getValues();
assert.equal(matchesData[1][12], 2001); // m001 -> api_id 2001
assert.equal(matchesData[2][12], 2002); // m002 -> api_id 2002
assert.equal(matchesData[3][12], 2003); // m003 -> api_id 2003
assert.equal(matchesData[4][12], 2004); // m004 -> api_id 2004

// 5. updateResults (actualización marcadores)
// Modificar respuesta de la API simulando un partido en vivo y uno terminado
// Para la Jornada 1, los partidos de la Jornada 2 (2003 y 2004) están programados (SCHEDULED)
mockUrlFetch._responses["/get/games"] = [
  { id: 2001, home_team_id: 1, away_team_id: 2, matchday: 1, home_score: 3, away_score: 1, finished: "TRUE", time_elapsed: "null" },
  { id: 2002, home_team_id: 3, away_team_id: 4, matchday: 1, home_score: 1, away_score: 1, finished: "FALSE", time_elapsed: "45" },
  { id: 2003, home_team_id: 5, away_team_id: 6, matchday: 2, finished: "FALSE", time_elapsed: "notstarted" },
  { id: 2004, home_team_id: 4, away_team_id: 1, matchday: 2, finished: "FALSE", time_elapsed: "notstarted" }
];

context.updateResults();

// Verificar actualización en la hoja
const matchesDataUpdated = matchesSheet.getDataRange().getValues();
assert.equal(matchesDataUpdated[1][8], 3);          // m001 home score = 3
assert.equal(matchesDataUpdated[1][9], 1);          // m001 away score = 1
assert.equal(matchesDataUpdated[1][10], "finished"); // m001 status = finished

assert.equal(matchesDataUpdated[2][8], 1);          // m002 home score = 1
assert.equal(matchesDataUpdated[2][9], 1);          // m002 away score = 1
assert.equal(matchesDataUpdated[2][10], "live");    // m002 status = live

assert.equal(matchesDataUpdated[3][8], "");          // m003 home score = vacio
assert.equal(matchesDataUpdated[3][9], "");          // m003 away score = vacio
assert.equal(matchesDataUpdated[3][10], "scheduled"); // m003 status = scheduled

assert.equal(matchesDataUpdated[4][8], "");          // m004 home score = vacio
assert.equal(matchesDataUpdated[4][9], "");          // m004 away score = vacio
assert.equal(matchesDataUpdated[4][10], "scheduled"); // m004 status = scheduled

// 6. updateScorers (goleadores acumulados)
// Mockear respuesta API de goleadores
mockUrlFetch._responses["/competitions/WC/scorers?limit=200"] = {
  scorers: [
    {
      player: { name: "Kylian Mbappé" },
      team: { name: "France" },
      goals: 4 // total acumulado en la API
    }
  ]
};

// Si no hay snapshots previos de Mbappé, goles en MD1 = 4
context.updateScorers();

const playersSheet = mockSS.getSheetByName("players");
let playersData = playersSheet.getDataRange().getValues();
assert.equal(playersData[1][6], 4); // pl01 goals_group_md1 = 4

// 7. closeRound (cierre de ronda: guarda snapshot y calcula encajados de portero)
// En nuestra base de datos, los partidos terminados de la jornada son m001 (USA 3 - 1 Morocco) y m002 (Mexico 1 - 1 Colombia).
// Colombia jugó un partido en MD1 (m002) y encajó 1 gol.
// Camilo Vargas (portero de Colombia, pl03) debe tener conceded_group_md1 = 1 gol.

// Marcamos m002 como finished para que compute
matchesSheet.getRange(3, 11).setValue("finished"); // row 3 is m002, col 11 is status

context.closeRound("group_md1");

// Verificar que se guardó el snapshot
const snapshotSheet = mockSS.getSheetByName("api_snapshots");
const snapshots = snapshotSheet.getDataRange().getValues();
assert.equal(snapshots[1][0], "group_md1");
assert.equal(snapshots[1][1], "Kylian Mbappé");
assert.equal(snapshots[1][2], 4);

// Verificar los conceded del portero
playersData = playersSheet.getDataRange().getValues();
assert.equal(playersData[3][7], 1); // pl03 (Camilo Vargas, Colombia) conceded_group_md1 = 1 gol

// =============================================================================
// TESTS ADICIONALES EXHAUSTIVOS: Jornada 2 (group_md2) y verificación de puntos
// =============================================================================
console.log("Iniciando pruebas de Jornada 2 e integración de puntos...");

// 1. Simular finalización de los partidos de la Jornada 2 en la API y ejecutamos updateResults
mockUrlFetch._responses["/get/games"] = [
  { id: 2001, home_team_id: 1, away_team_id: 2, matchday: 1, home_score: 3, away_score: 1, finished: "TRUE", time_elapsed: "null" },
  { id: 2002, home_team_id: 3, away_team_id: 4, matchday: 1, home_score: 1, away_score: 1, finished: "TRUE", time_elapsed: "null" },
  { id: 2003, home_team_id: 5, away_team_id: 6, matchday: 2, home_score: 3, away_score: 2, finished: "TRUE", time_elapsed: "null" },
  { id: 2004, home_team_id: 4, away_team_id: 1, matchday: 2, home_score: 0, away_score: 0, finished: "TRUE", time_elapsed: "null" }
];

context.updateResults();

// Simular goles de la API para la Jornada 2
// Mbappé tiene ahora 6 goles (tenía 4 en la Jornada 1).
// Harry Kane entra con 2 goles en el ranking.
mockUrlFetch._responses["/competitions/WC/scorers?limit=200"] = {
  scorers: [
    {
      player: { name: "Kylian Mbappé" },
      team: { name: "France" },
      goals: 6
    },
    {
      player: { name: "Harry Kane" },
      team: { name: "England" },
      goals: 2
    }
  ]
};

// Añadir a Harry Kane a la hoja de players
playersSheet.appendRow(["pl04", "Kane", "England", "outfield", "TRUE", "Harry Kane", "", "", "", ""]);

// Antes de updateScorers(), necesitamos que la jornada actual detectada sea group_md2.
// Para ello, todos los partidos de group_md1 y al menos 1 de group_md2 deben estar terminados.
// Marcamos m002 como finished (para terminar de cerrar la J1)
matchesSheet.getRange(3, 11).setValue("finished");
context.updateScorers();

playersData = playersSheet.getDataRange().getValues();
// Mbappé (pl01, index 1) goals_group_md2 debe ser 6 - 4 = 2 goles en J2
assert.equal(playersData[1][8], 2); 
// Kane (pl04, index 4) goals_group_md2 debe ser 2 - 0 = 2 goles en J2
assert.equal(playersData[4][8], 2);

// 2. Cerrar la Jornada 2 y verificar porteros
// En group_md2:
// - Francia 3 - 2 Bélgica (Bélgica encajó 3 goles, por tanto Courtois [pl02] encajó 3 goles)
// - Colombia 0 - 0 USA (Colombia encajó 0 goles, por tanto Camilo Vargas [pl03] encajó 0 goles)
context.closeRound("group_md2");

// Verificar snapshots de la J2
const snapshotSheetJ2 = mockSS.getSheetByName("api_snapshots");
const snapshotsJ2 = snapshotSheetJ2.getDataRange().getValues();
const mbappeSnapJ2 = snapshotsJ2.find(s => s[0] === "group_md2" && s[1] === "Kylian Mbappé");
const kaneSnapJ2 = snapshotsJ2.find(s => s[0] === "group_md2" && s[1] === "Harry Kane");
assert.ok(mbappeSnapJ2);
assert.equal(mbappeSnapJ2[2], 6);
assert.ok(kaneSnapJ2);
assert.equal(kaneSnapJ2[2], 2);

// Verificar los conceded del portero en J2
playersData = playersSheet.getDataRange().getValues();
// Courtois (pl02, Bélgica, index 2) conceded_group_md2 = 3 goles
assert.equal(playersData[2][9], 3);
// Camilo Vargas (pl03, Colombia, index 3) conceded_group_md2 = 0 goles
assert.equal(playersData[3][9], 0);

// 3. Verificación de cálculo de puntos en scoring.js (simulado en el contexto)
const scoringContent = fs.readFileSync(path.join(root, "scoring.js"), "utf8");
vm.runInContext(`${scoringContent}\nthis.Scoring = Scoring;`, context);
const IntegrationScoring = context.Scoring;

// A) Puntos de Goleador
// Mbappé metió 4 goles en J1 y 2 en J2. Sus puntos por jornada deben ser 4 y 2 respectivamente.
assert.equal(IntegrationScoring.calculateScorerPoints(playersData[1][6]), 4); // J1
assert.equal(IntegrationScoring.calculateScorerPoints(playersData[1][8]), 2); // J2
// Kane metió 2 goles en J2. Sus puntos en J2 deben ser 2.
assert.equal(IntegrationScoring.calculateScorerPoints(playersData[4][8]), 2);

// B) Puntos de Portero
// J1: Camilo Vargas encajó 1 gol. Puntos = 1 pt.
assert.equal(IntegrationScoring.calculateGoalkeeperPoints([playersData[3][7]]), 1);
// J2: Courtois encajó 3 goles. Puntos = -1 pt. (2 - 3 = -1)
assert.equal(IntegrationScoring.calculateGoalkeeperPoints([playersData[2][9]]), -1);
// J2: Camilo Vargas encajó 0 goles. Puntos = 2 pts.
assert.equal(IntegrationScoring.calculateGoalkeeperPoints([playersData[3][9]]), 2);

console.log("Pruebas de Jornada 2 e integración de puntos: OK");

// =============================================================================
// TEST: syncAllPlayerNames
// =============================================================================
console.log("Iniciando pruebas de syncAllPlayerNames...");

// Mockear la respuesta de los equipos y plantillas en la API
mockUrlFetch._responses["/competitions/WC/teams"] = {
  teams: [
    {
      name: "Colombia",
      squad: [
        { name: "Camilo Vargas" }
      ]
    },
    {
      name: "France",
      squad: [
        { name: "Kylian Mbappé" }
      ]
    }
  ]
};

// Camilo Vargas (pl03) no tiene api_name en playersSheet.
// Llamemos a syncAllPlayerNames
const syncAllMsg = context.syncAllPlayerNames();
console.log("   syncAllPlayerNames msg:", syncAllMsg);

// Verificar que se haya rellenado el api_name de Camilo Vargas (pl03, index 3 de playersData)
const playersDataAfterSyncAll = playersSheet.getDataRange().getValues();
assert.equal(playersDataAfterSyncAll[3][5], "Camilo Vargas"); // pl03 api_name = Camilo Vargas

console.log("Prueba de syncAllPlayerNames: OK");

// =============================================================================
// TEST: _playerNameMatches (Fuzzy/Aproximado)
// =============================================================================
console.log("Iniciando pruebas de matching difuso de nombres de jugadores...");

assert.equal(context._playerNameMatches("Lionel Messi", "Lionel Andrés Messi Cuccittini"), true);
assert.equal(context._playerNameMatches("Emiliano Martínez", "Damián Emiliano Martínez"), true);
assert.equal(context._playerNameMatches("Casemiro", "Carlos Henrique Casimiro"), true);
assert.equal(context._playerNameMatches("Léo Pereira", "Leonardo Pereira"), true);
assert.equal(context._playerNameMatches("Vinicius Junior", "Vinícius José Paixão de Oliveira Júnior"), true);
assert.equal(context._playerNameMatches("Rayan Aït Nouri", "Rayan Aït-Nouri"), true);
assert.equal(context._playerNameMatches("Fares Chaïbi", "Farès Chaïbi"), true);
assert.equal(context._playerNameMatches("Edin Džeko", "Edin Dzeko"), true);
assert.equal(context._playerNameMatches("de Paul", "Rodrigo de Paul"), true);
assert.equal(context._playerNameMatches("Mbappé", "Kylian Mbappé"), true);

// Nuevos casos específicos agregados para el algoritmo optimizado
assert.equal(context._playerNameMatches("Abdelatif Ramdane", "Abdellatif Ramdane"), true);
assert.equal(context._playerNameMatches("Osman Hadzikic", "Osman Hadžikić"), true);
assert.equal(context._playerNameMatches("Alexander Sorloth", "Alexander Sørloth"), true);
assert.equal(context._playerNameMatches("Jorgen ⁠Strand Larsen", "Jørgen Strand Larsen"), true); // Con U+2060
assert.equal(context._playerNameMatches("Martin Odegaard", "Martin Ødegaard"), true);
assert.equal(context._playerNameMatches("Altay Bayindir", "Altay Bayındır"), true);
assert.equal(context._playerNameMatches("Ferdi Kadioglu", "Ferdi Kadıoğlu"), true);
assert.equal(context._playerNameMatches("Abde Ezzalzouli", "Abdessamad Ezzalzouli"), true);
assert.equal(context._playerNameMatches("Arjany Martha", "Arjany Jainel Archenir Martha"), true);
assert.equal(context._playerNameMatches("Kendry Páez", "Ray Kendry Páez Andrade"), true);
assert.equal(context._playerNameMatches("Andy Robertson", "Andrew Robertson"), true);
assert.equal(context._playerNameMatches("Billy Gilmour", "Billy Clifford Gilmour"), true);
assert.equal(context._playerNameMatches("Tino Livramento", "Valentino Livramento"), true);
assert.equal(context._playerNameMatches("Matt Garbett", "Matthew Garbett"), true);
assert.equal(context._playerNameMatches("Alisson", "Alisson Becker"), true);
assert.equal(context._playerNameMatches("Ederson Moraes", "Ederson"), true);
assert.equal(context._playerNameMatches("Gavi", "Pablo Gavira"), true);
assert.equal(context._playerNameMatches("Mohamed Amine Tougaï", "Amine Tougai"), true);
assert.equal(context._playerNameMatches("Anis Hadj-Moussa", "Anis Moussa"), true);
assert.equal(context._playerNameMatches("Mohamed Amine Amoura", "Mohammed Amoura"), true);
assert.equal(context._playerNameMatches("Juan Fernando Quintero", "Juan Quintero"), true);
assert.equal(context._playerNameMatches("João Paulo Fernandes", "João Paulo"), true);
assert.equal(context._playerNameMatches("Nabil Emad Dunga", "Nabil Dunga"), true);

console.log("Pruebas de matching difuso de jugadores: OK");
console.log("apps-script.test.js: OK");
