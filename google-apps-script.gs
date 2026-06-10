/**
 * =============================================================================
 * La Porra del Mundial 2026 — Google Apps Script Webhook & Triggers
 * =============================================================================
 * Instrucciones para configurar la automatización:
 * 1. Abre tu Google Sheet de la Porra.
 * 2. Ve a "Extensiones" > "Apps Script".
 * 3. Borra el código existente y pega este script.
 * 4. Guarda el proyecto (clic en el icono del disco).
 * 
 * --- CONFIGURACIÓN DEL ACTIVADOR DE FORMULARIO (RECOMENDADO para actualizar automáticamente) ---
 * El activador copiará automáticamente la contraseña a 'participants' y las elecciones
 * a sus respectivas pestañas cada vez que un participante envíe el formulario.
 * 
 * 5. En la barra lateral izquierda de Apps Script, haz clic en el icono de reloj ("Activadores").
 * 6. Haz clic en el botón "+ Añadir activador" (abajo a la derecha).
 * 7. Configura el activador así:
 *    - Selecciona qué función deseas ejecutar: "onFormSubmit"
 *    - Selecciona qué despliegue debe ejecutarse: "Principal" (Head)
 *    - Selecciona la fuente del evento: "De la hoja de cálculo"
 *    - Selecciona el tipo de evento: "Al enviarse el formulario"
 *    - Configuración de notificación de fallos: "Notificarme diariamente"
 * 8. Haz clic en "Guardar". Te pedirá autorización para acceder a tus hojas de cálculo.
 *    Concédele los permisos (si te sale un aviso de seguridad de Google, haz clic en
 *    "Configuración avanzada" e "Ir a La Porra (no seguro)").
 * =============================================================================
 */

function doPost(e) {
  try {
    var jsonString = e.postData.contents;
    var payload = JSON.parse(jsonString);
    
    var result = processSaveRequest(payload);
    
    return ContentService.createTextOutput(JSON.stringify({ success: true, result: result }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Permitir peticiones OPTIONS (CORS preflight) de los navegadores
function doOptions(e) {
  return ContentService.createTextOutput("")
    .setMimeType(ContentService.MimeType.TEXT);
}

function doGet(e) {
  var action = e && e.parameter && e.parameter.action;
  if (action && typeof doGetResults === "function") {
    return doGetResults(e);
  }

  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    message: "Apps Script activo. Usa POST para guardar pronosticos o ?action=refresh para resultados."
  })).setMimeType(ContentService.MimeType.JSON);
}

function processSaveRequest(payload) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Acción para generar la crónica humorística con la IA de Gemini
  if (payload.action === "generarCronica") {
    var adminPass = PropertiesService.getScriptProperties().getProperty("ADMIN_PASSWORD") || "CAMBIAR_ESTO";
    if (payload.password !== adminPass) {
      throw new Error("Contraseña de administrador incorrecta.");
    }
    return generarCronicaConGemini(payload.round, payload.leaderboard);
  }
  
  // Si es un borrador completo (tiene propiedad 'name' y no tiene 'type' o su 'type' es 'draft')
  if (payload.name && (payload.type === "draft" || !payload.type)) {
    processDraft(ss, payload, false); // No omitir append
    return "Borrador completo procesado con éxito";
  }

  var participantId = payload.participantId;
  var password = payload.password;
  var type = payload.type; // "predictions", "scorer_pick", "goalkeeper_pick", "special_event_pick"
  var data = payload.data; // Array o datos individuales a guardar
  
  // 1. Validar participante y contraseña
  var sheetParticipants = ss.getSheetByName("participants");
  if (!sheetParticipants) throw new Error("No se encontró la pestaña 'participants'");
  
  var participantsData = sheetParticipants.getDataRange().getValues();
  var headers = participantsData[0];
  var idIdx = headers.indexOf("id");
  var passIdx = headers.indexOf("password");
  
  if (idIdx === -1 || passIdx === -1) throw new Error("Estructura de la tabla de participantes incorrecta");
  
  var isValid = false;
  var isNewPassword = false;
  var userRowIndex = -1;
  
  for (var i = 1; i < participantsData.length; i++) {
    if (String(participantsData[i][idIdx]) === String(participantId)) {
      var currentPasswordInSheet = String(participantsData[i][passIdx]).trim();
      
      // Si el participante no tiene contraseña registrada en la hoja
      if (currentPasswordInSheet === "") {
        if (password && String(password).trim() !== "") {
          isValid = true;
          isNewPassword = true;
          userRowIndex = i + 1; // 1-based index (la fila 1 es la cabecera)
          break;
        }
      } else {
        // Si ya tiene contraseña, debe coincidir exactamente
        if (currentPasswordInSheet === String(password)) {
          isValid = true;
          break;
        }
      }
    }
  }
  
  if (!isValid) throw new Error("Contraseña incorrecta o participante no válido");
  
  // Guardar la nueva contraseña en la pestaña de participantes
  if (isNewPassword && userRowIndex !== -1) {
    sheetParticipants.getRange(userRowIndex, passIdx + 1).setValue(password);
  }
  
  // 2. Procesar según el tipo de datos
  var now = new Date();
  
  if (type === "predictions") {
    return savePredictions(ss, participantId, data, now);
  } else if (type === "scorer_pick") {
    return saveScorerPick(ss, participantId, data, now);
  } else if (type === "goalkeeper_pick") {
    return saveGoalkeeperPick(ss, participantId, data, now);
  } else if (type === "special_event_pick") {
    return saveSpecialEventPick(ss, participantId, data, now);
  } else {
    throw new Error("Tipo de operación no soportado: " + type);
  }
}

