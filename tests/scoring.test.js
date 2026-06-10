const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Cargar scoring.js en contexto virtual
const root = path.resolve(__dirname, "..");
const context = { console, Math, parseFloat, isNaN, parseInt, Array };
vm.createContext(context);
vm.runInContext(`${fs.readFileSync(path.join(root, "scoring.js"), "utf8")}\nthis.Scoring = Scoring;`, context);

const { Scoring } = context;

// =============================================================================
// TESTS: Módulo 1 — Partidos (calculateMatchPoints)
// =============================================================================

// Partido no jugado todavía (resultado real es null)
assert.equal(Scoring.calculateMatchPoints(2, 1, null, null, false), null);

// Participante no envió pronóstico (pronóstico es null)
assert.equal(Scoring.calculateMatchPoints(null, null, 1, 0, false), 0);

// Caso 1: Acierto de marcador exacto (3 pts / 6 pts en salvaje)
assert.equal(Scoring.calculateMatchPoints(2, 1, 2, 1, false), 3);
assert.equal(Scoring.calculateMatchPoints(2, 1, 2, 1, true), 6);
assert.equal(Scoring.calculateMatchPoints(0, 0, 0, 0, false), 3);
assert.equal(Scoring.calculateMatchPoints(0, 0, 0, 0, true), 6);

// Caso 2: Diferencia de goles exacta pero no marcador (2 pts / 4 pts en salvaje)
assert.equal(Scoring.calculateMatchPoints(2, 1, 1, 0, false), 2);
assert.equal(Scoring.calculateMatchPoints(2, 1, 1, 0, true), 4);
assert.equal(Scoring.calculateMatchPoints(1, 1, 2, 2, false), 2);
assert.equal(Scoring.calculateMatchPoints(1, 1, 2, 2, true), 4);

// Caso 3: Signo correcto (ganador/empate) pero no diferencia (1 pt / 2 pts en salvaje)
assert.equal(Scoring.calculateMatchPoints(3, 1, 1, 0, false), 1);
assert.equal(Scoring.calculateMatchPoints(3, 1, 1, 0, true), 2);
assert.equal(Scoring.calculateMatchPoints(1, 0, 3, 1, false), 1);
assert.equal(Scoring.calculateMatchPoints(1, 0, 3, 1, true), 2);

// Caso 4: Fallo completo (0 pts)
assert.equal(Scoring.calculateMatchPoints(2, 1, 0, 2, false), 0);
assert.equal(Scoring.calculateMatchPoints(2, 1, 0, 2, true), 0);
assert.equal(Scoring.calculateMatchPoints(1, 1, 2, 1, false), 0);
assert.equal(Scoring.calculateMatchPoints(1, 0, 0, 0, false), 0);

// =============================================================================
// TESTS: Módulo 2 — Goleador (calculateScorerPoints)
// =============================================================================
assert.equal(Scoring.calculateScorerPoints(3), 3);
assert.equal(Scoring.calculateScorerPoints("5"), 5);
assert.equal(Scoring.calculateScorerPoints(0), 0);
assert.equal(Scoring.calculateScorerPoints(null), 0);
assert.equal(Scoring.calculateScorerPoints(undefined), 0);
assert.equal(Scoring.calculateScorerPoints("invalid"), 0);

// =============================================================================
// TESTS: Módulo 3 — Portero (calculateGoalkeeperPoints)
// =============================================================================
// Individuales
assert.equal(Scoring.calculateGoalkeeperPointsPerMatch(0), 2);       // 0 goles = 2 pts
assert.equal(Scoring.calculateGoalkeeperPointsPerMatch(1), 1);       // 1 gol = 1 pt
assert.equal(Scoring.calculateGoalkeeperPointsPerMatch(2), 0);       // 2 goles = 0 pts
assert.equal(Scoring.calculateGoalkeeperPointsPerMatch(3), -1);      // 3 goles = -1 pt
assert.equal(Scoring.calculateGoalkeeperPointsPerMatch(5), -3);      // 5 goles = -3 pts
assert.equal(Scoring.calculateGoalkeeperPointsPerMatch("0"), 2);
assert.equal(Scoring.calculateGoalkeeperPointsPerMatch(null), 0);
assert.equal(Scoring.calculateGoalkeeperPointsPerMatch("invalid"), 0);

