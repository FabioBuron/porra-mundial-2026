# 🤖 Prompt para IA — Construir "La Porra del Mundial"

## Contexto del proyecto

Quiero que construyas una aplicación web estática para una porra del Mundial 2026 entre 8 amigos. La app se desplegará en **GitHub Pages** y usará **Google Sheets como base de datos** (las predicciones se escriben en el sheet a través de Google Forms o un formulario web, y la app lee el CSV público del sheet para mostrar la clasificación).

El repositorio de referencia (puedes hacer fork) es:
👉 **https://github.com/jjimenezgarcia/worldcup2026-prediction**

Estudia su estructura antes de empezar. La app usa HTML + CSS + JavaScript vanilla, sin frameworks. Los datos se leen desde un CSV público de Google Sheets.

---

## Reglas del juego

Las reglas completas están en el documento `reglas.md` que te adjunto. Resumen de los módulos:

### Módulo 1 — Predicción de partidos
- 3 pts: resultado exacto
- 2 pts: diferencia de goles exacta
- 1 pt: aciertas ganador o empate
- 0 pts: fallo total
- El Evento Especial E2 (Partido Salvaje) dobla los puntos de UN partido sorteado por el admin.

### Módulo 2 — Goleador de jornada
- El participante elige un jugador para cada jornada/ronda.
- +1 pt por cada gol que marque ese jugador en esa jornada/ronda.
- Deadline: antes del primer partido de la jornada/ronda.
- Los goles en propia puerta no cuentan. Los penaltis en tanda tampoco.

### Módulo 3 — Portero de jornada
- El participante elige un portero para cada jornada/ronda. Mismo deadline que el goleador.
- Por cada partido del portero elegido:
  - 0 goles encajados → +2 pts
  - 1 gol encajado → +1 pt
  - 2+ goles encajados → 2 - nº_goles pts (puede ser negativo)
- Los penaltis en tanda no cuentan.

### Módulo 4 — Eventos Especiales
Hay 6 eventos especiales. Se describen en detalle en `reglas.md` y el esquema de datos en `estructura_datos.md`. Resumen:
- **E1** — ¿En qué partido se marca el primer gol del torneo? (+3 o +1 pt)
- **E2** — Partido Salvaje: un partido sorteado vale el doble. Sin pick, el admin lo activa.
- **E3** — Portero Héroe: elige un portero que pare un penalti en cuartos/semis (+4 pts)
- **E4** — Maldición del Favorito: elige un top-4 que sea eliminado pronto (+3 o +2 pts)
- **E5** — Hat-Trick Salvaje: elige quién hará un hat-trick en el torneo (+5 pts)
- **E6** — Penalti Fallado: elige quién falla el primer penalti en una tanda (+3 o +1 pt)

---

## Estructura de datos

La estructura completa de datos está en el documento `estructura_datos.md` que te adjunto. Implementa las siguientes hojas en Google Sheets:

1. `participants` — 8 participantes
2. `matches` — 104 partidos del torneo
3. `match_predictions` — Predicciones de marcador
4. `players` — Jugadores elegibles (porteros y delanteros/centrocampistas)
5. `scorer_picks` — Elecciones de goleador por jornada
6. `goalkeeper_picks` — Elecciones de portero por jornada
7. `special_events` — Los 6 eventos especiales
8. `special_event_picks` — Respuestas a eventos especiales

---

## Pantallas / vistas que debe tener la app

### 1. Inicio / Clasificación General
- Tabla de clasificación con nombre, puntos totales y desglose por módulo.
- Criterios de desempate aplicados automáticamente.
- Indicador de si el participante ha pagado la cuota.

### 2. Predicciones de Partidos
- Vista por jornada/ronda.
- Cada participante puede ver sus propias predicciones y las de los demás (una vez cerrado el plazo).
- Formulario de entrada antes del deadline (integrado o link a Google Form).
- Puntuación ya calculada si el partido terminó.

