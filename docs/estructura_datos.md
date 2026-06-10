# 🗄️ La Porra del Mundial — Estructura de Datos

Este documento define el esquema de datos que debe manejar la aplicación. Está pensado para ser implementado sobre Google Sheets (como base de datos) + GitHub Pages (como front-end), siguiendo el patrón del repositorio base.

---

## Entidades Principales

### 1. `participants` — Participantes

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | string | Identificador único (ej. "p01") |
| `name` | string | Nombre del participante |
| `paid` | boolean | Si ha pagado la cuota de 5€ |
| `joined_at` | datetime | Fecha de registro |

**Número fijo: 8 participantes.**

---

### 2. `matches` — Partidos del torneo

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | string | Identificador único (ej. "m001") |
| `phase` | enum | `"group"` / `"r32"` / `"r16"` / `"qf"` / `"sf"` / `"3rd"` / `"final"` |
| `group` | string | Grupo (ej. "A", "B"…) — null en eliminatorias |
| `matchday` | integer | Jornada dentro de la fase de grupos (1, 2 o 3) — null en eliminatorias |
| `round_label` | string | Etiqueta de la ronda (ej. "Jornada 1", "Octavos de Final") |
| `home_team` | string | Selección local |
| `away_team` | string | Selección visitante |
| `kickoff_utc` | datetime | Hora de inicio en UTC |
| `home_score` | integer | Goles del equipo local (null si no se ha jugado) |
| `away_score` | integer | Goles del equipo visitante (null si no se ha jugado) |
| `status` | enum | `"scheduled"` / `"live"` / `"finished"` / `"cancelled"` |
| `is_double_points` | boolean | True si es el Partido Salvaje (Evento E2) |

---

### 3. `match_predictions` — Predicciones de partidos (Módulo 1)

Una fila por combinación participante × partido.

| Campo | Tipo | Descripción |
|---|---|---|
| `participant_id` | string | Referencia a `participants.id` |
| `match_id` | string | Referencia a `matches.id` |
| `predicted_home` | integer | Goles predichos para el local |
| `predicted_away` | integer | Goles predichos para el visitante |
| `submitted_at` | datetime | Cuándo se envió |
| `points_earned` | integer | Puntos obtenidos (se calcula al finalizar el partido): 0, 1, 2 o 3 (×2 si is_double_points) |

**Lógica de puntuación:**
```
si predicted_home == home_score Y predicted_away == away_score → 3 pts
sino si (predicted_home - predicted_away) == (home_score - away_score) → 2 pts
sino si sign(predicted_home - predicted_away) == sign(home_score - away_score) → 1 pt
sino → 0 pts

si match.is_double_points → multiplicar resultado × 2
```

---

### 4. `players` — Jugadores seleccionables (para goleador y portero)

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | string | Identificador único |
| `name` | string | Nombre del jugador |
| `team` | string | Selección nacional |
| `position` | enum | `"goalkeeper"` / `"outfield"` |
| `active` | boolean | Si sigue en el torneo |

---

### 5. `scorer_picks` — Elección de goleador por jornada/ronda (Módulo 2)

| Campo | Tipo | Descripción |
|---|---|---|
| `participant_id` | string | Referencia a `participants.id` |
| `round_key` | string | Clave de jornada o ronda (ej. `"group_md1"`, `"group_md2"`, `"group_md3"`, `"r16"`, `"qf"`, `"sf"`, `"final"`) |
| `player_id` | string | Referencia a `players.id` |
| `submitted_at` | datetime | Cuándo se envió (debe ser antes del deadline) |
| `deadline_utc` | datetime | Fecha límite para esta elección |
| `goals_scored` | integer | Goles marcados por el jugador en esa jornada/ronda (se rellena al acabar) |
| `points_earned` | integer | Puntos obtenidos (= goals_scored × 1) |

**Regla de deadline:** `submitted_at` debe ser anterior al inicio del primer partido de esa jornada/ronda.

---

### 6. `goalkeeper_picks` — Elección de portero por jornada/ronda (Módulo 3)

| Campo | Tipo | Descripción |
|---|---|---|
| `participant_id` | string | Referencia a `participants.id` |
| `round_key` | string | Mismas claves que `scorer_picks.round_key` |
| `player_id` | string | Referencia a `players.id` (solo `position == "goalkeeper"`) |
| `submitted_at` | datetime | Cuándo se envió |
| `deadline_utc` | datetime | Fecha límite |
| `points_earned` | integer | Puntos calculados al cierre de la jornada/ronda |