// Acumulados de portero por jornada (recibe array de goles encajados en los partidos de esa ronda)
assert.equal(Scoring.calculateGoalkeeperPoints([0]), 2);
assert.equal(Scoring.calculateGoalkeeperPoints([1, 0]), 3);          // 1 gol (1) + 0 goles (2) = 3 pts
assert.equal(Scoring.calculateGoalkeeperPoints([3, 2]), -1);         // 3 goles (-1) + 2 goles (0) = -1 pt
assert.equal(Scoring.calculateGoalkeeperPoints([]), 0);
assert.equal(Scoring.calculateGoalkeeperPoints(null), 0);

// =============================================================================
// TESTS: Módulo 4 — Eventos Especiales (calculateSpecialEventPoints)
// =============================================================================
// E1: Ganador del Mundial (acierto = 5 pts)
assert.equal(Scoring.calculateSpecialEventPoints("E1", "Spain", "Spain"), 5);
assert.equal(Scoring.calculateSpecialEventPoints("E1", "Spain", { winner: "Spain" }), 5);
assert.equal(Scoring.calculateSpecialEventPoints("E1", "Spain", "Brazil"), 0);

// E3: Portero Héroe (acierto = 4 pts)
assert.equal(Scoring.calculateSpecialEventPoints("E3", "pl03", "pl03"), 4);
assert.equal(Scoring.calculateSpecialEventPoints("E3", "pl03", { goalkeeper_id: "pl03" }), 4);
assert.equal(Scoring.calculateSpecialEventPoints("E3", "pl03", "pl04"), 0);
assert.equal(Scoring.calculateSpecialEventPoints("E3", "pl03", "annulled"), 0);
assert.equal(Scoring.calculateSpecialEventPoints("E3", "pl03", "none"), 0);

// E4: ¿Qué selección caerá antes? (acierto = 3 pts fijos, soporta empates separados por comas)
assert.equal(Scoring.calculateSpecialEventPoints("E4", "Brazil", "Brazil"), 3);
assert.equal(Scoring.calculateSpecialEventPoints("E4", "Brazil", "Brazil, France"), 3);
assert.equal(Scoring.calculateSpecialEventPoints("E4", "France", "Brazil, France"), 3);
assert.equal(Scoring.calculateSpecialEventPoints("E4", "Brazil", { team: "Brazil" }), 3);
assert.equal(Scoring.calculateSpecialEventPoints("E4", "Brazil", "France"), 0);

// E5: Hat-Trick Salvaje (acierto = 5 pts)
assert.equal(Scoring.calculateSpecialEventPoints("E5", "pl01", "pl01"), 5);
assert.equal(Scoring.calculateSpecialEventPoints("E5", "pl01", { player_id: "pl01" }), 5);
assert.equal(Scoring.calculateSpecialEventPoints("E5", "pl01", "pl02"), 0);

// E6: Partido con más goles (Exacto = 3 pts, a 1 de diferencia = 1 pt)
assert.equal(Scoring.calculateSpecialEventPoints("E6", "6", "6"), 3);
assert.equal(Scoring.calculateSpecialEventPoints("E6", "5", "6"), 1);
assert.equal(Scoring.calculateSpecialEventPoints("E6", "7", "6"), 1);
assert.equal(Scoring.calculateSpecialEventPoints("E6", "4", "6"), 0);
assert.equal(Scoring.calculateSpecialEventPoints("E6", "5", { goals: 6 }), 1);

// =============================================================================
// TESTS: Clasificación y Desempates (buildLeaderboard)
// =============================================================================
const participants = [
  { id: "p1", name: "Alicia", paid: "TRUE" },
  { id: "p2", name: "Bruno", paid: "FALSE" },
  { id: "p3", name: "Carlos", paid: "TRUE" },
  { id: "p4", name: "Daniela", paid: "TRUE" }
];

