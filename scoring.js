// =============================================================================
// La Porra del Mundial — Scoring Engine
// =============================================================================
// Pure functions for all 4 scoring modules + leaderboard calculation.
// No side effects — receives data, returns scores.
// =============================================================================

const Scoring = (() => {
  "use strict";

  // ---------------------------------------------------------------------------
  // Module 1 — Match Predictions
  // ---------------------------------------------------------------------------
  // 3 pts: exact score
  // 2 pts: exact goal difference (not score)
  // 1 pt:  correct winner / draw
  // 0 pts: miss
  // ×2 if match.is_double_points (Wild Match E2)
  // ---------------------------------------------------------------------------

  function calculateMatchPoints(predictedHome, predictedAway, actualHome, actualAway, isDoublePoints) {
    if (actualHome === null || actualAway === null) return null; // match not played
    if (predictedHome === null || predictedAway === null) return 0; // no prediction

    let points = 0;

    if (predictedHome === actualHome && predictedAway === actualAway) {
      points = 3;
    } else if ((predictedHome - predictedAway) === (actualHome - actualAway)) {
      points = 2;
    } else if (Math.sign(predictedHome - predictedAway) === Math.sign(actualHome - actualAway)) {
      points = 1;
    }

    return isDoublePoints ? points * 2 : points;
  }

  // ---------------------------------------------------------------------------
  // Module 2 — Scorer of the Round
  // ---------------------------------------------------------------------------
  // +1 pt per goal scored by the chosen player in that round.
  // Own goals don't count. Penalty shootout goals don't count.
  // ---------------------------------------------------------------------------

  function calculateScorerPoints(goalsScored) {
    if (goalsScored === null || goalsScored === undefined) return 0;
    return Math.max(0, parseInt(goalsScored, 10) || 0);
  }

  // ---------------------------------------------------------------------------
  // Module 3 — Goalkeeper of the Round
  // ---------------------------------------------------------------------------
  // Per match played by the chosen goalkeeper:
  //   0 goals conceded → +2 pts
  //   1 goal conceded  → +1 pt
  //   2+ goals         → 2 - goals_conceded (can be negative)
  // Penalty shootout goals don't count.
  // ---------------------------------------------------------------------------

  function calculateGoalkeeperPointsPerMatch(goalsConceded) {
    if (goalsConceded === null || goalsConceded === undefined) return 0;
    const gc = parseInt(goalsConceded, 10);
    if (isNaN(gc)) return 0;

    if (gc === 0) return 2;
    if (gc === 1) return 1;
    return 2 - gc; // negative when gc >= 3
  }

  function calculateGoalkeeperPoints(matchGoalsConcededArray) {
    if (!Array.isArray(matchGoalsConcededArray) || matchGoalsConcededArray.length === 0) return 0;
    return matchGoalsConcededArray.reduce((total, gc) => total + calculateGoalkeeperPointsPerMatch(gc), 0);
  }

  // ---------------------------------------------------------------------------
  // Module 4 — Special Events
  // ---------------------------------------------------------------------------

  function calculateSpecialEventPoints(eventId, pickValue, actualResult) {
    if (!actualResult || !pickValue) return 0;

    switch (eventId) {
      case "E1": // Ganador del Mundial
        if (typeof actualResult === "object" && actualResult !== null) {
          if (pickValue === actualResult.winner) return 5;
        } else if (pickValue === actualResult) {
          return 5;
        }
        return 0;

      case "E2": // Wild Match — no pick, handled via is_double_points
        return 0;

      case "E3": // Hero Goalkeeper
        if (typeof actualResult === "object" && actualResult !== null) {
          if (actualResult.annulled) return 0;
          if (pickValue === actualResult.goalkeeper_id) return 4;
        } else if (typeof actualResult === "string") {
          if (actualResult === "annulled" || actualResult === "ANULADO" || actualResult === "none") return 0;
          if (pickValue === actualResult) return 4;
        }
        return 0;

      case "E4": // ¿Qué selección caerá antes?
        if (typeof actualResult === "object" && actualResult !== null) {
          const team = actualResult.team || "";
          if (pickValue && team && pickValue.trim().toLowerCase() === team.trim().toLowerCase()) return 3;
        } else if (typeof actualResult === "string") {
          if (actualResult === "annulled" || actualResult === "ANULADO" || actualResult === "none") return 0;
          const winners = actualResult.split(",").map(s => s.trim().toLowerCase());
          if (pickValue && winners.includes(pickValue.trim().toLowerCase())) return 3;
        }
        return 0;

      case "E5": // Wild Hat-Trick
        if (typeof actualResult === "object" && actualResult !== null) {
          if (pickValue === actualResult.player_id) return 5;
        } else if (pickValue === actualResult) {
          return 5;
        }
        return 0;

      case "E6": // Partido con más goles (Eliminatorias)
        const pickGoals = parseInt(pickValue, 10);
        const actualGoals = typeof actualResult === "object" && actualResult !== null ? parseInt(actualResult.goals, 10) : parseInt(actualResult, 10);
        if (isNaN(pickGoals) || isNaN(actualGoals)) return 0;
        if (pickGoals === actualGoals) return 3;
        if (Math.abs(pickGoals - actualGoals) === 1) return 1;
        return 0;

      default:
        return 0;
    }
  }

  // ---------------------------------------------------------------------------
  // Leaderboard Builder
  // ---------------------------------------------------------------------------

  function buildLeaderboard(participantsData, matchPredictions, scorerPicks, goalkeeperPicks, specialEventPicks) {
    const board = participantsData.map(p => {
      const matchPts = sumField(matchPredictions.filter(mp => mp.participant_id === p.id), "points_earned");
      const scorerPts = sumField(scorerPicks.filter(sp => sp.participant_id === p.id), "points_earned");
      const gkPts = sumField(goalkeeperPicks.filter(gp => gp.participant_id === p.id), "points_earned");
      const specialPts = sumField(specialEventPicks.filter(se => se.participant_id === p.id), "points_earned");

      return {
        id: p.id,
        name: p.name,
        paid: parseBool(p.paid),
        matchPoints: matchPts,
        scorerPoints: scorerPts,
        goalkeeperPoints: gkPts,
        specialEventPoints: specialPts,
        scorerGoalkeeperPoints: scorerPts + gkPts,
        totalPoints: matchPts + scorerPts + gkPts + specialPts
      };
    });

    // Sort: total desc, then tiebreakers
    board.sort((a, b) => {
      // 1. Total points
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      // 2. Module 1 (match predictions)
      if (b.matchPoints !== a.matchPoints) return b.matchPoints - a.matchPoints;
      // 3. Modules 2+3 combined
      if (b.scorerGoalkeeperPoints !== a.scorerGoalkeeperPoints) return b.scorerGoalkeeperPoints - a.scorerGoalkeeperPoints;
      // 4. Module 4 (special events)
      if (b.specialEventPoints !== a.specialEventPoints) return b.specialEventPoints - a.specialEventPoints;
      // 5. Alphabetical as last resort
      return a.name.localeCompare(b.name);
    });

    // Assign positions (handle ties)
    let currentPos = 1;
    board.forEach((entry, i) => {
      if (i > 0 && entry.totalPoints === board[i - 1].totalPoints
        && entry.matchPoints === board[i - 1].matchPoints
        && entry.scorerGoalkeeperPoints === board[i - 1].scorerGoalkeeperPoints
        && entry.specialEventPoints === board[i - 1].specialEventPoints) {
        entry.position = board[i - 1].position;
      } else {
        entry.position = currentPos;
      }
      currentPos = i + 2;
    });

    return board;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function sumField(arr, field) {
    return arr.reduce((sum, item) => {
      const val = parseFloat(item[field]);
      return sum + (isNaN(val) ? 0 : val);
    }, 0);
  }

  function parseBool(val) {
    if (typeof val === "boolean") return val;
    if (typeof val === "string") return val.toLowerCase() === "true" || val === "1";
    return !!val;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  return {
    calculateMatchPoints,
    calculateScorerPoints,
    calculateGoalkeeperPointsPerMatch,
    calculateGoalkeeperPoints,
    calculateSpecialEventPoints,
    buildLeaderboard,
    parseBool
  };
})();
