/**
 * =============================================================================
 * La Porra del Mundial 2026 — Google Apps Script Webhook
 * =============================================================================
 * Instrucciones:
 * 1. Abre tu Google Sheet de la Porra.
 * 2. Ve a "Extensiones" > "Apps Script".
 * 3. Borra el código existente y pega este script.
 * 4. Guarda el proyecto (clic en el disco).
 * 5. Haz clic en "Implementar" > "Nueva implementación".
 * 6. Selecciona tipo: "Aplicación web".
 * 7. Configura:
 *    - Descripción: "Porra Webhook"
 *    - Ejecutar como: "Tú (tu email)"
 *    - Quién tiene acceso: "Cualquiera" (esto es clave para que la web pueda enviar datos).
 * 8. Copia la URL de la aplicación web generada y pégala en tu config.js como `appsScriptUrl`.
 * =============================================================================
 */

function doPost(e) {
  var headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400"
  };

  try {
    var jsonString = e.postData.contents;
    var payload = JSON.parse(jsonString);
    
    var result = processSaveRequest(payload);
    
    return ContentService.createTextOutput(JSON.stringify({ success: true, result: result }))
      .setMimeType(ContentService.MimeType.JSON)
      .setHeaders(headers);
      
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON)
      .setHeaders(headers);
  }
}

// Permitir peticiones OPTIONS (CORS preflight) de los navegadores
function doOptions(e) {
  return ContentService.createTextOutput("")
    .setMimeType(ContentService.MimeType.TEXT)
    .setHeaders({
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400"
    });
}

function processSaveRequest(payload) {
  var participantId = payload.participantId;
  var password = payload.password;
  var type = payload.type; // "predictions", "scorer_pick", "goalkeeper_pick", "special_event_pick"
  var data = payload.data; // Array o datos individuales a guardar
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Validar participante y contraseña
  var sheetParticipants = ss.getSheetByName("participants");
  if (!sheetParticipants) throw new Error("No se encontró la pestaña 'participants'");
  
  var participantsData = sheetParticipants.getDataRange().getValues();
  var headers = participantsData[0];
  var idIdx = headers.indexOf("id");
  var passIdx = headers.indexOf("password");
  
  if (idIdx === -1 || passIdx === -1) throw new Error("Estructura de la tabla de participantes incorrecta");
  
  var isValid = false;
  for (var i = 1; i < participantsData.length; i++) {
    if (String(participantsData[i][idIdx]) === String(participantId)) {
      if (String(participantsData[i][passIdx]) === String(password)) {
        isValid = true;
        break;
      }
    }
  }
  
  if (!isValid) throw new Error("Contraseña incorrecta o participante no válido");
  
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
      sheetPredictions.getCell(foundRow, pHomeIdx + 1).setValue(homeScore);
      sheetPredictions.getCell(foundRow, pAwayIdx + 1).setValue(awayScore);
      sheetPredictions.getCell(foundRow, pSubIdx + 1).setValue(now.toISOString());
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
    sheetPicks.getCell(foundRow, playerIdx + 1).setValue(playerId);
    sheetPicks.getCell(foundRow, subIdx + 1).setValue(now.toISOString());
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
    sheetPicks.getCell(foundRow, playerIdx + 1).setValue(playerId);
    sheetPicks.getCell(foundRow, subIdx + 1).setValue(now.toISOString());
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
    sheetPicks.getCell(foundRow, valueIdx + 1).setValue(pickValue);
    sheetPicks.getCell(foundRow, subIdx + 1).setValue(now.toISOString());
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