function savePredictions(ss, participantId, predictionsArray, now) {
  var sheetPredictions = ss.getSheetByName("match_predictions");
  var sheetMatches = ss.getSheetByName("matches");
  
  if (!sheetPredictions || !sheetMatches) throw new Error("No se encontraron las pestañas necesarias");
  
  // Mapear partidos para validar deadlines
  var matchesData = sheetMatches.getDataRange().getValues();
  var mHeaders = matchesData[0];
  var mIdIdx = mHeaders.indexOf("id");
  var mKickoffIdx = mHeaders.indexOf("kickoff_utc");
  var mStatusIdx = mHeaders.indexOf("status");
  
  var matchesDeadlineMap = {};
  for (var i = 1; i < matchesData.length; i++) {
    var matchId = String(matchesData[i][mIdIdx]);
    var kickoffStr = matchesData[i][mKickoffIdx];
    var status = String(matchesData[i][mStatusIdx]);
    matchesDeadlineMap[matchId] = {
      kickoff: kickoffStr ? new Date(kickoffStr) : null,
      status: status
    };
  }
  
  var predDataRange = sheetPredictions.getDataRange();
  var predValues = predDataRange.getValues();
  var predHeaders = predValues[0];
  
  var pPartIdx = predHeaders.indexOf("participant_id");
  var pMatchIdx = predHeaders.indexOf("match_id");
  var pHomeIdx = predHeaders.indexOf("predicted_home");
  var pAwayIdx = predHeaders.indexOf("predicted_away");
  var pSubIdx = predHeaders.indexOf("submitted_at");
  
  var count = 0;
  
  predictionsArray.forEach(function(pred) {
    var matchId = String(pred.matchId);
    var homeScore = pred.predictedHome;
    var awayScore = pred.predictedAway;
    
    // Validar deadline del partido
    var matchInfo = matchesDeadlineMap[matchId];
    if (!matchInfo) throw new Error("Partido no encontrado: " + matchId);
    if (matchInfo.status === "finished" || matchInfo.status === "live") {
      throw new Error("El partido " + matchId + " ya ha comenzado o finalizado");
    }
    if (matchInfo.kickoff && now >= matchInfo.kickoff) {
      throw new Error("El plazo para el partido " + matchId + " ha vencido");
    }
    
    // Buscar si ya existe la fila para actualizarla
    var foundRow = -1;
    for (var j = 1; j < predValues.length; j++) {
      if (String(predValues[j][pPartIdx]) === String(participantId) && String(predValues[j][pMatchIdx]) === matchId) {
        foundRow = j + 1; // 1-based index
        break;
      }
    }
    
    if (foundRow !== -1) {
      // Actualizar fila existente
      sheetPredictions.getRange(foundRow, pHomeIdx + 1).setValue(homeScore);
      sheetPredictions.getRange(foundRow, pAwayIdx + 1).setValue(awayScore);
      sheetPredictions.getRange(foundRow, pSubIdx + 1).setValue(now.toISOString());
    } else {
      // Crear nueva fila
      var newRow = [];
      predHeaders.forEach(function(header) {
        if (header === "participant_id") newRow.push(participantId);
        else if (header === "match_id") newRow.push(matchId);
        else if (header === "predicted_home") newRow.push(homeScore);
        else if (header === "predicted_away") newRow.push(awayScore);
        else if (header === "submitted_at") newRow.push(now.toISOString());
        else newRow.push("");
      });
      sheetPredictions.appendRow(newRow);
    }
    count++;
  });
  
  return "Guardadas " + count + " predicciones";
}

function saveScorerPick(ss, participantId, pickData, now) {
  var sheetPicks = ss.getSheetByName("scorer_picks");
  if (!sheetPicks) throw new Error("No se encontró la pestaña 'scorer_picks'");
  
  var roundKey = pickData.roundKey;
  var playerId = pickData.playerId;
  var deadlineStr = pickData.deadlineUtc;
  
  if (deadlineStr) {
    var deadline = new Date(deadlineStr);
    if (now >= deadline) throw new Error("El plazo para elegir goleador en esta ronda ha vencido");
  }
  
  var values = sheetPicks.getDataRange().getValues();
  var headers = values[0];
  var partIdx = headers.indexOf("participant_id");
  var roundIdx = headers.indexOf("round_key");
  var playerIdx = headers.indexOf("player_id");
  var subIdx = headers.indexOf("submitted_at");
  var deadIdx = headers.indexOf("deadline_utc");
  
  var foundRow = -1;
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][partIdx]) === String(participantId) && String(values[i][roundIdx]) === String(roundKey)) {
      foundRow = i + 1;
      break;
    }
  }
  
  if (foundRow !== -1) {
    sheetPicks.getRange(foundRow, playerIdx + 1).setValue(playerId);
    sheetPicks.getRange(foundRow, subIdx + 1).setValue(now.toISOString());
  } else {
    var newRow = [];
    headers.forEach(function(header) {
      if (header === "participant_id") newRow.push(participantId);
      else if (header === "round_key") newRow.push(roundKey);
      else if (header === "player_id") newRow.push(playerId);
      else if (header === "submitted_at") newRow.push(now.toISOString());
      else if (header === "deadline_utc") newRow.push(deadlineStr || "");
      else newRow.push("");
    });
    sheetPicks.appendRow(newRow);
  }
  
  return "Goleador guardado con éxito";
}

