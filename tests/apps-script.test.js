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
          ["m002", "group", "A", "1", "Jornada 1", "México", "Colombia", "2026-06-11T21:00:00Z", "", "", "scheduled", "FALSE", ""]
        ]
      ),
      "players": new MockSheet("players",
        ["id", "name", "team", "position", "active", "api_name", "goals_group_md1", "conceded_group_md1"],
        [
          ["pl01", "Mbappé", "France", "outfield", "TRUE", "Kylian Mbappé", "", ""],
          ["pl02", "Courtois", "Belgium", "goalkeeper", "TRUE", "Thibaut Courtois", "", ""],
          ["pl03", "Camilo Vargas", "Colombia", "goalkeeper", "TRUE", "", "", ""]
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
    const route = url.replace("https://api.football-data.org/v4", "");
    const resp = this._responses[route];
    if (!resp) {
      return {
        getResponseCode() { return 404; },
        getContentText() { return "Route not mocked: " + route; }
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
assert.equal(context._normalizeTeam("Côte d'Ivoire"), "cote d'ivoire");

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
// Mockear respuesta API de partidos
mockUrlFetch._responses["/competitions/WC/matches"] = {
  matches: [
    {
      id: 2001,
      utcDate: "2026-06-11T18:15:00Z", // ±1 día
      homeTeam: { name: "USA" },
      awayTeam: { name: "Morocco" },
      status: "SCHEDULED"
    },
    {
      id: 2002,
      utcDate: "2026-06-11T21:00:00Z",
      homeTeam: { name: "Mexico" },
      awayTeam: { name: "Colombia" },
      status: "SCHEDULED"
    }
  ]
};

// Sincronizar
context.syncMatchIds();

// Verificar que se escribieron los api_id correctos
const matchesSheet = mockSS.getSheetByName("matches");
const matchesData = matchesSheet.getDataRange().getValues();
assert.equal(matchesData[1][12], 2001); // m001 -> api_id 2001
assert.equal(matchesData[2][12], 2002); // m002 -> api_id 2002

// 5. updateResults (actualización marcadores)
// Modificar respuesta de la API simulando un partido en vivo y uno terminado
mockUrlFetch._responses["/competitions/WC/matches"] = {
  matches: [
    {
      id: 2001,
      utcDate: "2026-06-11T18:15:00Z",
      homeTeam: { name: "USA" },
      awayTeam: { name: "Morocco" },
      score: { fullTime: { home: 3, away: 1 } },
      status: "FINISHED"
    },
    {
      id: 2002,
      utcDate: "2026-06-11T21:00:00Z",
      homeTeam: { name: "Mexico" },
      awayTeam: { name: "Colombia" },
      score: { fullTime: { home: 1, away: 1 } },
      status: "IN_PLAY"
    }
  ]
};

context.updateResults();

// Verificar actualización en la hoja
const matchesDataUpdated = matchesSheet.getDataRange().getValues();
assert.equal(matchesDataUpdated[1][8], 3);          // m001 home score = 3
assert.equal(matchesDataUpdated[1][9], 1);          // m001 away score = 1
assert.equal(matchesDataUpdated[1][10], "finished"); // m001 status = finished

assert.equal(matchesDataUpdated[2][8], 1);          // m002 home score = 1
assert.equal(matchesDataUpdated[2][9], 1);          // m002 away score = 1
assert.equal(matchesDataUpdated[2][10], "live");    // m002 status = live

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

console.log("apps-script.test.js: OK");
