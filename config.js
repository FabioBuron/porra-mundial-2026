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
    participants:   "https://docs.google.com/spreadsheets/d/1Qp1kD61ofzpqIlbUErOX3Bi1NISGJknix6im8mn0wOo/gviz/tq?tqx=out:csv&sheet=participants",
    matches:        "https://docs.google.com/spreadsheets/d/1Qp1kD61ofzpqIlbUErOX3Bi1NISGJknix6im8mn0wOo/gviz/tq?tqx=out:csv&sheet=matches",
    players:        "https://docs.google.com/spreadsheets/d/1Qp1kD61ofzpqIlbUErOX3Bi1NISGJknix6im8mn0wOo/gviz/tq?tqx=out:csv&sheet=players",
    special_events: "https://docs.google.com/spreadsheets/d/1Qp1kD61ofzpqIlbUErOX3Bi1NISGJknix6im8mn0wOo/gviz/tq?tqx=out:csv&sheet=special_events",
    predictions:    "https://docs.google.com/spreadsheets/d/1Qp1kD61ofzpqIlbUErOX3Bi1NISGJknix6im8mn0wOo/gviz/tq?tqx=out:csv&sheet=Respuestas de formulario 1"
  },

  googleForm: {
    formId: "ID_DE_TU_GOOGLE_FORM", // Ejemplo: 1FAIpQLSdiF0qsK65...
    entryId: "entry.123456789"      // ID del input tipo párrafo (long text) de tu formulario
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