function saveGoalkeeperPick(ss, participantId, pickData, now) {
  var sheetPicks = ss.getSheetByName("goalkeeper_picks");
  if (!sheetPicks) throw new Error("No se encontró la pestaña 'goalkeeper_picks'");
  
  var roundKey = pickData.roundKey;
  var playerId = pickData.playerId;
  var deadlineStr = pickData.deadlineUtc;
  
  if (deadlineStr) {
    var deadline = new Date(deadlineStr);
    if (now >= deadline) throw new Error("El plazo para elegir portero en esta ronda ha vencido");
  }
  
  var values = sheetPicks.getDataRange().getValues();
  var headers = values[0];
  var partIdx = headers.indexOf("participant_id");
  var roundIdx = headers.indexOf("round_key");
  var playerIdx = headers.indexOf("player_id");
  var subIdx = headers.indexOf("submitted_at");
  var deadIdx = headers.indexOf("deadline_utc");
  
  var foundRow = -1;
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][partIdx]) === String(participantId) && String(values[i][roundIdx]) === String(roundKey)) {
      foundRow = i + 1;
      break;
    }
  }
  
  if (foundRow !== -1) {
    sheetPicks.getRange(foundRow, playerIdx + 1).setValue(playerId);
    sheetPicks.getRange(foundRow, subIdx + 1).setValue(now.toISOString());
  } else {
    var newRow = [];
    headers.forEach(function(header) {
      if (header === "participant_id") newRow.push(participantId);
      else if (header === "round_key") newRow.push(roundKey);
      else if (header === "player_id") newRow.push(playerId);
      else if (header === "submitted_at") newRow.push(now.toISOString());
      else if (header === "deadline_utc") newRow.push(deadlineStr || "");
      else newRow.push("");
    });
    sheetPicks.appendRow(newRow);
  }
  
  return "Portero guardado con éxito";
}

function saveSpecialEventPick(ss, participantId, pickData, now) {
  var sheetPicks = ss.getSheetByName("special_event_picks");
  var sheetEvents = ss.getSheetByName("special_events");
  if (!sheetPicks || !sheetEvents) throw new Error("No se encontraron las pestañas necesarias");
  
  var eventId = pickData.eventId;
  var pickValue = pickData.pickValue;
  
  // Validar active/deadline en la pestaña de eventos especiales
  var eventsValues = sheetEvents.getDataRange().getValues();
  var evHeaders = eventsValues[0];
  var evIdIdx = evHeaders.indexOf("id");
  var evActiveIdx = evHeaders.indexOf("is_active");
  var evDeadIdx = evHeaders.indexOf("deadline_utc");
  
  var eventInfo = null;
  for (var i = 1; i < eventsValues.length; i++) {
    if (String(eventsValues[i][evIdIdx]) === eventId) {
      eventInfo = {
        isActive: String(eventsValues[i][evActiveIdx]).toLowerCase() === "true" || eventsValues[i][evActiveIdx] === true,
        deadline: eventsValues[i][evDeadIdx] ? new Date(eventsValues[i][evDeadIdx]) : null
      };
      break;
    }
  }
  
  if (!eventInfo) throw new Error("Evento especial no encontrado: " + eventId);
  if (!eventInfo.isActive) throw new Error("El evento " + eventId + " no está activo");
  if (eventInfo.deadline && now >= eventInfo.deadline) throw new Error("El plazo del evento " + eventId + " ha vencido");
  
  var values = sheetPicks.getDataRange().getValues();
  var headers = values[0];
  var partIdx = headers.indexOf("participant_id");
  var eventIdx = headers.indexOf("event_id");
  var valueIdx = headers.indexOf("pick_value");
  var subIdx = headers.indexOf("submitted_at");
  
  var foundRow = -1;
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][partIdx]) === String(participantId) && String(values[i][eventIdx]) === String(eventId)) {
      foundRow = i + 1;
      break;
    }
  }
  
  if (foundRow !== -1) {
    sheetPicks.getRange(foundRow, valueIdx + 1).setValue(pickValue);
    sheetPicks.getRange(foundRow, subIdx + 1).setValue(now.toISOString());
  } else {
    var newRow = [];
    headers.forEach(function(header) {
      if (header === "participant_id") newRow.push(participantId);
      else if (header === "event_id") newRow.push(eventId);
      else if (header === "pick_value") newRow.push(pickValue);
      else if (header === "submitted_at") newRow.push(now.toISOString());
      else newRow.push("");
    });
    sheetPicks.appendRow(newRow);
  }
  
  return "Elección de evento especial guardada con éxito";
}

/**
 * Se ejecuta automáticamente al recibir una respuesta del formulario de Google.
 * Esta función extrae el borrador (draft) en formato JSON, y lo distribuye
 * a las diferentes pestañas: 'participants' para la contraseña, y el resto para las elecciones.
 */
