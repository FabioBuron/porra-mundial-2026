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

    // Oráculo del Cuñao — manejado aquí directamente para evitar problemas de routing
    if (payload.action === "preguntarOracle") {
      var answer = responderPreguntaOracle(payload.question, payload.history, payload.porraContext);
      return ContentService.createTextOutput(JSON.stringify({ success: true, result: answer }))
        .setMimeType(ContentService.MimeType.JSON);
    }

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
    return generarCronicaConGemini(payload.round, payload.leaderboard, payload.leaderboardJornada);
  }

  // Acción para borrar la crónica del periódico
  if (payload.action === "borrarCronica") {
    var adminPass = PropertiesService.getScriptProperties().getProperty("ADMIN_PASSWORD") || "CAMBIAR_ESTO";
    if (payload.password !== adminPass) {
      throw new Error("Contraseña de administrador incorrecta.");
    }
    var pSheet = ss.getSheetByName("periodico");
    if (pSheet) {
      pSheet.clear();
    }
    return "Crónica borrada con éxito.";
  }
  
  // Devuelve solo el contexto de la porra (sin llamar a Gemini) para streaming en cliente
  if (payload.action === "getOracleContext") {
    var ctx = _buildPorraContextFromSheet();
    var apiKey = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY") || "AIzaSyC8C3hRR31m6M59BqwYprA8gnmFXep3NS4";
    return { context: ctx, geminiApiKey: apiKey };
  }

  // Acción para el Consultorio del Cuñao (Gemma 4 31B)
  if (payload.action === "preguntarOracle") {
    return responderPreguntaOracle(payload.question, payload.history, payload.porraContext);
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
  
  // Mapear partidos para validar deadlines POR JORNADA.
  // Regla (#5): una jornada se cierra cuando empieza su PRIMER partido. Por eso el
  // plazo de CADA partido es el kickoff más temprano de su jornada, no el suyo
  // propio. (Coincide con getRoundDeadline(), usado para goleador/portero.)
  var matchesData = sheetMatches.getDataRange().getValues();
  var mHeaders = matchesData[0];
  var mIdIdx = mHeaders.indexOf("id");
  var mKickoffIdx = mHeaders.indexOf("kickoff_utc");
  var mStatusIdx = mHeaders.indexOf("status");
  var mPhaseIdx = mHeaders.indexOf("phase");
  var mMdIdx = mHeaders.indexOf("matchday");

  var matchInfoMap = {};         // matchId → { roundKey, status }
  var roundEarliestKickoff = {}; // roundKey → ms del kickoff más temprano de la jornada
  for (var i = 1; i < matchesData.length; i++) {
    var rowMatchId = String(matchesData[i][mIdIdx]);
    var kickoffStr = matchesData[i][mKickoffIdx];
    var status = String(matchesData[i][mStatusIdx]);
    var rKey = getMatchRoundKey_(matchesData[i][mPhaseIdx], mMdIdx === -1 ? "" : matchesData[i][mMdIdx]);
    matchInfoMap[rowMatchId] = { roundKey: rKey, status: status };
    if (rKey && kickoffStr) {
      var t = new Date(kickoffStr).getTime();
      if (!isNaN(t) && (roundEarliestKickoff[rKey] === undefined || t < roundEarliestKickoff[rKey])) {
        roundEarliestKickoff[rKey] = t;
      }
    }
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
    
    // Validar deadline POR JORNADA del partido
    var matchInfo = matchInfoMap[matchId];
    if (!matchInfo) throw new Error("Partido no encontrado: " + matchId);
    if (matchInfo.status === "finished" || matchInfo.status === "live") {
      throw new Error("El partido " + matchId + " ya ha comenzado o finalizado");
    }
    var roundStart = matchInfo.roundKey ? roundEarliestKickoff[matchInfo.roundKey] : null;
    if (roundStart && now.getTime() >= roundStart) {
      throw new Error("El plazo de la jornada del partido " + matchId + " ha vencido (la jornada ya ha comenzado)");
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

  if (!leaderboardGlobal) {
    leaderboardGlobal = calcularLeaderboardEnBackend(ss);
  }
  if (!leaderboardJornada) {
    leaderboardJornada = calcularLeaderboardEnBackend(ss, round);
  }

  var apiKey = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY") || "AIzaSyC8C3hRR31m6M59BqwYprA8gnmFXep3NS4";
  
  const detallePicks = obtenerDetallePicksJornada(ss, round);

  const systemPrompt = "Actua como un redactor deportivo ultra-cunado, sarcastico e ironico de un periodico deportivo espanol (como Marca o As, pero muy satirico). Escribe una cronica burlona sobre una jornada de 'La Porra del Mundial 2026' basandote en el rendimiento de los participantes en esta jornada especifica, sus aciertos/fallos y la clasificacion general global.\n\n" +
    "Reglas del tono:\n" +
    "1. Usa lenguaje castizo de cunado espanol, sarcastico e ironico: frases como 'lo de siempre', 'mano negra', 'vaya tela', 'cuidao con el figura'. EVITA hacer referencias a 'mi primo el del bar'.\n" +
    "2. Burla cariñosa de los participantes que han tenido el peor rendimiento en esta jornada especifica y del colista general del torneo. Se despiadadamente comico y acido.\n" +
    "3. Lanza comentarios ironicos sobre el lider general del torneo (insinua que tiene flor en el culo, que ha comprado al arbitro, o que tiene contactos en las altas esferas) y elogia de forma exageradamente ironica al participante que haya sido el 'figura' / MVP de esta jornada especifica por haber conseguido mas puntos en ella.\n" +
    "4. Analiza de forma comica las elecciones desastrosas o gloriosas de goleador y portero de los participantes en la jornada. Si el portero elegido por alguien encajo una goleada (quitandole puntos) o si su goleador estrella no le mete un gol ni al arcoiris, burlate abiertamente de esa eleccion cuñada.\n" +
    "5. Genera ademas de la cronica principal, 2 o 3 noticias secundarias breves e igual de comicas sobre otros participantes de la clasificación.\n" +
    "6. CRITICAL: No utilices NINGUN emoji bajo ninguna circunstancia. La cronica, titulares, subtitulo y noticias secundarias deben estar 100% libres de emojis.\n\n" +
    "Debes devolver obligatoriamente un JSON plano con la siguiente estructura (no añadas markdown ni envoltorios de codigo ```json):\n" +
    "{\n" +
    "  \"titular\": \"UN TITULAR SENSACIONALISTA EN MAYUSCULAS\",\n" +
    "  \"subtitulo\": \"Un subtitulo que resuma la mofa de la jornada.\",\n" +
    "  \"cronica\": \"El cuerpo de la noticia con varios parrafos. Usa saltos de linea '\\\\n' para separar los parrafos.\",\n" +
    "  \"prompt_imagen\": \"A detailed English prompt for an AI image generator (Imagen 3). The generated image MUST be in the style of 'Garabatos Random' webcomic / doodles: simple, funny, hand-drawn illustration with thick shaky black lines, minimalist raw caricature drawing, very simple and basic coloring with flat tosco colors, blank or solid background. It should represent the funniest, most absurd or ridiculous situation described in the chronicle. Make it cartoonish, weird and comical. Do not include emojis.\",\n" +
    "  \"noticias_secundarias\": [\n" +
    "    {\n" +
    "      \"titular\": \"TITULO DE NOTICIA SECUNDARIA EN MAYUSCULAS\",\n" +
    "      \"resumen\": \"Texto corto, ironico y directo sobre esta noticia secundaria.\"\n" +
    "    },\n    {\n" +
    "      \"titular\": \"OTRO TITULO SECUNDARIO\",\n" +
    "      \"resumen\": \"Otro chisme gracioso sobre otro participante.\"\n" +
    "    }\n" +
    "  ]\n" +
    "}";

  const promptUsuario = "Jornada finalizada: " + labelEdicion + "\n\n" +
    "Puntos conseguidos SOLO en esta jornada (Rendimiento de la jornada) con desglose de elecciones:\n" + 
    leaderboardJornada.map(function(p, i) { 
      const partId = p.id;
      const pickInfo = detallePicks[partId] || { scorer: "Ninguno", scorerPoints: 0, gk: "Ninguno", gkPoints: 0 };
      return (i+1) + ". " + p.name + ": " + p.points + " puntos " +
        "(Goleador elegido: " + pickInfo.scorer + " que dio " + pickInfo.scorerPoints + " puntos por goles; " +
        "Portero elegido: " + pickInfo.gk + " que dio " + pickInfo.gkPoints + " puntos por goles concedidos)";
    }).join("\n") + 
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

  // Generar imagen mediante la API de Imagen 3 (imagen-3.0-generate-002) usando la API Key
  let base64Image = "";
  if (data.prompt_imagen) {
    try {
      const imagenUrl = "https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=" + apiKey;
      const imagenRequestBody = {
        instances: [
          {
            prompt: data.prompt_imagen
          }
        ],
        parameters: {
          sampleCount: 1,
          aspectRatio: "4:3",
          outputMimeType: "image/jpeg"
        }
      };
      const imagenOptions = {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(imagenRequestBody),
        muteHttpExceptions: true
      };
      const imagenResponse = UrlFetchApp.fetch(imagenUrl, imagenOptions);
      const imagenResponseCode = imagenResponse.getResponseCode();
      const imagenResponseText = imagenResponse.getContentText();
      
      if (imagenResponseCode === 200) {
        const imagenJsonResponse = JSON.parse(imagenResponseText);
        if (imagenJsonResponse.predictions && imagenJsonResponse.predictions.length > 0) {
          base64Image = imagenJsonResponse.predictions[0].bytesBase64Encoded;
        }
      } else {
        Logger.log("Error al generar imagen con Imagen 3: " + imagenResponseText);
      }
    } catch (e) {
      Logger.log("Excepcion al generar imagen: " + e.toString());
    }
  }
  
  guardarCronicaEnSheet(data.titular, data.subtitulo, data.cronica, labelEdicion, data.noticias_secundarias, base64Image, data.prompt_imagen);

  return "Cronica de IA generada y guardada con exito para " + labelEdicion;
}

function obtenerDetallePicksJornada(ss, roundKey) {
  const sheetParticipants = ss.getSheetByName("participants");
  const sheetPlayers = ss.getSheetByName("players");
  const sheetScorerPicks = ss.getSheetByName("scorer_picks");
  const sheetGkPicks = ss.getSheetByName("goalkeeper_picks");

  if (!sheetParticipants || !sheetPlayers || !sheetScorerPicks || !sheetGkPicks) {
    return {};
  }

  const participantsData = sheetParticipants.getDataRange().getValues();
  const pHeaders = participantsData[0];
  const pIdIdx = pHeaders.indexOf("id");
  const pNameIdx = pHeaders.indexOf("name");

  const partMap = {};
  for (let i = 1; i < participantsData.length; i++) {
    const pId = String(participantsData[i][pIdIdx]).trim();
    const pName = String(participantsData[i][pNameIdx]).trim();
    if (pId) {
      partMap[pId] = { name: pName, scorer: "Ninguno", scorerPoints: 0, gk: "Ninguno", gkPoints: 0 };
    }
  }

  const playersData = sheetPlayers.getDataRange().getValues();
  const plHeaders = playersData[0];
  const plIdIdx = plHeaders.indexOf("id");
  const plNameIdx = plHeaders.indexOf("name");
  
  const playersMap = {};
  for (let i = 1; i < playersData.length; i++) {
    const plId = String(playersData[i][plIdIdx]).trim();
    const plName = String(playersData[i][plNameIdx]).trim();
    if (plId) {
      playersMap[plId] = { name: plName, rowData: playersData[i] };
    }
  }

  // Goleador picks
  const scorerData = sheetScorerPicks.getDataRange().getValues();
  const spHeaders = scorerData[0];
  const spPartIdx = spHeaders.indexOf("participant_id");
  const spRoundIdx = spHeaders.indexOf("round_key");
  const spPlayerIdx = spHeaders.indexOf("player_id");

  for (let i = 1; i < scorerData.length; i++) {
    const rKey = String(scorerData[i][spRoundIdx]).trim();
    if (rKey === roundKey) {
      const pId = String(scorerData[i][spPartIdx]).trim();
      const plId = String(scorerData[i][spPlayerIdx]).trim();
      const part = partMap[pId];
      const player = playersMap[plId];
      if (part && player) {
        part.scorer = player.name;
        const colName = "goals_" + roundKey;
        const colIdx = plHeaders.indexOf(colName);
        if (colIdx !== -1) {
          const goals = Number(player.rowData[colIdx]) || 0;
          part.scorerPoints = goals;
        }
      }
    }
  }

  // Portero picks
  const gkData = sheetGkPicks.getDataRange().getValues();
  const gpHeaders = gkData[0];
  const gpPartIdx = gpHeaders.indexOf("participant_id");
  const gpRoundIdx = gpHeaders.indexOf("round_key");
  const gpPlayerIdx = gpHeaders.indexOf("player_id");

  for (let i = 1; i < gkData.length; i++) {
    const rKey = String(gkData[i][gpRoundIdx]).trim();
    if (rKey === roundKey) {
      const pId = String(gkData[i][gpPartIdx]).trim();
      const plId = String(gkData[i][gpPlayerIdx]).trim();
      const part = partMap[pId];
      const player = playersMap[plId];
      if (part && player) {
        part.gk = player.name;
        const colName = "conceded_" + roundKey;
        const colIdx = plHeaders.indexOf(colName);
        if (colIdx !== -1) {
          const conceded = Number(player.rowData[colIdx]);
          if (!isNaN(conceded)) {
            let pts = 0;
            if (conceded === 0) pts = 2;
            else if (conceded === 1) pts = 1;
            else pts = (2 - conceded);
            part.gkPoints = pts;
          }
        }
      }
    }
  }

  return partMap;
}

function _buildPorraContextFromSheet() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // Clasificación desde la hoja participants (leemos nombre)
    var partSheet = ss.getSheetByName("participants");
    var partData = partSheet ? partSheet.getDataRange().getValues() : [];
    var partHeaders = partData[0] || [];
    var nameIdx = partHeaders.indexOf("name");
    var partIdIdx = partHeaders.indexOf("id");

    // Mapa participant_id -> nombre
    var partNameMap = {};
    for (var i = 1; i < partData.length; i++) {
      if (partIdIdx !== -1 && nameIdx !== -1) {
        partNameMap[String(partData[i][partIdIdx])] = partData[i][nameIdx];
      }
    }

    // Mapa player_id -> nombre (desde hoja players)
    var playerNameMap = {};
    var playersSheet = ss.getSheetByName("players");
    if (playersSheet) {
      var pd = playersSheet.getDataRange().getValues();
      var ph = pd[0] || [];
      var pIdIdx = ph.indexOf("id");
      var pNameIdx = ph.indexOf("name");
      for (var i = 1; i < pd.length; i++) {
        if (pIdIdx !== -1 && pNameIdx !== -1) {
          playerNameMap[String(pd[i][pIdIdx])] = pd[i][pNameIdx];
        }
      }
    }

    // Picks de scorer y goalkeeper de la jornada actual
    var scorerSheet = ss.getSheetByName("scorer_picks");
    var gkSheet = ss.getSheetByName("goalkeeper_picks");

    var scorerLines = [];
    var gkLines = [];
    var currentRound = "grupo";

    if (scorerSheet) {
      var sd = scorerSheet.getDataRange().getValues();
      var sh = sd[0] || [];
      var sRoundIdx = sh.indexOf("round_key");
      var sPlayerIdx = sh.indexOf("player_id");
      var sPartIdx = sh.indexOf("participant_id");
      for (var i = sd.length - 1; i >= 1; i--) {
        if (sd[i][sRoundIdx]) { currentRound = sd[i][sRoundIdx]; break; }
      }
      for (var i = 1; i < sd.length; i++) {
        if (sd[i][sRoundIdx] === currentRound) {
          var partName = partNameMap[String(sd[i][sPartIdx])] || sd[i][sPartIdx] || "?";
          var playerName = playerNameMap[String(sd[i][sPlayerIdx])] || sd[i][sPlayerIdx] || "?";
          scorerLines.push(partName + ": " + playerName);
        }
      }
    }

    if (gkSheet) {
      var gd = gkSheet.getDataRange().getValues();
      var gh = gd[0] || [];
      var gRoundIdx = gh.indexOf("round_key");
      var gPlayerIdx = gh.indexOf("player_id");
      var gPartIdx = gh.indexOf("participant_id");
      for (var i = 1; i < gd.length; i++) {
        if (gd[i][gRoundIdx] === currentRound) {
          var gPartName = partNameMap[String(gd[i][gPartIdx])] || gd[i][gPartIdx] || "?";
          var gPlayerName = playerNameMap[String(gd[i][gPlayerIdx])] || gd[i][gPlayerIdx] || "?";
          gkLines.push(gPartName + ": " + gPlayerName);
        }
      }
    }

    // Leaderboard desde la hoja leaderboard o participants+points
    var lbSheet = ss.getSheetByName("leaderboard");
    var clasificacion = "";
    if (lbSheet) {
      var ld = lbSheet.getDataRange().getValues();
      var lh = ld[0] || [];
      var lNameIdx = lh.indexOf("name") !== -1 ? lh.indexOf("name") : 0;
      var lPtsIdx = lh.indexOf("total_points") !== -1 ? lh.indexOf("total_points") : lh.indexOf("points");
      for (var i = 1; i < Math.min(ld.length, 12); i++) {
        clasificacion += i + ". " + ld[i][lNameIdx] + " — " + ld[i][lPtsIdx] + " pts\n";
      }
    } else if (nameIdx !== -1 && partData.length > 1) {
      for (var i = 1; i < partData.length; i++) {
        clasificacion += i + ". " + partData[i][nameIdx] + "\n";
      }
    }

    // Calcular clasificación de la jornada actual
    var clasificacionJornada = "";
    try {
      var lbJornada = calcularLeaderboardEnBackend(ss, currentRound);
      if (lbJornada && lbJornada.length > 0) {
        // Ordenamos por puntos descendente
        lbJornada.sort(function(a, b) { return b.points - a.points; });
        lbJornada.forEach(function(p, idx) {
          clasificacionJornada += (idx + 1) + ". " + p.name + " — " + p.points + " pts\n";
        });
      }
    } catch(e) {
      clasificacionJornada = "No disponible";
    }

    return {
      jornada: currentRound,
      clasificacion: clasificacion.trim() || "Sin datos aún",
      clasificacionJornada: clasificacionJornada.trim() || "Sin datos aún",
      goleadores: scorerLines.join(", ") || "Sin picks aún",
      porteros: gkLines.join(", ") || "Sin picks aún"
    };
  } catch(e) {
    return null;
  }
}

