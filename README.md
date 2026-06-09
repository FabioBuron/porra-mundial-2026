# 🏆 La Porra del Mundial

World Cup 2026 prediction game for 8 friends. Static web app deployed on GitHub Pages, using Google Sheets as a CSV database.

## Quick Start

### 1. Create the Google Sheet

Create a Google Sheet with **8 tabs** (one per entity):

| Tab Name | Content |
|----------|---------|
| `participants` | 8 participants: `id`, `name`, `paid`, `joined_at` |
| `matches` | Tournament matches: `id`, `phase`, `group`, `matchday`, `round_label`, `home_team`, `away_team`, `kickoff_utc`, `home_score`, `away_score`, `status`, `is_double_points` |
| `match_predictions` | Predictions: `participant_id`, `match_id`, `predicted_home`, `predicted_away`, `submitted_at`, `points_earned` |
| `players` | Players: `id`, `name`, `team`, `position`, `active` |
| `scorer_picks` | Scorer picks: `participant_id`, `round_key`, `player_id`, `submitted_at`, `deadline_utc`, `goals_scored`, `points_earned` |
| `goalkeeper_picks` | Goalkeeper picks: `participant_id`, `round_key`, `player_id`, `submitted_at`, `deadline_utc`, `points_earned` |
| `special_events` | 6 events: `id`, `name`, `description`, `deadline_utc`, `is_active`, `is_resolved`, `result_description` |
| `special_event_picks` | Event picks: `participant_id`, `event_id`, `pick_value`, `submitted_at`, `points_earned` |

See `docs/estructura_datos.md` for full schema details.

### 2. Publish as CSV

For each tab:

1. Go to **File > Share > Publish to web**
2. Select the tab name
3. Choose **CSV** format
4. Click **Publish**
5. Copy the URL

### 3. Configure the App

Edit `config.js` and replace each `URL_CSV_*` placeholder with the published CSV URL:

```javascript
googleSheets: {
  participants:       "https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/gviz/tq?tqx=out:csv&sheet=participants",
  matches:            "https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/gviz/tq?tqx=out:csv&sheet=matches",
  // ... etc
}
```

Also change the `adminPassword`:

```javascript
adminPassword: "your_secure_password"
```

### 4. Deploy to GitHub Pages

1. Push to the `main` branch
2. Go to **Settings > Pages**
3. Source: **Deploy from a branch** > `main` > `/ (root)`
4. Your app will be live at `https://username.github.io/repo-name/`

## Demo Mode

If Google Sheets URLs are not configured (left as `URL_CSV_*`), the app loads demo data automatically so you can preview all views.

## File Structure

```
├── index.html              → Leaderboard
├── partidos.html            → Match predictions by round
├── goleador-portero.html    → Scorer & goalkeeper picks
├── eventos.html             → Special events
├── admin.html               → Admin panel (password-protected)
├── config.js                → Configuration (URLs, params)
├── scoring.js               → Scoring engine (4 modules)
├── app.js                   → Main logic (CSV, rendering)
├── style.css                → Styles (dark theme)
└── docs/
    ├── reglas.md             → Full game rules
    ├── estructura_datos.md   → Data schema
    └── prompt_ia.md          → AI prompt (this project spec)
```

## Scoring Rules

See `docs/reglas.md` for the full rulebook. Summary:

- **Module 1 — Match Predictions:** 3 pts (exact), 2 pts (goal diff), 1 pt (winner), 0 pts (miss)
- **Module 2 — Scorer:** +1 pt per goal scored by your player
- **Module 3 — Goalkeeper:** +2 (clean sheet), +1 (1 goal), negative (2+ goals)
- **Module 4 — Special Events:** 6 unique bets throughout the tournament

## Tech Stack

- HTML + CSS + JavaScript (vanilla, no frameworks)
- Google Sheets (published CSV) as database
- GitHub Pages for hosting