function onFormSubmit(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Obtener la hoja de respuestas del formulario
  var sheetResponse = ss.getSheetByName("Respuestas de formulario 1");
  if (!sheetResponse) {
    Logger.log("No se encontró la pestaña 'Respuestas de formulario 1'");
    return;
  }
  
  // Obtener la última fila que acaba de ser insertada
  var lastRow = sheetResponse.getLastRow();
  if (lastRow < 2) return;
  
  // Buscar de forma dinámica el JSON en las columnas de la fila
  var jsonString = findJsonInRow(sheetResponse, lastRow);
  if (!jsonString) {
    Logger.log("No hay contenido JSON válido en la fila " + lastRow);
    return;
  }
  
  try {
    var draft = JSON.parse(jsonString);
    if (!draft || !draft.name) {
      Logger.log("El JSON no es un borrador válido: " + jsonString);
      return;
    }
    
    processDraft(ss, draft, true); // Omitir append porque ya viene del envío del formulario
    Logger.log("Borrador procesado con éxito para: " + draft.name);
  } catch (err) {
    Logger.log("Error al procesar el formulario en onFormSubmit: " + err.toString());
  }
}

/**
 * Procesa el borrador (draft) completo de un participante y actualiza la hoja de cálculo.
 */
function processDraft(ss, draft, skipAppendResponse) {
  var now = new Date();
  
  // 1. Validar y actualizar participante / contraseña en la pestaña 'participants'
  var sheetParticipants = ss.getSheetByName("participants");
  if (!sheetParticipants) throw new Error("No se encontró la pestaña 'participants'");
  
  var participantsData = sheetParticipants.getDataRange().getValues();
  var headers = participantsData[0];
  var idIdx = headers.indexOf("id");
  var nameIdx = headers.indexOf("name");
  var passIdx = headers.indexOf("password");
  
  if (idIdx === -1 || nameIdx === -1 || passIdx === -1) {
    throw new Error("Estructura de la tabla de participantes incorrecta en 'participants'");
  }
  
  var participantId = null;
  var userRowIndex = -1;
  var currentPasswordInSheet = "";
  
  for (var i = 1; i < participantsData.length; i++) {
    if (String(participantsData[i][nameIdx]).trim().toLowerCase() === String(draft.name).trim().toLowerCase()) {
      participantId = String(participantsData[i][idIdx]);
      currentPasswordInSheet = String(participantsData[i][passIdx]).trim();
      userRowIndex = i + 1; // 1-based index
      break;
    }
  }
  
  if (!participantId) {
    throw new Error("Participante no encontrado en 'participants': " + draft.name);
  }
  
  var password = draft.password ? String(draft.password).trim() : "";
  var isValid = false;
  var isNewPassword = false;
  
  if (currentPasswordInSheet === "") {
    if (password !== "") {
      isValid = true;
      isNewPassword = true;
    } else {
      // Permitir envíos si aún no tiene contraseña y no ha enviado ninguna
      isValid = true;
    }
  } else {
    // Si ya tiene contraseña registrada, debe coincidir exactamente
    if (currentPasswordInSheet === password) {
      isValid = true;
    }
  }
  
  if (!isValid) {
    throw new Error("Contraseña incorrecta para el participante " + draft.name);
  }
  
  // Guardar la nueva contraseña en la pestaña de participantes si es nueva
  if (isNewPassword && userRowIndex !== -1) {
    sheetParticipants.getRange(userRowIndex, passIdx + 1).setValue(password);
  }
  
  // 2. Guardar pronósticos de partidos (match_predictions)
  if (draft.matchPredictions) {
    var predictionsArray = [];
    for (var matchId in draft.matchPredictions) {
      var pred = draft.matchPredictions[matchId];
      if (pred && (pred.home !== undefined || pred.away !== undefined)) {
        predictionsArray.push({
          matchId: matchId,
          predictedHome: (pred.home !== null && pred.home !== "") ? Number(pred.home) : "",
          predictedAway: (pred.away !== null && pred.away !== "") ? Number(pred.away) : ""
        });
      }
    }
    if (predictionsArray.length > 0) {
      try {
        savePredictions(ss, participantId, predictionsArray, now);
      } catch (err) {
        Logger.log("Error guardando predicciones de partidos: " + err.toString());
        throw err;
      }
    }
  }
  
  // 3. Guardar elecciones de goleadores (scorer_picks)
  if (draft.scorerPicks) {
    for (var roundKey in draft.scorerPicks) {
      var playerId = draft.scorerPicks[roundKey];
      if (playerId) {
        var deadlineStr = getRoundDeadline(ss, roundKey);
        try {
          saveScorerPick(ss, participantId, {
            roundKey: roundKey,
            playerId: playerId,
            deadlineUtc: deadlineStr
          }, now);
        } catch (err) {
          Logger.log("Error guardando goleador para " + roundKey + ": " + err.toString());
          throw err;
        }
      }
    }
  }
  
  // 4. Guardar elecciones de porteros (goalkeeper_picks)
  if (draft.goalkeeperPicks) {
    for (var roundKey in draft.goalkeeperPicks) {
      var playerId = draft.goalkeeperPicks[roundKey];
      if (playerId) {
        var deadlineStr = getRoundDeadline(ss, roundKey);
        try {
          saveGoalkeeperPick(ss, participantId, {
            roundKey: roundKey,
            playerId: playerId,
            deadlineUtc: deadlineStr
          }, now);
        } catch (err) {
          Logger.log("Error guardando portero para " + roundKey + ": " + err.toString());
          throw err;
        }
      }
    }
  }
  
  // 5. Guardar elecciones de eventos especiales (special_event_picks)
  if (draft.specialEventPicks) {
    for (var eventId in draft.specialEventPicks) {
      var pickValue = draft.specialEventPicks[eventId];
      if (pickValue !== undefined && pickValue !== null && String(pickValue).trim() !== "") {
        try {
          saveSpecialEventPick(ss, participantId, {
            eventId: eventId,
            pickValue: String(pickValue)
          }, now);
        } catch (err) {
          Logger.log("Error guardando evento especial " + eventId + ": " + err.toString());
          throw err;
        }
      }
    }
  }
  
  // 6. Guardar copia del borrador en la pestaña de respuestas (Respuestas de formulario 1) para que el frontend lo lea
  if (!skipAppendResponse) {
    var sheetResponse = ss.getSheetByName("Respuestas de formulario 1");
    if (sheetResponse) {
      try {
        sheetResponse.appendRow([now.toISOString(), JSON.stringify(draft)]);
      } catch (err) {
        Logger.log("Error guardando borrador en respuestas: " + err.toString());
        throw err;
      }
    }
  }
}