function responderPreguntaOracle(question, history) {
  var apiKey = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY") || "AIzaSyC8C3hRR31m6M59BqwYprA8gnmFXep3NS4";
  const modelName = "gemma-4-31b-it";
  const url = "https://generativelanguage.googleapis.com/v1beta/models/" + modelName + ":generateContent?key=" + apiKey;

  var porraContext = _buildPorraContextFromSheet();

  var contextBlock = "";
  if (porraContext) {
    contextBlock = "\n\n--- DATOS ACTUALES DE LA PORRA (úsalos cuando sean relevantes) ---\n" +
      "Jornada en curso: " + porraContext.jornada + "\n" +
      "Clasificación global:\n" + porraContext.clasificacion + "\n" +
      "Picks de goleador esta jornada: " + porraContext.goleadores + "\n" +
      "Picks de portero esta jornada: " + porraContext.porteros + "\n" +
      "--- FIN DATOS PORRA ---";
  }

  const systemPrompt = "Actua como un cuñado experto en futbol de bar español, sabelotodo, sarcástico, respondón e ironico. Te llaman 'El Oráculo de la Barra'. Tienes acceso a los datos reales de una porra del Mundial entre amigos y DEBES usarlos cuando sean relevantes: comenta la clasificación, burla al colista, alaba al líder, opina sobre los picks de goleador y portero. Responde de forma muy concisa (maximo 2 parrafos cortos), usa expresiones tipicas como 'yo de esto se un rato', 'mi primo el del bar', 'eso ya lo vi venir', 'palillo en la boca', 'cuidao con el figura', 'para habernos matao', 'vaya tela'. Tus respuestas deben ser graciosas, exageradas, y muy seguras de si mismas." + contextBlock;

  let promptText = systemPrompt + "\n\n";
  if (Array.isArray(history)) {
    history.forEach(function(msg) {
      promptText += (msg.role === "user" ? "Usuario: " : "Cuñado: ") + msg.text + "\n";
    });
  }
  promptText += "Usuario: " + question + "\nCuñado:";

  const requestBody = {
    contents: [{
      parts: [{ text: promptText }]
    }]
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
    throw new Error("Error en la llamada a Gemma (codigo " + responseCode + "): " + responseText);
  }

  const jsonResponse = JSON.parse(responseText);
  try {
    return jsonResponse.candidates[0].content.parts[0].text.trim();
  } catch (e) {
    throw new Error("Respuesta invalida de la API de Gemma: " + responseText);
  }
}


