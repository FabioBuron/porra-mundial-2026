const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Cargar el código de google-apps-script.gs en un contexto virtual
const root = path.resolve(__dirname, "..");
const scriptContent = fs.readFileSync(path.join(root, "google-apps-script.gs"), "utf8");

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
    const rows = [];
    for (let r = 0; r < this._numRows; r++) {
      const row = [];
      for (let c = 0; c < this._numCols; c++) {
        const val = this._values[this._startRow - 1 + r] 
          ? this._values[this._startRow - 1 + r][this._startCol - 1 + c]
          : undefined;
        row.push(val !== undefined ? val : "");
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
  clear() { this._rows = []; }
  getLastColumn() { return this._rows[0] ? this._rows[0].length : 1; }
  getLastRow() { return this._rows.length; }
  getDataRange() {
    return new MockRange(this._rows, this, 1, 1, this.getLastRow(), this.getLastColumn());
  }
  getRange(row, col, numRows = 1, numCols = 1) {
    return new MockRange(this._rows, this, row, col, numRows, numCols);
  }
  appendRow(rowValues) {
    // Rellenar si faltan valores con respecto a cabecera
    const targetLength = this.getLastColumn();
    const row = [...rowValues];
    while (row.length < targetLength) row.push("");
    this._rows.push(row);
  }
  _setValue(row, col, val) {
    while (this._rows.length < row) {
      this._rows.push(new Array(this.getLastColumn()).fill(""));
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
      "participants": new MockSheet("participants",
        ["id", "name", "password"],
        [
          ["part01", "Fabio", "pass123"],
          ["part02", "Invitado", ""] // Sin contraseña
        ]
      ),
      "matches": new MockSheet("matches",
        ["id", "phase", "matchday", "kickoff_utc", "status"],
        [
          ["m001", "group", "1", "2026-06-11T18:00:00Z", "scheduled"],
          ["m002", "group", "1", "2026-06-11T21:00:00Z", "live"],
          ["m003", "group", "1", "2026-06-11T23:50:00Z", "finished"]
        ]
      ),
      "match_predictions": new MockSheet("match_predictions",
        ["participant_id", "match_id", "predicted_home", "predicted_away", "submitted_at", "points_earned"]
      ),
      "scorer_picks": new MockSheet("scorer_picks",
        ["participant_id", "round_key", "player_id", "submitted_at", "deadline_utc", "points_earned"]
      ),
      "goalkeeper_picks": new MockSheet("goalkeeper_picks",
        ["participant_id", "round_key", "player_id", "submitted_at", "deadline_utc", "points_earned"]
      ),
      "special_events": new MockSheet("special_events",
        ["id", "is_active", "deadline_utc"],
        [
          ["ev01", "TRUE", "2026-06-12T00:00:00Z"],
          ["ev02", "FALSE", "2026-06-12T00:00:00Z"],
          ["ev03", "TRUE", "2026-06-09T00:00:00Z"] // Ya pasó (deadline expirado)
        ]
      ),
      "special_event_picks": new MockSheet("special_event_picks",
        ["participant_id", "event_id", "pick_value", "submitted_at", "points_earned"]
      ),
      "Respuestas de formulario 1": new MockSheet("Respuestas de formulario 1",
        ["Timestamp", "Borrador"]
      )
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

const mockSS = new MockSpreadsheet();

let lastUrlFetchUrl = null;
let lastUrlFetchPayload = null;

const mockUrlFetch = {
  fetch(url, options) {
    lastUrlFetchUrl = url;
    if (options && options.payload) {
      lastUrlFetchPayload = JSON.parse(options.payload);
    }
    
    const responseData = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  titular: "CARLOS REINA EN LA JORNADA",
                  subtitulo: "Javi y Maria andan llorando.",
                  cronica: "Carlos ha destrozado a todos en esta jornada.\n\nEn la general sigue liderando.",
                  noticias_secundarias: [
                    { titular: "LLUVIA DE PALILLOS", resumen: "Se agotan los palillos en los bares." }
                  ]
                })
              }
            ]
          }
        }
      ]
    };
    
    return {
      getResponseCode() { return 200; },
      getContentText() { return JSON.stringify(responseData); }
    };
  }
};