### 3. Goleador y Portero
- Vista por jornada/ronda con las elecciones de cada participante.
- Las elecciones se ocultan hasta el inicio de la jornada (para no copiarse).
- Puntuación acumulada de este módulo por participante.

### 4. Eventos Especiales
- Listado de los 6 eventos con estado (Abierto / Cerrado / Resuelto).
- Por cada evento: descripción, plazo, picks de cada participante (visibles tras el cierre) y puntos ganados.

### 5. Panel de Admin (protegido por contraseña sencilla)
- Introducir resultados de partidos.
- Marcar el Partido Salvaje (E2).
- Resolver eventos especiales.
- Editar estado de participantes (pagado/no pagado).

---

## Requisitos técnicos

- **Frontend:** HTML + CSS + JavaScript vanilla (sin frameworks, como el repo de referencia).
- **Datos:** Google Sheets publicado como CSV. La app lee los CSVs directamente.
- **Escritura de datos:** A través de Google Forms enlazados a las hojas, o mediante un formulario web que use Google Apps Script como webhook.
- **Despliegue:** GitHub Pages (rama main, raíz del repositorio).
- **Diseño:** Temática futbolera, responsive (funciona en móvil), paleta de colores oscura con detalles en verde/dorado. El nombre de la app es "La Porra del Mundial".
- **Sin dependencias externas** salvo las que ya usa el repo de referencia.

---

## Archivos a entregar

1. `index.html` — Página principal con clasificación
2. `partidos.html` — Vista de predicciones de partidos
3. `goleador-portero.html` — Vista de elecciones por jornada
4. `eventos.html` — Vista de eventos especiales
5. `admin.html` — Panel de administración
6. `app.js` — Lógica principal (lectura de CSV, cálculo de puntos, renderizado)
7. `scoring.js` — Módulo de cálculo de puntuaciones (los 4 módulos)
8. `style.css` — Estilos
9. `config.js` — Archivo de configuración con las URLs de Google Sheets (las 8 hojas) y otros parámetros
10. `README.md` — Instrucciones de instalación y configuración

---

## Configuración personalizable (en `config.js`)

```javascript
const CONFIG = {
  appName: "La Porra del Mundial",
  participants: 8,
  entryFee: 5, // euros
  prize: "Todo al ganador (40€)",
  googleSheets: {
    participants: "URL_CSV_PARTICIPANTS",
    matches: "URL_CSV_MATCHES",
    match_predictions: "URL_CSV_MATCH_PREDICTIONS",
    players: "URL_CSV_PLAYERS",
    scorer_picks: "URL_CSV_SCORER_PICKS",
    goalkeeper_picks: "URL_CSV_GOALKEEPER_PICKS",
    special_events: "URL_CSV_SPECIAL_EVENTS",
    special_event_picks: "URL_CSV_SPECIAL_EVENT_PICKS"
  },
  adminPassword: "CAMBIAR_ESTO", // contraseña del panel de admin
  tiebreakers: ["match_points", "scorer_goalkeeper_points", "special_event_points"]
};
```

---

## Notas adicionales importantes

- Los goles en propia puerta **no cuentan** para el módulo de goleador.
- Los penaltis en tanda **no cuentan** para goleador ni portero (sí para E6).
- Si un partido se cancela, no puntúa en ningún módulo.
- El Evento E3 (Portero Héroe) y E6 (Penalti Fallado) se anulan automáticamente si no hay penaltis en la ronda correspondiente.
- Las elecciones de goleador y portero son **visibles públicamente solo después** de que empiece la jornada/ronda.
- El participante puede pre-seleccionar todas las jornadas de grupos de golpe, o ir cambiando jornada a jornada antes del deadline.

---

## Documentos adjuntos

- 📋 `reglas.md` — Reglamento completo con ejemplos
- 🗄️ `estructura_datos.md` — Esquema de tablas, campos, tipos y lógica de puntuación detallada