**Lógica de puntuación (por cada partido del portero en la jornada/ronda):**
```
por cada partido jugado por el portero elegido:
  si goals_conceded == 0 → +2 pts
  si goals_conceded == 1 → +1 pt
  si goals_conceded >= 2 → +1 pt - (goals_conceded - 1) pts
    = 2 - goals_conceded pts  [puede ser negativo]

total_jornada = suma de todos sus partidos en esa jornada/ronda
```

---

### 7. `special_events` — Definición de eventos especiales

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | string | "E1" a "E6" |
| `name` | string | Nombre del evento |
| `description` | string | Descripción breve |
| `deadline_utc` | datetime | Fecha límite para participar |
| `is_active` | boolean | Si el evento está abierto |
| `is_resolved` | boolean | Si ya se ha calculado el resultado |
| `result_description` | string | Descripción del resultado real (se rellena al resolver) |

---

### 8. `special_event_picks` — Respuestas a eventos especiales

| Campo | Tipo | Descripción |
|---|---|---|
| `participant_id` | string | Referencia a `participants.id` |
| `event_id` | string | Referencia a `special_events.id` |
| `pick_value` | string | La elección del participante (partido, jugador, selección…) |
| `submitted_at` | datetime | Cuándo se envió |
| `points_earned` | integer | Puntos obtenidos (se rellena al resolver el evento) |

**Lógica por evento:**

```
E1 (Ganador del Mundial):
  si pick_value == selección campeona del mundo → 5 pts
  sino → 0 pts

E2 (Partido Salvaje):
  No hay pick. El admin marca is_double_points=true en el partido sorteado.
  La puntuación se calcula automáticamente en match_predictions.

E3 (Portero Héroe):
  si el portero elegido para penalti en cuartos/semis efectivamente paró al menos 1 penalti → 4 pts
  sino → 0 pts
  si no hubo penaltis en la ronda → evento anulado, 0 pts para todos

E4 (¿Qué selección caerá antes?):
  si la selección elegida fue eliminada en octavos → 3 pts
  si eliminada en cuartos → 2 pts
  sino → 0 pts

E5 (Hat-Trick Salvaje):
  si el jugador elegido marcó hat-trick en algún partido del torneo → 5 pts
  sino → 0 pts

E6 (Partido con más Goles - Eliminatorias):
  si pick_value == cantidad exacta de goles del partido con más goles → 3 pts
  si diferencia absoluta(pick_value, goles reales) == 1 → 1 pt
  sino → 0 pts
```

---

### 9. `leaderboard` — Clasificación general (vista calculada)

No es una tabla independiente, se calcula en tiempo real sumando:

```
total_score[participant] =
  SUM(match_predictions.points_earned)        [Módulo 1]
  + SUM(scorer_picks.points_earned)           [Módulo 2]
  + SUM(goalkeeper_picks.points_earned)       [Módulo 3]
  + SUM(special_event_picks.points_earned)    [Eventos especiales]
```

**Criterios de desempate (en orden):**
1. Mayor `SUM(match_predictions.points_earned)`
2. Mayor `SUM(scorer_picks.points_earned) + SUM(goalkeeper_picks.points_earned)`
3. Mayor `SUM(special_event_picks.points_earned)`

---

## Estructura de Google Sheets recomendada

Cada entidad = una pestaña (hoja) del Google Sheet:

| Pestaña | Contenido |
|---|---|
| `participants` | Lista de 8 participantes |
| `matches` | Todos los partidos del torneo (104 partidos) |
| `match_predictions` | Predicciones de marcador (8 × 104 = hasta 832 filas) |
| `players` | Plantilla de jugadores elegibles |
| `scorer_picks` | Elecciones de goleador (8 × 7 rondas = hasta 56 filas) |
| `goalkeeper_picks` | Elecciones de portero (8 × 7 rondas = hasta 56 filas) |
| `special_events` | Definición de los 6 eventos especiales |
| `special_event_picks` | Respuestas a eventos (8 × 6 eventos = hasta 48 filas) |

---

## Claves de ronda (`round_key`)

| round_key | Descripción |
|---|---|
| `group_md1` | Fase de grupos — Jornada 1 |
| `group_md2` | Fase de grupos — Jornada 2 |
| `group_md3` | Fase de grupos — Jornada 3 |
| `r32` | Ronda de 32 (si aplica al formato 2026) |
| `r16` | Octavos de final |
| `qf` | Cuartos de final |
| `sf` | Semifinales |
| `3rd` | Tercer y cuarto puesto |
| `final` | Final |