// Test 1: Clasificación básica por puntos totales desc
const matchPreds1 = [
  { participant_id: "p1", points_earned: 10 },
  { participant_id: "p2", points_earned: 8 },
  { participant_id: "p3", points_earned: 6 },
  { participant_id: "p4", points_earned: 4 }
];
const lb1 = Scoring.buildLeaderboard(participants, matchPreds1, [], [], []);
assert.equal(lb1[0].id, "p1");
assert.equal(lb1[0].position, 1);
assert.equal(lb1[1].id, "p2");
assert.equal(lb1[1].position, 2);
assert.equal(lb1[2].id, "p3");
assert.equal(lb1[2].position, 3);
assert.equal(lb1[3].id, "p4");
assert.equal(lb1[3].position, 4);

// Test 2: Desempate por M1 (Puntos de partidos)
const matchPreds2 = [
  { participant_id: "p1", points_earned: 5 }, // total = 5 + 5 = 10 pts
  { participant_id: "p2", points_earned: 7 }  // total = 7 + 3 = 10 pts
];
const scorerPicks2 = [
  { participant_id: "p1", points_earned: 5 },
  { participant_id: "p2", points_earned: 3 }
];
const lb2 = Scoring.buildLeaderboard([participants[0], participants[1]], matchPreds2, scorerPicks2, [], []);
assert.equal(lb2[0].id, "p2"); // Bruno va primero porque tiene 7 pts de M1 vs 5 de Alicia
assert.equal(lb2[1].id, "p1");

// Test 3: Desempate por M2+M3 (Goleador + Portero)
const matchPreds3 = [
  { participant_id: "p1", points_earned: 5 }, // M1 = 5, total = 5 + 5 + 0 = 10 pts
  { participant_id: "p2", points_earned: 5 }  // M1 = 5, total = 5 + 2 + 3 = 10 pts
];
const scorerPicks3 = [
  { participant_id: "p1", points_earned: 5 }, // M2 = 5, M2+M3 = 5
  { participant_id: "p2", points_earned: 2 }  // M2 = 2
];
const gkPicks3 = [
  { participant_id: "p2", points_earned: 3 }  // M3 = 3, M2+M3 = 5
];
const specialPicks3 = [
  { participant_id: "p1", points_earned: 0 },
  { participant_id: "p2", points_earned: 0 }
];
// p1 y p2 empatan en M1 (5 pts), y empatan en M2+M3 (5 pts).
// Alicia (p1) tiene 0 en M4, Bruno (p2) tiene 0 en M4.
// Desempate alfabético: Alicia ("Alicia" -> p1) gana a Bruno ("Bruno" -> p2).
const lb3 = Scoring.buildLeaderboard([participants[0], participants[1]], matchPreds3, scorerPicks3, gkPicks3, specialPicks3);
assert.equal(lb3[0].id, "p1");
assert.equal(lb3[1].id, "p2");

// Test 4: Desempate por M4 (Eventos Especiales)
const matchPreds4 = [
  { participant_id: "p1", points_earned: 5 }, // M1 = 5, M4 = 5. Total = 10 pts
  { participant_id: "p2", points_earned: 5 }  // M1 = 5, M2+M3 = 5. Total = 10 pts
];
const scorerPicks4 = [
  { participant_id: "p2", points_earned: 5 }
];
const specialPicks4 = [
  { participant_id: "p1", points_earned: 5 }
];
// Ambos tienen 10 puntos totales y empatan en M1 (5 pts).
// Bruno (p2) tiene 5 pts en M2+M3. Alicia (p1) tiene 0 pts en M2+M3.
// Bruno (p2) queda por encima porque tiene mejor M2+M3 (5 vs 0) que va antes de M4.
const lb4 = Scoring.buildLeaderboard([participants[0], participants[1]], matchPreds4, scorerPicks4, [], specialPicks4);
assert.equal(lb4[0].id, "p2");
assert.equal(lb4[1].id, "p1");

// Test 5: Empates absolutos comparten posición
const matchPreds5 = [
  { participant_id: "p1", points_earned: 5 },
  { participant_id: "p2", points_earned: 5 }
];
// Alicia y Bruno empatan en TODO (M1=5, M2+M3=0, M4=0).
// Deben tener la misma posición (1) aunque estén ordenados alfabéticamente en la lista.
const lb5 = Scoring.buildLeaderboard([participants[0], participants[1]], matchPreds5, [], [], []);
assert.equal(lb5[0].position, 1);
assert.equal(lb5[1].position, 1);

console.log("scoring.test.js: OK");