function guardarCronicaEnSheet(titular, subtitulo, cronica, edicion, noticiasSecundarias, foto, promptImagen) {
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
  sheet.appendRow(["foto", foto || ""]);
  sheet.appendRow(["prompt_imagen", promptImagen || ""]);
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
            else if (evId === "E4") {
              var winners = actualRes.split(",").map(function(s) { return s.trim().toLowerCase(); });
              if (pickVal && winners.indexOf(pickVal.trim().toLowerCase()) !== -1) p.points += 3;
            }
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

// =============================================================================
// ADMINISTRACIÓN — editar pronósticos de cualquiera AUNQUE EL PLAZO HAYA PASADO
// =============================================================================
// El frontend lee los pronósticos de "Respuestas de formulario 1" y FUSIONA todos
// los envíos por participante (lo más reciente gana por clave). Por eso un override
// de admin es, simplemente, una fila NUEVA con el JSON corregido: al ser la última,
// gana, y como no pasa por savePredictions() no se le aplica ningún límite de plazo.
//
// Dos formas de usarlo:
//   A) Menú "🛠️ Porra Admin" (en la propia hoja): pide los datos y aplica el cambio.
//   B) Hoja "admin_overrides": escribes los cambios en celdas y pulsas
//      "Aplicar overrides…". Ideal para corregir varios de golpe desde el Excel.
// =============================================================================

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("🛠️ Porra Admin")
    .addItem("Editar pronóstico de partido…", "adminMenuEditMatch")
    .addItem("Editar goleador (jornada)…", "adminMenuEditScorer")
    .addItem("Editar portero (jornada)…", "adminMenuEditGoalkeeper")
    .addItem("Editar evento especial…", "adminMenuEditEvent")
    .addSeparator()
    .addItem("Crear/abrir hoja 'admin_overrides'", "ensureAdminOverridesSheet")
    .addItem("Aplicar overrides de 'admin_overrides'", "applyAdminOverrides")
    .addToUi();
}