/**
 * Obtiene la fecha límite (kickoff del primer partido de la jornada) de una ronda.
 */
function getRoundDeadline(ss, roundKey) {
  var sheetMatches = ss.getSheetByName("matches");
  if (!sheetMatches) return null;
  
  var matchesData = sheetMatches.getDataRange().getValues();
  var headers = matchesData[0];
  var phaseIdx = headers.indexOf("phase");
  var matchdayIdx = headers.indexOf("matchday");
  var kickoffIdx = headers.indexOf("kickoff_utc");
  
  if (phaseIdx === -1 || kickoffIdx === -1) return null;
  
  var earliestTime = null;
  for (var i = 1; i < matchesData.length; i++) {
    var rowRoundKey = getMatchRoundKey_(matchesData[i][phaseIdx], matchdayIdx === -1 ? "" : matchesData[i][matchdayIdx]);
    if (rowRoundKey === roundKey) {
      var kickoffVal = matchesData[i][kickoffIdx];
      if (kickoffVal) {
        var t = new Date(kickoffVal).getTime();
        if (!isNaN(t)) {
          if (earliestTime === null || t < earliestTime) {
            earliestTime = t;
          }
        }
      }
    }
  }
  
  return earliestTime ? new Date(earliestTime).toISOString() : null;
}

function getMatchRoundKey_(phase, matchday) {
  var p = String(phase || "").trim().toLowerCase();
  if (p === "group") {
    var md = Number(matchday);
    return md ? "group_md" + md : "";
  }
  return p;
}

/**
 * Función de utilidad para procesar de forma retrospectiva todas las filas 
 * que ya existen en 'Respuestas de formulario 1'.
 * Puedes ejecutarla manualmente desde el editor de Apps Script si es necesario.
 */
function backfillPredictions() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetResponse = ss.getSheetByName("Respuestas de formulario 1");
  if (!sheetResponse) {
    Logger.log("No se encontró la pestaña 'Respuestas de formulario 1'");
    return;
  }
  
  var lastRow = sheetResponse.getLastRow();
  if (lastRow < 2) {
    Logger.log("No hay filas para procesar.");
    return;
  }
  
  var processedCount = 0;
  for (var row = 2; row <= lastRow; row++) {
    var jsonString = findJsonInRow(sheetResponse, row);
    if (!jsonString) continue;
    
    try {
      var draft = JSON.parse(jsonString);
      if (draft && draft.name) {
        processDraft(ss, draft, true); // Omitir append porque ya está en el histórico
        processedCount++;
      }
    } catch (err) {
      Logger.log("Error en fila " + row + ": " + err.toString());
    }
  }
  
  Logger.log("Proceso completado. Se procesaron " + processedCount + " filas.");
}

/**
 * Busca de forma dinámica el JSON del borrador en cualquier columna de la fila especificada.
 */
function findJsonInRow(sheet, row) {
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) return null;
  var rowValues = sheet.getRange(row, 1, 1, lastCol).getValues()[0];
  for (var c = 0; c < rowValues.length; c++) {
    var val = String(rowValues[c]).trim();
    if (val.indexOf('{"name":') === 0 || (val.indexOf('{') === 0 && val.indexOf('"name"') !== -1)) {
      return val;
    }
  }
  return null;
}

/**
 * Crea las pestañas necesarias en la hoja de cálculo si no existen,
 * con sus correspondientes cabeceras.
 * Ejecuta esta función desde el editor de Apps Script para preparar tu hoja.
 */
function setupSpreadsheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  var sheetsToCreate = [
    {
      name: "match_predictions",
      headers: ["participant_id", "match_id", "predicted_home", "predicted_away", "submitted_at", "points_earned"]
    },
    {
      name: "scorer_picks",
      headers: ["participant_id", "round_key", "player_id", "submitted_at", "deadline_utc", "points_earned"]
    },
    {
      name: "goalkeeper_picks",
      headers: ["participant_id", "round_key", "player_id", "submitted_at", "deadline_utc", "points_earned"]
    },
    {
      name: "special_event_picks",
      headers: ["participant_id", "event_id", "pick_value", "submitted_at", "points_earned"]
    },
    {
      name: "api_snapshots",
      headers: ["round_key", "player_api_name", "goals_total", "taken_at"]
    },
    {
      name: "Respuestas de formulario 1",
      headers: ["Timestamp", "Borrador"]
    },
    {
      name: "periodico",
      headers: ["clave", "valor"]
    }
  ];
  
  sheetsToCreate.forEach(function(sheetConf) {
    var sheet = ss.getSheetByName(sheetConf.name);
    if (!sheet) {
      sheet = ss.insertSheet(sheetConf.name);
      sheet.appendRow(sheetConf.headers);
      Logger.log("Creada pestaña: " + sheetConf.name);
    } else {
      Logger.log("La pestaña ya existe: " + sheetConf.name);
    }
  });
  
  Logger.log("Configuración completada.");
}

