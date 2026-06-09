# 🏆 La Porra del Mundial

World Cup prediction game for friends. Static web app deployed on GitHub Pages, using Google Sheets + Google Forms as a database.

---

## 🚀 Setup Guide

### 1. Import Database Template to Google Sheets
1. Upload the generated [porra_mundial_db.xlsx](file:///C:/Fabio/Programacion/ProyectosPersonales/porra-mundial/porra_mundial_db.xlsx) directly to your Google Drive.
2. Open it in **Google Sheets**.
3. It contains **4 tabs**:
   * `participants`: List of players.
   * `matches`: All 104 matches of the World Cup preloaded.
   * `players`: Player pool for Scorer & Goalkeeper picks (preloaded with stars and stats columns).
   * `special_events`: Special bets (E1 to E6 preloaded).

---

### 2. Create the Submission Google Form
To allow participants to submit predictions without a server, we use Google Forms:
1. In Google Drive, create a new **Google Form**.
2. Add **exactly one question**:
   * Type: **Paragraph (Texto de respuesta larga)**
   * Name: `Pronósticos (JSON)`
3. Get the **Form ID**:
   * Look at the form preview or view URL. It looks like:
     `https://docs.google.com/forms/d/e/1FAIpQLSdiF0qsK65DcaadNKRzDbue8xtkzAIIev-7yqUqAH3srhEAQg/viewform`
   * The Form ID is the segment: `1FAIpQLSdiF0qsK65DcaadNKRzDbue8xtkzAIIev-7yqUqAH3srhEAQg`.
4. Get the **Entry ID** of the paragraph question:
   * Open the preview page of the Form (`viewform`).
   * Right-click the paragraph text area and select **Inspect**.
   * Look for a `name` attribute that starts with `entry.`, e.g., `name="entry.123456789"`.
   * Copy this ID (e.g., `entry.123456789`).

---

### 3. Link the Form to your Google Sheet
1. In the Google Form editor, go to the **Responses (Respuestas)** tab.
2. Click **Link to Sheets (Vincular con Hojas de cálculo)**.
3. Select your existing Google Sheet (the one you imported in Step 1).
4. This will add a 5th tab named **Form Responses 1** (or *Respuestas de formulario 1*).

---

### 4. Publish Sheet Tabs as CSV
In Google Sheets, publish all 5 tabs individually to the web:
1. Go to **File > Share > Publish to web (Archivo > Compartir > Publicar en la Web)**.
2. In the dropdown select a tab (e.g. `participants`).
3. Choose **CSV (Valores separados por comas)** instead of Web Page.
4. Click **Publish** and copy the link.
5. Repeat for all 5 tabs:
   * `participants`
   * `matches`
   * `players`
   * `special_events`
   * `Form Responses 1` (the tab created by Google Form)

---

### 5. Configure the App
Open `config.js` and paste your published CSV URLs and Google Form identifiers:
```javascript
const CONFIG = {
  appName: "La Porra del Mundial",
  participants: 8,
  entryFee: 5,
  prize: "Todo al ganador (40€)",

  googleSheets: {
    participants:   "https://docs.google.com/spreadsheets/d/.../pub?output=csv&gid=...",
    matches:        "https://docs.google.com/spreadsheets/d/.../pub?output=csv&gid=...",
    players:        "https://docs.google.com/spreadsheets/d/.../pub?output=csv&gid=...",
    special_events: "https://docs.google.com/spreadsheets/d/.../pub?output=csv&gid=...",
    predictions:    "https://docs.google.com/spreadsheets/d/.../pub?output=csv&gid=..." // Form Responses 1 tab CSV
  },

  googleForm: {
    formId: "YOUR_GOOGLE_FORM_ID", // e.g. 1FAIpQLSdiF0qsK65...
    entryId: "entry.YOUR_ENTRY_ID"   // e.g. entry.123456789
  },

  adminPassword: "YOUR_ADMIN_PASSWORD"
};
```

---

### 6. Deploy to GitHub Pages
1. Push your code to your GitHub repository.
2. Go to repository **Settings > Pages**.
3. Under Build and deployment, choose **Deploy from a branch** > `main` > `/ (root)`.
4. Your application will be live at `https://your-username.github.io/your-repo/`!

---

## ⚽ Game Rules

* **Module 1 — Match Predictions:** Predict the score for each match. 3 pts for exact score, 2 pts for exact goal difference, 1 pt for correct outcome. Wild Match (E2) doubles these points.
* **Module 2 — Scorer:** Choose 1 player per round. Otorga +1 pt per goal scored.
* **Module 3 — Goalkeeper:** Choose 1 goalkeeper per round. 0 goals conceded (+2 pts), 1 goal (+1 pt), 2+ goals (conceded goals subtracted from 2, e.g. 3 goals = -1 pt).
* **Module 4 — Special Events:** 6 unique bets throughout the tournament (E1-E6) with custom points.
* **Tiebreakers:** 1st Match points (M1) → 2nd Scorer + Goalkeeper points (M2+M3) → 3rd Special events (M4) → 4th Alphabetical.