// Devuelve el nombre EXACTO del participante (tal y como está en 'participants'),
// buscándolo sin distinguir mayúsculas/acentos. Lanza error si no existe.
function _adminCanonicalName(ss, name) {
  var sheet = ss.getSheetByName("participants");
  if (!sheet) throw new Error("No se encontró la pestaña 'participants'.");
  var data = sheet.getDataRange().getValues();
  var nameIdx = data[0].indexOf("name");
  if (nameIdx === -1) throw new Error("La hoja 'participants' no tiene columna 'name'.");

  function norm(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  }
  var target = norm(name);
  for (var i = 1; i < data.length; i++) {
    if (norm(data[i][nameIdx]) === target) return String(data[i][nameIdx]).trim();
  }
  throw new Error("Participante no encontrado en 'participants': " + name);
}

// Núcleo: añade una fila de override (JSON parcial) a "Respuestas de formulario 1".
// partial = { matchPredictions?, scorerPicks?, goalkeeperPicks?, specialEventPicks? }
function adminOverridePrediction(name, partial) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var canonical = _adminCanonicalName(ss, name);

  var sheetResponse = ss.getSheetByName("Respuestas de formulario 1");
  if (!sheetResponse) throw new Error("No se encontró la pestaña 'Respuestas de formulario 1'.");

  var now = new Date();
  var payload = {
    name: canonical,
    matchPredictions: partial.matchPredictions || {},
    scorerPicks: partial.scorerPicks || {},
    goalkeeperPicks: partial.goalkeeperPicks || {},
    specialEventPicks: partial.specialEventPicks || {},
    _admin: true,
    _adminAt: now.toISOString()
  };
  sheetResponse.appendRow([now.toISOString(), JSON.stringify(payload)]);
  Logger.log("Override admin aplicado para " + canonical + ": " + JSON.stringify(partial));
  return "OK: override aplicado a " + canonical;
}