const mockProperties = {
  getScriptProperties() {
    return {
      getProperty(key) {
        if (key === "GEMINI_API_KEY") return "test-api-key";
        return null;
      }
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
    log(msg) { /* console.log("[Logger]", msg); */ }
  },
  SpreadsheetApp: {
    getActiveSpreadsheet() { return mockSS; }
  },
  PropertiesService: mockProperties,
  UrlFetchApp: mockUrlFetch,
  ContentService: {
    MimeType: { JSON: "JSON", TEXT: "TEXT" },
    createTextOutput(content) {
      let _mimeType = null;
      return {
        setMimeType(mime) {
          _mimeType = mime;
          return this;
        },
        getContent() { return content; },
        getMimeType() { return _mimeType; }
      };
    }
  }
};

vm.createContext(context);
vm.runInContext(scriptContent, context);

// =============================================================================
// TESTS
// =============================================================================

console.log("Iniciando pruebas de google-apps-script.gs...");

// 1. Test processSaveRequest con contraseña válida y registro de contraseña nueva
// -----------------------------------------------------------------------------
// Intentar entrar con contraseña incorrecta para part01
assert.throws(() => {
  context.processSaveRequest({
    participantId: "part01",
    password: "wrong_password",
    type: "predictions",
    data: []
  });
}, /Contraseña incorrecta o participante no válido/);

// Registrar contraseña nueva para part02 (Invitado) que no tenía contraseña
const resultNewPass = context.processSaveRequest({
  participantId: "part02",
  password: "mypassword",
  type: "predictions",
  data: []
});
assert.match(resultNewPass, /Guardadas 0 predicciones/);

// Verificar que se guardó en la hoja de participantes
const partSheet = mockSS.getSheetByName("participants");
const partValues = partSheet.getDataRange().getValues();
assert.equal(partValues[2][2], "mypassword"); // Invitado -> password = mypassword

// Ahora con contraseña correcta
const resultCorrectPass = context.processSaveRequest({
  participantId: "part01",
  password: "pass123",
  type: "predictions",
  data: []
});
assert.match(resultCorrectPass, /Guardadas 0 predicciones/);


// 2. Test savePredictions y plazos / deadlines
// -----------------------------------------------------------------------------
const nowMock = new Date("2026-06-11T12:00:00Z"); // Antes de los partidos

// m001 es programado, a las 18:00. Guardar predicción válida.
const resultSavePred = context.savePredictions(mockSS, "part01", [
  { matchId: "m001", predictedHome: 2, predictedAway: 1 }
], nowMock);
assert.equal(resultSavePred, "Guardadas 1 predicciones");

const predSheet = mockSS.getSheetByName("match_predictions");
let predValues = predSheet.getDataRange().getValues();
assert.equal(predValues[1][0], "part01");
assert.equal(predValues[1][1], "m001");
assert.equal(predValues[1][2], 2);
assert.equal(predValues[1][3], 1);

// Modificar predicción existente antes del plazo
context.savePredictions(mockSS, "part01", [
  { matchId: "m001", predictedHome: 3, predictedAway: 0 }
], nowMock);
predValues = predSheet.getDataRange().getValues();
assert.equal(predValues[1][2], 3); // Debería haber cambiado a 3
assert.equal(predValues[1][3], 0); // Debería haber cambiado a 0

// Intentar guardar predicción en partido en vivo (m002)
assert.throws(() => {
  context.savePredictions(mockSS, "part01", [
    { matchId: "m002", predictedHome: 1, predictedAway: 1 }
  ], nowMock);
}, /El partido m002 ya ha comenzado o finalizado/);

// Intentar guardar predicción en partido finalizado (m003)
assert.throws(() => {
  context.savePredictions(mockSS, "part01", [
    { matchId: "m003", predictedHome: 0, predictedAway: 2 }
  ], nowMock);
}, /El partido m003 ya ha comenzado o finalizado/);

// Intentar guardar predicción tras el kickoff (nowMock tarde, ej: 18:30)
const nowMockLate = new Date("2026-06-11T18:30:00Z");
assert.throws(() => {
  context.savePredictions(mockSS, "part01", [
    { matchId: "m001", predictedHome: 1, predictedAway: 1 }
  ], nowMockLate);
}, /El plazo para el partido m001 ha vencido/);


// 3. Test saveScorerPick y saveGoalkeeperPick
// -----------------------------------------------------------------------------
// Guardar goleador antes de deadline
const nowPicksMock = new Date("2026-06-10T12:00:00Z");
const resultScorer = context.saveScorerPick(mockSS, "part01", {
  roundKey: "group_md1",
  playerId: "pl01",
  deadlineUtc: "2026-06-11T18:00:00Z"
}, nowPicksMock);
assert.equal(resultScorer, "Goleador guardado con éxito");

const scorerSheet = mockSS.getSheetByName("scorer_picks");
let scorerValues = scorerSheet.getDataRange().getValues();
assert.equal(scorerValues[1][0], "part01");
assert.equal(scorerValues[1][1], "group_md1");
assert.equal(scorerValues[1][2], "pl01");

// Modificar goleador antes del deadline
context.saveScorerPick(mockSS, "part01", {
  roundKey: "group_md1",
  playerId: "pl05",
  deadlineUtc: "2026-06-11T18:00:00Z"
}, nowPicksMock);
scorerValues = scorerSheet.getDataRange().getValues();
assert.equal(scorerValues[1][2], "pl05");

// Intentar guardar goleador habiendo vencido el plazo
assert.throws(() => {
  context.saveScorerPick(mockSS, "part01", {
    roundKey: "group_md1",
    playerId: "pl01",
    deadlineUtc: "2026-06-11T18:00:00Z"
  }, nowMockLate);
}, /El plazo para elegir goleador en esta ronda ha vencido/);


// 4. Test saveSpecialEventPick
// -----------------------------------------------------------------------------
const nowSpecialMock = new Date("2026-06-10T12:00:00Z");

// ev01 está activo y plazo correcto
const resultEvent = context.saveSpecialEventPick(mockSS, "part01", {
  eventId: "ev01",
  pickValue: "España ganará"
}, nowSpecialMock);
assert.equal(resultEvent, "Elección de evento especial guardada con éxito");

const eventPickSheet = mockSS.getSheetByName("special_event_picks");
let eventPickValues = eventPickSheet.getDataRange().getValues();
assert.equal(eventPickValues[1][0], "part01");
assert.equal(eventPickValues[1][1], "ev01");
assert.equal(eventPickValues[1][2], "España ganará");

// Intentar guardar en evento inactivo (ev02)
assert.throws(() => {
  context.saveSpecialEventPick(mockSS, "part01", {
    eventId: "ev02",
    pickValue: "Cualquier cosa"
  }, nowSpecialMock);
}, /El evento ev02 no está activo/);

// Intentar guardar en evento activo pero plazo expirado (ev03)
assert.throws(() => {
  context.saveSpecialEventPick(mockSS, "part01", {
    eventId: "ev03",
    pickValue: "Cualquier cosa"
  }, nowSpecialMock);
}, /El plazo del evento ev03 ha vencido/);


// 5. Test processDraft (Borrador completo)
// -----------------------------------------------------------------------------
const draftPayload = {
  name: "Fabio",
  password: "pass123",
  type: "draft",
  matchPredictions: {
    "m001": { home: 1, away: 2 }
  },
  scorerPicks: {
    "group_md1": "pl01"
  },
  goalkeeperPicks: {
    "group_md1": "pl02"
  },
  specialEventPicks: {
    "ev01": "Semifinalista Alemania"
  }
};

// Limpiamos las tablas del mock para validar inserciones limpias
mockSS._sheets["match_predictions"] = new MockSheet("match_predictions",
  ["participant_id", "match_id", "predicted_home", "predicted_away", "submitted_at", "points_earned"]
);
mockSS._sheets["scorer_picks"] = new MockSheet("scorer_picks",
  ["participant_id", "round_key", "player_id", "submitted_at", "deadline_utc", "points_earned"]
);
mockSS._sheets["goalkeeper_picks"] = new MockSheet("goalkeeper_picks",
  ["participant_id", "round_key", "player_id", "submitted_at", "deadline_utc", "points_earned"]
);
mockSS._sheets["special_event_picks"] = new MockSheet("special_event_picks",
  ["participant_id", "event_id", "pick_value", "submitted_at", "points_earned"]
);
mockSS._sheets["Respuestas de formulario 1"] = new MockSheet("Respuestas de formulario 1",
  ["Timestamp", "Borrador"]
);

context.processSaveRequest(draftPayload);

// Validaciones
assert.equal(mockSS.getSheetByName("match_predictions").getDataRange().getValues()[1][2], 1); // predicted_home = 1
assert.equal(mockSS.getSheetByName("scorer_picks").getDataRange().getValues()[1][2], "pl01"); // scorer pl01
assert.equal(mockSS.getSheetByName("goalkeeper_picks").getDataRange().getValues()[1][2], "pl02"); // goalkeeper pl02
assert.equal(mockSS.getSheetByName("special_event_picks").getDataRange().getValues()[1][2], "Semifinalista Alemania");

// Verificar que se guardó en Respuestas de formulario 1
const respValues = mockSS.getSheetByName("Respuestas de formulario 1").getDataRange().getValues();
assert.equal(respValues.length, 2); // cabecera + fila borrador
const parsedBorrador = JSON.parse(respValues[1][1]);
assert.equal(parsedBorrador.name, "Fabio");


// 6. Test doPost
// -----------------------------------------------------------------------------
const mockPostEvent = {
  postData: {
    contents: JSON.stringify(draftPayload)
  }
};

const postResultTextOutput = context.doPost(mockPostEvent);
const parsedPostResult = JSON.parse(postResultTextOutput.getContent());
assert.equal(parsedPostResult.success, true);
assert.equal(parsedPostResult.result, "Borrador completo procesado con éxito");


// 7. Test doPost con errores
// -----------------------------------------------------------------------------
const mockPostEventWrongPass = {
  postData: {
    contents: JSON.stringify({
      ...draftPayload,
      password: "incorrect_password"
    })
  }
};

const postResultError = context.doPost(mockPostEventWrongPass);
const parsedPostError = JSON.parse(postResultError.getContent());
assert.equal(parsedPostError.success, false);
assert.match(parsedPostError.error, /Contraseña incorrecta para el participante/);

// 8. Test generarCronicaConGemini (Simulación real con rendimiento de jornada y general)
// -----------------------------------------------------------------------------
console.log("Iniciando pruebas de generarCronicaConGemini con IA...");

// Limpiamos las variables de rastreo
lastUrlFetchUrl = null;
lastUrlFetchPayload = null;

// Ejecutar la generación de la crónica para group_md1
const resultCronica = context.generarCronicaConGemini("group_md1");
assert.equal(resultCronica, "Cronica de IA generada y guardada con exito para Jornada 1");

// Verificar que se hizo fetch a la URL correcta de Gemini con la API Key mockeada
assert.ok(lastUrlFetchUrl);
assert.match(lastUrlFetchUrl, /models\/gemini-2.5-flash:generateContent\?key=test-api-key/);

// Verificar el contenido del prompt enviado a Gemini
assert.ok(lastUrlFetchPayload);
const promptText = lastUrlFetchPayload.contents[0].parts[0].text;
assert.match(promptText, /Puntos conseguidos SOLO en esta jornada/);
assert.match(promptText, /Clasificacion General Global/);

// Verificar que se guardó correctamente en la hoja 'periodico'
const periodicoSheet = mockSS.getSheetByName("periodico");
assert.ok(periodicoSheet);
const periodicoValues = periodicoSheet.getDataRange().getValues();

// Estructura clave-valor en periodico:
// fila 0: ["clave", "valor"]
// fila 1: ["titular", "CARLOS REINA EN LA JORNADA"]
// fila 2: ["subtitulo", "Javi y Maria andan llorando."]
// fila 3: ["fecha", ...]
// fila 4: ["edicion", "Jornada 1"]
// fila 5: ["cronica", "Carlos ha destrozado a todos en esta jornada.\n\nEn la general sigue liderando."]
// fila 6: ["noticias_secundarias", "[{\"titular\":\"LLUVIA DE PALILLOS\",\"resumen\":\"Se agotan los palillos en los bares.\"}]"]
assert.equal(periodicoValues[1][0], "titular");
assert.equal(periodicoValues[1][1], "CARLOS REINA EN LA JORNADA");
assert.equal(periodicoValues[2][0], "subtitulo");
assert.equal(periodicoValues[2][1], "Javi y Maria andan llorando.");
assert.equal(periodicoValues[4][0], "edicion");
assert.equal(periodicoValues[4][1], "Jornada 1");
assert.equal(periodicoValues[5][0], "cronica");
assert.match(periodicoValues[5][1], /Carlos ha destrozado a todos/);

// Test doPost con action "generarCronica" y pasando leaderboards explícitamente
console.log("Iniciando pruebas de doPost con action generarCronica...");
lastUrlFetchUrl = null;
lastUrlFetchPayload = null;

const mockPostEventCronica = {
  postData: {
    contents: JSON.stringify({
      action: "generarCronica",
      round: "group_md2",
      leaderboard: [
        { name: "Pepe", points: 25 },
        { name: "Juan", points: 20 }
      ],
      leaderboardJornada: [
        { name: "Juan", points: 10 },
        { name: "Pepe", points: 5 }
      ],
      password: "CAMBIAR_ESTO"
    })
  }
};

const postCronicaResult = context.doPost(mockPostEventCronica);
const parsedPostCronicaResult = JSON.parse(postCronicaResult.getContent());
assert.equal(parsedPostCronicaResult.success, true);

// Verificar el contenido del prompt enviado a Gemini para el doPost
assert.ok(lastUrlFetchPayload);
const promptTextPost = lastUrlFetchPayload.contents[0].parts[0].text;
assert.match(promptTextPost, /1. Juan: 10 puntos/); // Rendimiento de la jornada
assert.match(promptTextPost, /1. Pepe: 25 puntos/); // Clasificación General Global
assert.match(promptTextPost, /Jornada finalizada: Jornada 2/);

console.log("Pruebas de generarCronicaConGemini: OK");

console.log("google-apps-script.test.js: OK");
