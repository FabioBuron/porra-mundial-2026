const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const context = {
  console,
  URLSearchParams,
  Date,
  Math,
  setInterval,
  clearInterval,
  document: {
    getElementById() {
      return {
        addEventListener() {}
      };
    },
    createElement() {
      return {
        appendChild() {},
        style: {},
        addEventListener() {}
      };
    },
    body: {
      appendChild() {}
    }
  },
  CONFIG: {
    roundLabels: {
      group_md1: "Jornada 1",
      group_md2: "Jornada 2",
      r16: "Octavos de Final"
    }
  }
};

vm.createContext(context);
vm.runInContext(`${fs.readFileSync(path.join(root, "scoring.js"), "utf8")}\nthis.Scoring = Scoring;`, context);
vm.runInContext(`${fs.readFileSync(path.join(root, "extras.js"), "utf8")}\nthis.PorraExtras = PorraExtras;`, context);

const { Scoring, PorraExtras } = context;

const data = {
  participants: [
    { id: "a", name: "Alicia" },
    { id: "b", name: "Bruno" }
  ],
  matches: [
    { id: "m1", phase: "group", matchday: 1, home_team: "Spain", away_team: "Brazil", kickoff_utc: "2026-06-11T18:00:00Z", home_score: "", away_score: "", status: "scheduled", is_double_points: false },
    { id: "m2", phase: "group", matchday: 1, home_team: "France", away_team: "Germany", kickoff_utc: "2026-06-12T18:00:00Z", home_score: null, away_score: null, status: "scheduled", is_double_points: false },
    { id: "m3", phase: "group", matchday: 2, home_team: "USA", away_team: "Mexico", kickoff_utc: "2026-06-15T18:00:00Z", home_score: 2, away_score: 0, status: "finished", is_double_points: false }
  ],
  matchPredictions: [
    { participant_id: "a", match_id: "m1", predicted_home: 1, predicted_away: 0, points_earned: 0 },
    { participant_id: "b", match_id: "m1", predicted_home: 0, predicted_away: 1, points_earned: 0 },
    { participant_id: "a", match_id: "m2", predicted_home: 2, predicted_away: 1, points_earned: 0 },
    { participant_id: "b", match_id: "m2", predicted_home: 1, predicted_away: 1, points_earned: 0 },
    { participant_id: "a", match_id: "m3", predicted_home: 2, predicted_away: 0, points_earned: 3 },
    { participant_id: "b", match_id: "m3", predicted_home: 1, predicted_away: 0, points_earned: 1 }
  ],
  scorerPicks: [
    { participant_id: "a", round_key: "group_md2", points_earned: 2 },
    { participant_id: "b", round_key: "group_md2", points_earned: 1 }
  ],
  goalkeeperPicks: [
    { participant_id: "a", round_key: "group_md2", points_earned: 1 },
    { participant_id: "b", round_key: "group_md2", points_earned: 0 }
  ],
  specialEventPicks: [
    { participant_id: "a", event_id: "E1", points_earned: 5 },
    { participant_id: "b", event_id: "E1", points_earned: 0 }
  ],
  specialEvents: [
    { id: "E1", name: "Ganador", description: "Campeon", deadline_utc: "2026-06-11T17:00:00Z", is_active: true },
    { id: "E3", name: "Portero Heroe", description: "Penalti", deadline_utc: "2026-07-04T16:00:00Z", is_active: true }
  ]
};

assert.equal(Scoring.calculateMatchPoints(1, 0, 1, 0, false), 3);
assert.equal(Scoring.calculateMatchPoints(1, 0, 2, 1, true), 4);

const sim = PorraExtras.simulateScenarios(data, "a", "b", "group_md1");
assert.equal(sim.matches.length, 2);
assert.equal(sim.bestDelta, 6);
assert.equal(sim.worstDelta, -6);
assert.equal(sim.bestDiff, 15);
assert.equal(sim.worstDiff, 3);
assert.deepEqual(sim.matches.map(m => [m.best.home, m.best.away]), [[1, 0], [2, 1]]);

const h2h = PorraExtras.headToHead(data, "a", "b");
assert.equal(h2h.rows.length, 1);
assert.equal(h2h.winsA, 1);
assert.equal(h2h.winsB, 0);
assert.equal(h2h.moduleTotals.matchA, 3);
assert.equal(h2h.moduleTotals.matchB, 1);
assert.equal(h2h.moduleTotals.specialA, 5);

const reminderEvents = PorraExtras.buildReminderEvents(data);
assert.equal(reminderEvents[0].uid, "porra-evento-E1@porra-mundial");
assert.equal(reminderEvents[1].uid, "porra-group_md1@porra-mundial");
const ics = PorraExtras.buildIcs(reminderEvents);
assert.match(ics, /BEGIN:VCALENDAR/);
assert.match(ics, /DTSTART:20260611T180000Z/);
assert.match(ics, /TRIGGER:-PT2H/);
assert.doesNotMatch(ics, /DTSTART:.*\+00:00/);

const model = PorraExtras.computeRoundTotals(data);
const chart = PorraExtras.evolutionChartHtml(model, "a");
assert.match(chart, /chart-series--active/);
assert.match(chart, /chart-hit-area/);

console.log("extras.test.js: OK");