// --- Wrappers para un único cambio (se pueden ejecutar también desde el editor) ---
function adminSetMatchScore(name, matchId, home, away) {
  var h = Number(home), a = Number(away);
  if (isNaN(h) || isNaN(a)) throw new Error("Marcador inválido: " + home + "-" + away);
  var mp = {}; mp[String(matchId).trim()] = { home: h, away: a };
  return adminOverridePrediction(name, { matchPredictions: mp });
}
function adminSetScorer(name, roundKey, playerId) {
  var o = {}; o[String(roundKey).trim()] = String(playerId).trim();
  return adminOverridePrediction(name, { scorerPicks: o });
}
function adminSetGoalkeeper(name, roundKey, playerId) {
  var o = {}; o[String(roundKey).trim()] = String(playerId).trim();
  return adminOverridePrediction(name, { goalkeeperPicks: o });
}
function adminSetEvent(name, eventId, value) {
  var o = {}; o[String(eventId).trim()] = String(value).trim();
  return adminOverridePrediction(name, { specialEventPicks: o });
}

// --- Handlers del menú (piden los datos por ventana emergente) ---
function _prompt(ui, msg) {
  var r = ui.prompt("🛠️ Porra Admin", msg, ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return null;
  return r.getResponseText().trim();
}

function adminMenuEditMatch() {
  var ui = SpreadsheetApp.getUi();
  var name = _prompt(ui, "Nombre del participante:"); if (name === null) return;
  var matchId = _prompt(ui, "ID del partido (p.ej. m001):"); if (matchId === null) return;
  var home = _prompt(ui, "Goles LOCAL:"); if (home === null) return;
  var away = _prompt(ui, "Goles VISITANTE:"); if (away === null) return;
  try { adminSetMatchScore(name, matchId, home, away); ui.alert("✅ Hecho: " + name + " · " + matchId + " " + home + "-" + away); }
  catch (e) { ui.alert("❌ " + e.message); }
}
function adminMenuEditScorer() {
  var ui = SpreadsheetApp.getUi();
  var name = _prompt(ui, "Nombre del participante:"); if (name === null) return;
  var rk = _prompt(ui, "Jornada (round_key, p.ej. group_md1):"); if (rk === null) return;
  var pid = _prompt(ui, "ID del jugador (player_id):"); if (pid === null) return;
  try { adminSetScorer(name, rk, pid); ui.alert("✅ Goleador actualizado: " + name + " · " + rk + " → " + pid); }
  catch (e) { ui.alert("❌ " + e.message); }
}
function adminMenuEditGoalkeeper() {
  var ui = SpreadsheetApp.getUi();
  var name = _prompt(ui, "Nombre del participante:"); if (name === null) return;
  var rk = _prompt(ui, "Jornada (round_key, p.ej. group_md1):"); if (rk === null) return;
  var pid = _prompt(ui, "ID del jugador/portero (player_id):"); if (pid === null) return;
  try { adminSetGoalkeeper(name, rk, pid); ui.alert("✅ Portero actualizado: " + name + " · " + rk + " → " + pid); }
  catch (e) { ui.alert("❌ " + e.message); }
}
function adminMenuEditEvent() {
  var ui = SpreadsheetApp.getUi();
  var name = _prompt(ui, "Nombre del participante:"); if (name === null) return;
  var ev = _prompt(ui, "ID del evento (p.ej. E1):"); if (ev === null) return;
  var val = _prompt(ui, "Valor del pronóstico:"); if (val === null) return;
  try { adminSetEvent(name, ev, val); ui.alert("✅ Evento actualizado: " + name + " · " + ev + " → " + val); }
  catch (e) { ui.alert("❌ " + e.message); }
}

// --- Vía hoja de cálculo: 'admin_overrides' ---
// Columnas: name | tipo | clave | valor1 | valor2 | aplicado
//   tipo=match       → clave=matchId   valor1=goles_local  valor2=goles_visitante
//   tipo=scorer      → clave=round_key valor1=player_id
//   tipo=goalkeeper  → clave=round_key valor1=player_id
//   tipo=event       → clave=event_id  valor1=valor
function ensureAdminOverridesSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("admin_overrides");
  if (!sh) {
    sh = ss.insertSheet("admin_overrides");
    sh.appendRow(["name", "tipo", "clave", "valor1", "valor2", "aplicado"]);
    sh.appendRow(["Juan", "match", "m001", "3", "1", ""]);
    sh.appendRow(["Juan", "scorer", "group_md1", "pl_messi", "", ""]);
    sh.appendRow(["Ana", "goalkeeper", "group_md1", "pl_courtois", "", ""]);
    sh.appendRow(["Ana", "event", "E1", "Argentina", "", ""]);
    sh.getRange(1, 1, 1, 6).setFontWeight("bold");
  }
  ss.setActiveSheet(sh);
  try { SpreadsheetApp.getUi().alert("Rellena las filas de 'admin_overrides' y luego usa el menú → 'Aplicar overrides…'. Las filas de ejemplo puedes borrarlas."); } catch (e) {}
  return "admin_overrides lista";
}

