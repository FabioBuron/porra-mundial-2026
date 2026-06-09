// =============================================================================
// La Porra del Mundial — Configuration
// =============================================================================
// Replace each URL with the published CSV URL from your Google Sheet.
// How to get the URL:
//   Google Sheets > File > Share > Publish to web > Select tab > CSV
//   URL format: https://docs.google.com/spreadsheets/d/{ID}/gviz/tq?tqx=out:csv&sheet={TAB}
// =============================================================================

const CONFIG = {
  appName: "La Porra del Mundial",
  participants: 8,
  entryFee: 5,
  prize: "Todo al ganador (40€)",

  googleSheets: {
    participants:       "URL_CSV_PARTICIPANTS",
    matches:            "URL_CSV_MATCHES",
    match_predictions:  "URL_CSV_MATCH_PREDICTIONS",
    players:            "URL_CSV_PLAYERS",
    scorer_picks:       "URL_CSV_SCORER_PICKS",
    goalkeeper_picks:   "URL_CSV_GOALKEEPER_PICKS",
    special_events:     "URL_CSV_SPECIAL_EVENTS",
    special_event_picks:"URL_CSV_SPECIAL_EVENT_PICKS"
  },

  adminPassword: "CAMBIAR_ESTO",

  tiebreakers: ["match_points", "scorer_goalkeeper_points", "special_event_points"],

  roundLabels: {
    group_md1: "Jornada 1",
    group_md2: "Jornada 2",
    group_md3: "Jornada 3",
    r32:       "Ronda de 32",
    r16:       "Octavos de Final",
    qf:        "Cuartos de Final",
    sf:        "Semifinales",
    "3rd":     "Tercer Puesto",
    final:     "Final"
  },

  phaseToRounds: {
    group: ["group_md1", "group_md2", "group_md3"],
    knockout: ["r32", "r16", "qf", "sf", "3rd", "final"]
  },

  matchPhases: {
    group:  "Fase de Grupos",
    r32:    "Ronda de 32",
    r16:    "Octavos de Final",
    qf:     "Cuartos de Final",
    sf:     "Semifinales",
    "3rd":  "Tercer Puesto",
    final:  "Final"
  }
};