function generarCronicaConGemini(round, leaderboardGlobal, leaderboardJornada) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  if (!leaderboardGlobal) {
    leaderboardGlobal = calcularLeaderboardEnBackend(ss);
  }
  if (!leaderboardJornada) {
    leaderboardJornada = calcularLeaderboardEnBackend(ss, round);
  }

  var apiKey = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY") || "AIzaSyC8C3hRR31m6M59BqwYprA8gnmFXep3NS4";
  
  const systemPrompt = "Actua como un redactor deportivo ultra-cunado, sarcastico e ironico de un periodico deportivo espanol (como Marca o As, pero muy satirico). Escribe una cronica burlona sobre una jornada de 'La Porra del Mundial 2026' basandote en el rendimiento de los participantes en esta jornada especifica y en la clasificacion general global.\n\nReglas del tono:\n1. Usa lenguaje muy castizo de cunado espanol: frases como 'lo de siempre', 'mano negra', 'mi primo el del bar', 'vaya tela', 'para habernos matao', 'palillo en la boca', 'cuidao con el figura'.\n2. Burla cariñosa de los participantes que han tenido el peor rendimiento en esta jornada especifica y del colista general del torneo.\n3. Lanza comentarios ironicos sobre el lider general del torneo (insinua que tiene flor en el culo, que ha comprado al arbitro, o que su cunado le ha soplado los resultados) y elogia de forma exageradamente ironica al participante que haya sido el 'figura' / MVP de esta jornada especifica por haber conseguido mas puntos en ella.\n4. Genera ademas de la cronica principal, 2 o 3 noticias secundarias breves e igual de comicas sobre otros participantes de la clasificación.\n\nDebes devolver obligatoriamente un JSON plano con la siguiente estructura (no añadas markdown ni envoltorios de codigo ```json):\n{\n  \"titular\": \"UN TITULAR SENSACIONALISTA EN MAYUSCULAS\",\n  \"subtitulo\": \"Un subtitulo que resuma la mofa de la jornada.\",\n  \"cronica\": \"El cuerpo de la noticia con varios parrafos. Usa saltos de linea '\\\\n' para separar los parrafos.\",\n  \"noticias_secundarias\": [\n    {\n      \"titular\": \"TITULO DE NOTICIA SECUNDARIA EN MAYUSCULAS\",\n      \"resumen\": \"Texto corto, ironico y directo sobre esta noticia secundaria.\"\n    },\n    {\n      \"titular\": \"OTRO TITULO SECUNDARIO\",\n      \"resumen\": \"Otro chisme gracioso sobre otro participante.\"\n    }\n  ]\n}";

  const promptUsuario = "Jornada finalizada: " + round + "\n\n" +
    "Puntos conseguidos SOLO en esta jornada (Rendimiento de la jornada):\n" + 
    leaderboardJornada.map(function(p, i) { return (i+1) + ". " + p.name + ": " + p.points + " puntos"; }).join("\n") + 
    "\n\nClasificacion General Global (Acumulado de todo el torneo):\n" +
    leaderboardGlobal.map(function(p, i) { return (i+1) + ". " + p.name + ": " + p.points + " puntos"; }).join("\n") + 
    "\n\nGenera la cronica con la estructura JSON solicitada.";

  const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + apiKey;

  const requestBody = {
    contents: [{
      parts: [{ text: systemPrompt + "\n\n" + promptUsuario }]
    }],
    generationConfig: {
      responseMimeType: "application/json"
    }
  };

  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(requestBody),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  const responseCode = response.getResponseCode();
  const responseText = response.getContentText();

  if (responseCode !== 200) {
    throw new Error("Error en la llamada a Gemini (codigo " + responseCode + "): " + responseText);
  }

  const jsonResponse = JSON.parse(responseText);
  let text = "";
  try {
    text = jsonResponse.candidates[0].content.parts[0].text;
  } catch (e) {
    throw new Error("Respuesta invalida de la API de Gemini: " + responseText);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    var cleanText = text.replace(/```json/g, "").replace(/```/g, "").trim();
    data = JSON.parse(cleanText);
  }

  const roundLabels = {
    group_md1: "Jornada 1",
    group_md2: "Jornada 2",
    group_md3: "Jornada 3",
    r32: "Ronda de 32",
    r16: "Octavos de Final",
    qf: "Cuartos de Final",
    sf: "Semifinales",
    "3rd": "Tercer Puesto",
    final: "Final"
  };

  const labelEdicion = roundLabels[round] || round;
  
  guardarCronicaEnSheet(data.titular, data.subtitulo, data.cronica, labelEdicion, data.noticias_secundarias);

  return "Cronica de IA generada y guardada con exito para " + labelEdicion;
}

function guardarCronicaEnSheet(titular, subtitulo, cronica, edicion, noticiasSecundarias) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("periodico");
  if (!sheet) {
    sheet = ss.insertSheet("periodico");
  }
  sheet.clear();
  sheet.appendRow(["clave", "valor"]);
  sheet.appendRow(["titular", titular]);
  sheet.appendRow(["subtitulo", subtitulo]);
  sheet.appendRow(["fecha", new Date().toLocaleDateString("es-ES", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })]);
  sheet.appendRow(["edicion", edicion]);
  sheet.appendRow(["cronica", cronica]);
  sheet.appendRow(["noticias_secundarias", typeof noticiasSecundarias === 'string' ? noticiasSecundarias : JSON.stringify(noticiasSecundarias || [])]);
}