function applyAdminOverrides() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("admin_overrides");
  if (!sh) { ensureAdminOverridesSheet(); return "Se creó 'admin_overrides'. Rellénala y vuelve a aplicar."; }

  var data = sh.getDataRange().getValues();
  var H = data[0];
  var ci = {
    name: H.indexOf("name"), tipo: H.indexOf("tipo"), clave: H.indexOf("clave"),
    valor1: H.indexOf("valor1"), valor2: H.indexOf("valor2"), aplicado: H.indexOf("aplicado")
  };
  for (var k in ci) if (ci[k] === -1) throw new Error("Falta la columna '" + k + "' en 'admin_overrides'.");

  var applied = 0, errors = [];
  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    var name = String(row[ci.name]).trim();
    var tipo = String(row[ci.tipo]).trim().toLowerCase();
    if (!name || !tipo) continue;
    if (String(row[ci.aplicado]).trim() !== "") continue; // ya aplicada

    var clave = String(row[ci.clave]).trim();
    var v1 = String(row[ci.valor1]).trim();
    var v2 = String(row[ci.valor2]).trim();

    try {
      if (tipo === "match")            adminSetMatchScore(name, clave, v1, v2);
      else if (tipo === "scorer")      adminSetScorer(name, clave, v1);
      else if (tipo === "goalkeeper")  adminSetGoalkeeper(name, clave, v1);
      else if (tipo === "event")       adminSetEvent(name, clave, v1);
      else throw new Error("tipo desconocido: " + tipo);

      sh.getRange(r + 1, ci.aplicado + 1).setValue("SÍ " + new Date().toISOString());
      applied++;
    } catch (e) {
      sh.getRange(r + 1, ci.aplicado + 1).setValue("ERROR: " + e.message);
      errors.push("Fila " + (r + 1) + ": " + e.message);
    }
  }

  var msg = "Overrides aplicados: " + applied + (errors.length ? (" · errores: " + errors.length) : "");
  Logger.log(msg + (errors.length ? "\n" + errors.join("\n") : ""));
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return msg;
}

// --- Override desde la web de admin (?action=adminOverride) -------------------
// Protegido con la propiedad de script ADMIN_KEY (NO el adminPassword del
// config.js, que es público). Si ADMIN_KEY no está configurada, se rechaza.
function adminOverrideFromParams(p) {
  var adminKey = PropertiesService.getScriptProperties().getProperty("ADMIN_KEY");
  if (!adminKey) {
    throw new Error("ADMIN_KEY no configurada en Propiedades del script. Configúrala para habilitar los overrides desde la web.");
  }
  if (!p.key || String(p.key) !== String(adminKey)) {
    throw new Error("Clave de administración incorrecta.");
  }

  var name = p.name;
  var tipo = String(p.tipo || "").toLowerCase();
  var clave = p.clave;
  if (!name || !tipo || !clave) throw new Error("Faltan parámetros (name, tipo, clave).");

  var msg;
  if (tipo === "match")            msg = adminSetMatchScore(name, clave, p.valor1, p.valor2);
  else if (tipo === "scorer")      msg = adminSetScorer(name, clave, p.valor1);
  else if (tipo === "goalkeeper")  msg = adminSetGoalkeeper(name, clave, p.valor1);
  else if (tipo === "event")       msg = adminSetEvent(name, clave, p.valor1);
  else throw new Error("tipo desconocido: " + tipo);

  return { message: msg, timestamp: new Date().toISOString() };
}