function _matchRoundKeyLocal(phase, matchday) {
  if (!phase) return null;
  const p = String(phase).trim().toLowerCase();
  if (p === "group") {
    const md = Number(matchday);
    if (!md || md < 1 || md > 3) return null;
    return "group_md" + md;
  }
  const validKeys = ["r32", "r16", "qf", "sf", "3rd", "final"];
  return validKeys.includes(p) ? p : null;
}

function calcularLeaderboardEnBackend(ss, targetRoundKey) {
  const sheetParticipants = ss.getSheetByName("participants");
  const sheetMatches = ss.getSheetByName("matches");
  const sheetPredictions = ss.getSheetByName("match_predictions");
  const sheetPlayers = ss.getSheetByName("players");
  const sheetScorerPicks = ss.getSheetByName("scorer_picks");
  const sheetGkPicks = ss.getSheetByName("goalkeeper_picks");
  const sheetSpecialEvents = ss.getSheetByName("special_events");
  const sheetSpecialEventPicks = ss.getSheetByName("special_event_picks");

  if (!sheetParticipants || !sheetMatches || !sheetPredictions) {
    throw new Error("No se encontraron las hojas necesarias para calcular el leaderboard");
  }

  const participantsData = sheetParticipants.getDataRange().getValues();
  const pHeaders = participantsData[0];
  const pIdIdx = pHeaders.indexOf("id");
  const pNameIdx = pHeaders.indexOf("name");

  // Crear mapa de participantes
  const participants = [];
  for (let i = 1; i < participantsData.length; i++) {
    const pId = String(participantsData[i][pIdIdx]).trim();
    const pName = String(participantsData[i][pNameIdx]).trim();
    if (pId && pName) {
      participants.push({ id: pId, name: pName, points: 0 });
    }
  }

  // 1. Puntos de partidos
  const matchesData = sheetMatches.getDataRange().getValues();
  const mHeaders = matchesData[0];
  const mIdIdx = mHeaders.indexOf("id");
  const mHScoreIdx = mHeaders.indexOf("home_score");
  const mAScoreIdx = mHeaders.indexOf("away_score");
  const mStatusIdx = mHeaders.indexOf("status");
  const mDoubleIdx = mHeaders.indexOf("is_double_points");

  const matchesMap = {};
  const mPhaseIdx = mHeaders.indexOf("phase");
  const mMdIdx = mHeaders.indexOf("matchday");
  for (let i = 1; i < matchesData.length; i++) {
    const mId = String(matchesData[i][mIdIdx]).trim();
    const status = String(matchesData[i][mStatusIdx]).trim().toLowerCase();
    const hScore = matchesData[i][mHScoreIdx];
    const aScore = matchesData[i][mAScoreIdx];
    const isDouble = String(matchesData[i][mDoubleIdx]).trim().toLowerCase() === "true";
    const phase = matchesData[i][mPhaseIdx];
    const matchday = matchesData[i][mMdIdx];

    if (mId && status === "finished" && hScore !== "" && aScore !== "") {
      const roundKey = _matchRoundKeyLocal(phase, matchday);
      if (!targetRoundKey || roundKey === targetRoundKey) {
        matchesMap[mId] = {
          home: Number(hScore),
          away: Number(aScore),
          isDouble: isDouble
        };
      }
    }
  }

  const predictionsData = sheetPredictions.getDataRange().getValues();
  const predHeaders = predictionsData[0];
  const prPartIdx = predHeaders.indexOf("participant_id");
  const prMatchIdx = predHeaders.indexOf("match_id");
  const prHomeIdx = predHeaders.indexOf("predicted_home");
  const prAwayIdx = predHeaders.indexOf("predicted_away");

  const predictions = [];
  for (let i = 1; i < predictionsData.length; i++) {
    const pId = String(predictionsData[i][prPartIdx]).trim();
    const mId = String(predictionsData[i][prMatchIdx]).trim();
    const pHome = predictionsData[i][prHomeIdx];
    const pAway = predictionsData[i][prAwayIdx];

    if (pId && mId && pHome !== "" && pAway !== "") {
      predictions.push({
        participantId: pId,
        matchId: mId,
        home: Number(pHome),
        away: Number(pAway)
      });
    }
  }

  // Sumar puntos por predicción
  participants.forEach(p => {
    const pPreds = predictions.filter(pr => pr.participantId === p.id);
    pPreds.forEach(pr => {
      const match = matchesMap[pr.matchId];
      if (match) {
        let pts = 0;
        if (pr.home === match.home && pr.away === match.away) {
          pts = 3;
        } else if ((pr.home - pr.away) === (match.home - match.away)) {
          pts = 2;
        } else if (Math.sign(pr.home - pr.away) === Math.sign(match.home - match.away)) {
          pts = 1;
        }
        p.points += match.isDouble ? pts * 2 : pts;
      }
    });
  });

  // 2. Goleadores (scorer_picks)
  if (sheetPlayers && sheetScorerPicks) {
    const playersData = sheetPlayers.getDataRange().getValues();
    const plHeaders = playersData[0];
    const plIdIdx = plHeaders.indexOf("id");

    const scorerPicksData = sheetScorerPicks.getDataRange().getValues();
    const spHeaders = scorerPicksData[0];
    const spPartIdx = spHeaders.indexOf("participant_id");
    const spRoundIdx = spHeaders.indexOf("round_key");
    const spPlayerIdx = spHeaders.indexOf("player_id");

    participants.forEach(p => {
      const pPicks = [];
      for (let i = 1; i < scorerPicksData.length; i++) {
        const roundKey = String(scorerPicksData[i][spRoundIdx]).trim();
        if (String(scorerPicksData[i][spPartIdx]).trim() === p.id) {
          if (!targetRoundKey || roundKey === targetRoundKey) {
            pPicks.push({
              roundKey: roundKey,
              playerId: String(scorerPicksData[i][spPlayerIdx]).trim()
            });
          }
        }
      }

      pPicks.forEach(pick => {
        const colName = "goals_" + pick.roundKey;
        const colIdx = plHeaders.indexOf(colName);
        if (colIdx !== -1) {
          for (let rowIdx = 1; rowIdx < playersData.length; rowIdx++) {
            if (String(playersData[rowIdx][plIdIdx]).trim() === pick.playerId) {
              const goals = Number(playersData[rowIdx][colIdx]) || 0;
              p.points += goals;
              break;
            }
          }
        }
      });
    });
  }

  // 3. Porteros (goalkeeper_picks)
  if (sheetPlayers && sheetGkPicks) {
    const playersData = sheetPlayers.getDataRange().getValues();
    const plHeaders = playersData[0];
    const plIdIdx = plHeaders.indexOf("id");

    const gkPicksData = sheetGkPicks.getDataRange().getValues();
    const gpHeaders = gkPicksData[0];
    const gpPartIdx = gpHeaders.indexOf("participant_id");
    const gpRoundIdx = gpHeaders.indexOf("round_key");
    const gpPlayerIdx = gpHeaders.indexOf("player_id");

    participants.forEach(p => {
      const pPicks = [];
      for (let i = 1; i < gkPicksData.length; i++) {
        const roundKey = String(gkPicksData[i][gpRoundIdx]).trim();
        if (String(gkPicksData[i][gpPartIdx]).trim() === p.id) {
          if (!targetRoundKey || roundKey === targetRoundKey) {
            pPicks.push({
              roundKey: roundKey,
              playerId: String(gkPicksData[i][gpPlayerIdx]).trim()
            });
          }
        }
      }

      pPicks.forEach(pick => {
        const colName = "conceded_" + pick.roundKey;
        const colIdx = plHeaders.indexOf(colName);
        if (colIdx !== -1) {
          for (let rowIdx = 1; rowIdx < playersData.length; rowIdx++) {
            if (String(playersData[rowIdx][plIdIdx]).trim() === pick.playerId) {
              const conceded = Number(playersData[rowIdx][colIdx]);
              if (!isNaN(conceded)) {
                if (conceded === 0) p.points += 2;
                else if (conceded === 1) p.points += 1;
                else p.points += (2 - conceded);
              }
              break;
            }
          }
        }
      });
    });
  }

  // 4. Eventos Especiales (special_event_picks) - Solo cuentan para el acumulado global
  if (!targetRoundKey && sheetSpecialEvents && sheetSpecialEventPicks) {
    const eventsData = sheetSpecialEvents.getDataRange().getValues();
    const evHeaders = eventsData[0];
    const evIdIdx = evHeaders.indexOf("id");
    const evResIdx = evHeaders.indexOf("result_description");

    const eventPicksData = sheetSpecialEventPicks.getDataRange().getValues();
    const epHeaders = eventPicksData[0];
    const epPartIdx = epHeaders.indexOf("participant_id");
    const epEventIdx = epHeaders.indexOf("event_id");
    const epPickIdx = epHeaders.indexOf("pick_value");

    const eventsMap = {};
    for (let i = 1; i < eventsData.length; i++) {
      const evId = String(eventsData[i][evIdIdx]).trim();
      const res = String(eventsData[i][evResIdx]).trim();
      if (evId && res && res !== "none" && res !== "") {
        eventsMap[evId] = res;
      }
    }

    participants.forEach(p => {
      for (let i = 1; i < eventPicksData.length; i++) {
        if (String(eventPicksData[i][epPartIdx]).trim() === p.id) {
          const evId = String(eventPicksData[i][epEventIdx]).trim();
          const pickVal = String(eventPicksData[i][epPickIdx]).trim();
          const actualRes = eventsMap[evId];

          if (actualRes) {
            if (evId === "E1" && pickVal === actualRes) p.points += 5;
            else if (evId === "E3" && pickVal === actualRes) p.points += 4;
            else if (evId === "E4" && pickVal === actualRes) p.points += 3;
            else if (evId === "E5" && pickVal === actualRes) p.points += 5;
            else if (evId === "E6") {
              const pickGoals = parseInt(pickVal, 10);
              const actualGoals = parseInt(actualRes, 10);
              if (!isNaN(pickGoals) && !isNaN(actualGoals)) {
                if (pickGoals === actualGoals) p.points += 3;
                else if (Math.abs(pickGoals - actualGoals) === 1) p.points += 1;
              }
            }
          }
        }
      }
    });
  }

  // Ordenar de mayor a menor puntuación
  participants.sort(function(a, b) { return b.points - a.points; });
  return participants;
}
