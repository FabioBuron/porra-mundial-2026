// =============================================================================
// La Porra del Mundial — Extras
// =============================================================================
// Funciones puras (devuelven HTML/strings o datos) para:
//   - Avatares deterministas por participante
//   - Evolución de puntos por jornada (gráfica SVG)
//   - Cambios de posición respecto a la jornada anterior (▲▼)
//   - Estadísticas curiosas del grupo
//   - Logros / insignias por participante
//   - Cuenta atrás hasta el próximo partido
// Sin dependencias externas. Depende solo de CONFIG (config.js).
// =============================================================================

const PorraExtras = (() => {
  "use strict";

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const ROUND_ORDER = ["group_md1", "group_md2", "group_md3", "r32", "r16", "qf", "sf", "3rd", "final"];

  function esc(str) {
    return String(str ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function hashCode(str) {
    let h = 0;
    const s = String(str || "");
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
  }

  function matchRoundKey(m) {
    if (m.phase === "group") return "group_md" + m.matchday;
    return m.phase;
  }

  function roundLabel(key) {
    return (typeof CONFIG !== "undefined" && CONFIG.roundLabels && CONFIG.roundLabels[key]) || key;
  }

  // ---------------------------------------------------------------------------
  // Avatares — iniciales sobre un color determinista por nombre
  // ---------------------------------------------------------------------------

  const AVATAR_HUES = [152, 205, 268, 14, 38, 330, 96, 188, 232, 290];

  function avatarColor(name) {
    const hue = AVATAR_HUES[hashCode(name) % AVATAR_HUES.length];
    return { bg: `hsl(${hue} 55% 22%)`, ring: `hsl(${hue} 65% 45%)`, fg: `hsl(${hue} 80% 82%)`, hue };
  }

  function avatarHtml(name, size) {
    const c = avatarColor(name);
    const initials = String(name || "?").trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase();
    const px = size || 32;
    return `<span class="avatar" style="--av-bg:${c.bg};--av-ring:${c.ring};--av-fg:${c.fg};width:${px}px;height:${px}px;font-size:${Math.round(px * 0.4)}px" aria-hidden="true">${esc(initials)}</span>`;
  }

  // ---------------------------------------------------------------------------
  // Evolución de puntos por jornada
  // ---------------------------------------------------------------------------
  // Devuelve { rounds: [keys], labels: [..], series: [{id, name, perRound, cum}] }
  // Solo incluye jornadas con al menos un partido terminado.
  // Los puntos de eventos especiales se suman en la última jornada incluida.
  // ---------------------------------------------------------------------------

  function computeRoundTotals(data) {
    const finishedByRound = {};
    (data.matches || []).forEach(m => {
      if (m.status === "finished" || (m.home_score !== null && m.home_score !== undefined && m.home_score !== "")) {
        const key = matchRoundKey(m);
        (finishedByRound[key] = finishedByRound[key] || []).push(m);
      }
    });

    const rounds = ROUND_ORDER.filter(r => finishedByRound[r] && finishedByRound[r].length > 0);
    if (rounds.length === 0) return { rounds: [], labels: [], series: [] };

    const lastIdx = rounds.length - 1;

    const series = (data.participants || []).map(p => {
      const perRound = rounds.map((rKey, idx) => {
        let pts = 0;
        // M1: predicciones de partidos terminados de esa jornada
        const matchIds = new Set(finishedByRound[rKey].map(m => m.id));
        (data.matchPredictions || []).forEach(mp => {
          if (mp.participant_id === p.id && matchIds.has(mp.match_id)) {
            pts += Number(mp.points_earned) || 0;
          }
        });
        // M2 + M3: picks de esa jornada
        (data.scorerPicks || []).forEach(sp => {
          if (sp.participant_id === p.id && sp.round_key === rKey) pts += Number(sp.points_earned) || 0;
        });
        (data.goalkeeperPicks || []).forEach(gp => {
          if (gp.participant_id === p.id && gp.round_key === rKey) pts += Number(gp.points_earned) || 0;
        });
        // M4: eventos especiales, en la última jornada incluida
        if (idx === lastIdx) {
          (data.specialEventPicks || []).forEach(se => {
            if (se.participant_id === p.id) pts += Number(se.points_earned) || 0;
          });
        }
        return pts;
      });

      const cum = [];
      perRound.reduce((acc, v, i) => (cum[i] = acc + v), 0);

      return { id: p.id, name: p.name, perRound, cum };
    });

    return { rounds, labels: rounds.map(roundLabel), series };
  }

  // ---------------------------------------------------------------------------
  // Cambios de posición (▲▼) — última jornada vs anterior
  // Devuelve map participantId -> { delta, prevPos, currPos } (o {} si no aplica)
  // ---------------------------------------------------------------------------

  function computePositionDeltas(model) {
    if (!model || model.rounds.length < 2) return {};

    const rankAt = (idx) => {
      const sorted = [...model.series].sort((a, b) =>
        (b.cum[idx] - a.cum[idx]) || a.name.localeCompare(b.name)
      );
      const pos = {};
      sorted.forEach((s, i) => { pos[s.id] = i + 1; });
      return pos;
    };

    const prev = rankAt(model.rounds.length - 2);
    const curr = rankAt(model.rounds.length - 1);

    const deltas = {};
    model.series.forEach(s => {
      deltas[s.id] = { prevPos: prev[s.id], currPos: curr[s.id], delta: prev[s.id] - curr[s.id] };
    });
    return deltas;
  }

  function deltaBadgeHtml(deltaInfo) {
    if (!deltaInfo) return '<span class="pos-delta pos-delta--same" title="Sin cambios">·</span>';
    const d = deltaInfo.delta;
    if (d > 0) return `<span class="pos-delta pos-delta--up" title="Sube ${d} ${d === 1 ? "puesto" : "puestos"}">▲${d}</span>`;
    if (d < 0) return `<span class="pos-delta pos-delta--down" title="Baja ${-d} ${-d === 1 ? "puesto" : "puestos"}">▼${-d}</span>`;
    return '<span class="pos-delta pos-delta--same" title="Mantiene posición">=</span>';
  }

  // ---------------------------------------------------------------------------
  // Gráfica SVG de evolución
  // ---------------------------------------------------------------------------

  function evolutionChartHtml(model, activeParticipantId) {
    if (!model || model.rounds.length === 0) return "";

    const W = 720, H = 300;
    const PAD = { top: 16, right: 16, bottom: 34, left: 36 };
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;

    // Eje X: punto 0 ("Inicio") + cada jornada
    const xCount = model.rounds.length + 1;
    const xPos = i => PAD.left + (xCount === 1 ? innerW / 2 : (innerW * i) / (xCount - 1));

    const maxPts = Math.max(1, ...model.series.map(s => s.cum[s.cum.length - 1] || 0));
    const minPts = Math.min(0, ...model.series.flatMap(s => s.cum));
    const range = Math.max(1, maxPts - minPts);
    const yPos = v => PAD.top + innerH - ((v - minPts) / range) * innerH;

    // Gridlines horizontales (4-6 pasos enteros)
    const step = Math.max(1, Math.ceil(range / 5));
    let gridLines = "";
    for (let v = Math.ceil(minPts / step) * step; v <= maxPts; v += step) {
      const y = yPos(v);
      gridLines += `<line x1="${PAD.left}" y1="${y}" x2="${W - PAD.right}" y2="${y}" class="chart-grid"/>` +
        `<text x="${PAD.left - 8}" y="${y + 4}" class="chart-axis-label" text-anchor="end">${v}</text>`;
    }

    // Etiquetas X
    const xLabels = ["Inicio", ...model.labels].map((lbl, i) => {
      const short = lbl.replace("Jornada ", "J").replace("Octavos de Final", "Octavos").replace("Cuartos de Final", "Cuartos").replace("Ronda de 32", "R32").replace("Tercer Puesto", "3º");
      return `<text x="${xPos(i)}" y="${H - 10}" class="chart-axis-label" text-anchor="middle">${esc(short)}</text>`;
    }).join("");

    // Líneas por participante (ordenadas: el líder se dibuja el último, encima)
    const knockoutIdx = model.rounds.findIndex(r => !String(r).startsWith("group_md"));
    const knockoutBand = knockoutIdx >= 0
      ? `<rect x="${Math.max(PAD.left, xPos(knockoutIdx + 1) - 8).toFixed(1)}" y="${PAD.top}" width="16" height="${innerH}" class="chart-knockout-band"><title>Inicio de eliminatorias</title></rect>`
      : "";
    const selectedId = activeParticipantId || null;
    const ordered = [...model.series].sort((a, b) => (a.cum[a.cum.length - 1] || 0) - (b.cum[b.cum.length - 1] || 0));

    const lines = ordered.map(s => {
      const c = avatarColor(s.name);
      const pts = [0, ...s.cum];
      const path = pts.map((v, i) => `${i === 0 ? "M" : "L"}${xPos(i).toFixed(1)},${yPos(v).toFixed(1)}`).join(" ");
      const dots = pts.map((v, i) =>
        `<circle cx="${xPos(i).toFixed(1)}" cy="${yPos(v).toFixed(1)}" r="3.5" fill="${c.ring}"><title>${esc(s.name)} — ${i === 0 ? "Inicio" : esc(model.labels[i - 1])}: ${v} pts</title></circle>`
      ).join("");
      const last = pts[pts.length - 1];
      const endLabel = `<text x="${(xPos(pts.length - 1) + 6).toFixed(1)}" y="${(yPos(last) + 4).toFixed(1)}" class="chart-end-label" fill="${c.ring}">${last}</text>`;
      return `<g class="chart-series"><path d="${path}" fill="none" stroke="${c.ring}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>${dots}${endLabel}</g>`;
    }).join("");

    const legend = [...model.series]
      .sort((a, b) => (b.cum[b.cum.length - 1] || 0) - (a.cum[a.cum.length - 1] || 0))
      .map(s => {
        const c = avatarColor(s.name);
        return `<span class="chart-legend-item"><span class="chart-legend-swatch" style="background:${c.ring}"></span>${esc(s.name)}</span>`;
      }).join("");

    return `
      <div class="chart-wrap">
        <svg viewBox="0 0 ${W} ${H}" class="evolution-chart" role="img" aria-label="Evolución de puntos por jornada">
          ${gridLines}
          ${xLabels}
          ${lines}
        </svg>
        <div class="chart-legend">${legend}</div>
      </div>
    `;
  }

  // ---------------------------------------------------------------------------
  // Estadísticas curiosas
  // ---------------------------------------------------------------------------

  function computeFunStats(data) {
    const finished = (data.matches || []).filter(m => m.status === "finished" && m.home_score !== null && m.home_score !== undefined);
    if (finished.length === 0) return [];
    const finishedIds = new Set(finished.map(m => m.id));

    const byParticipant = {};
    (data.participants || []).forEach(p => {
      byParticipant[p.id] = { name: p.name, exact: 0, zero: 0, scored: 0, total: 0, goalsSum: 0, predCount: 0 };
    });

    let groupHits = 0, groupTotal = 0;

    (data.matchPredictions || []).forEach(mp => {
      const st = byParticipant[mp.participant_id];
      if (!st) return;
      if (mp.predicted_home !== null && mp.predicted_home !== undefined) {
        st.goalsSum += (Number(mp.predicted_home) || 0) + (Number(mp.predicted_away) || 0);
        st.predCount++;
      }
      if (!finishedIds.has(mp.match_id)) return;
      const pts = Number(mp.points_earned) || 0;
      st.total++;
      groupTotal++;
      if (pts >= 3) st.exact++;
      if (pts >= 1) { st.scored++; groupHits++; }
      if (pts === 0) st.zero++;
    });

    const entries = Object.values(byParticipant).filter(s => s.total > 0 || s.predCount > 0);
    if (entries.length === 0) return [];

    const stats = [];

    const sniper = entries.filter(s => s.exact > 0).sort((a, b) => b.exact - a.exact)[0];
    if (sniper) {
      stats.push({ icon: "🎯", title: "Francotirador", value: sniper.name, detail: `${sniper.exact} ${sniper.exact === 1 ? "resultado exacto" : "resultados exactos"}` });
    } else {
      stats.push({ icon: "🎯", title: "Francotirador", value: "Nadie aún", detail: "Ningún resultado exacto acertado" });
    }

    const jinx = entries.filter(s => s.total >= 2).sort((a, b) => (b.zero / b.total) - (a.zero / a.total))[0];
    if (jinx && jinx.zero > 0) {
      stats.push({ icon: "🧊", title: "El cenizo", value: jinx.name, detail: `${jinx.zero} de ${jinx.total} pronósticos sin puntuar` });
    }

    const optimist = entries.filter(s => s.predCount >= 2).sort((a, b) => (b.goalsSum / b.predCount) - (a.goalsSum / a.predCount))[0];
    if (optimist) {
      stats.push({ icon: "🎉", title: "El optimista", value: optimist.name, detail: `${(optimist.goalsSum / optimist.predCount).toFixed(1)} goles de media por pronóstico` });
    }

    const grinder = entries.sort((a, b) => b.predCount - a.predCount)[0];
    if (grinder && grinder.predCount > 0) {
      stats.push({ icon: "📝", title: "El más aplicado", value: grinder.name, detail: `${grinder.predCount} pronósticos enviados` });
    }

    if (groupTotal > 0) {
      const pct = Math.round((groupHits / groupTotal) * 100);
      stats.push({ icon: "🤝", title: "Ojo del grupo", value: `${pct}%`, detail: `de pronósticos puntuando (${groupHits}/${groupTotal})` });
    }

    return stats;
  }

  function funStatsHtml(data) {
    const stats = computeFunStats(data);
    if (stats.length === 0) return "";
    return `
      <div class="fun-stats">
        ${stats.map(s => `
          <div class="fun-stat">
            <div class="fun-stat__icon">${s.icon}</div>
            <div class="fun-stat__body">
              <div class="fun-stat__title">${esc(s.title)}</div>
              <div class="fun-stat__value">${esc(s.value)}</div>
              <div class="fun-stat__detail">${esc(s.detail)}</div>
            </div>
          </div>
        `).join("")}
      </div>
    `;
  }

  // ---------------------------------------------------------------------------
  // Logros / insignias por participante
  // Devuelve map participantId -> [{icon, label}]
  // ---------------------------------------------------------------------------

  function computeAchievements(data) {
    const finished = (data.matches || [])
      .filter(m => m.status === "finished" && m.home_score !== null && m.home_score !== undefined)
      .sort((a, b) => new Date(a.kickoff_utc) - new Date(b.kickoff_utc));
    const result = {};
    if (finished.length === 0) return result;

    (data.participants || []).forEach(p => {
      const badges = [];
      const preds = finished
        .map(m => (data.matchPredictions || []).find(mp => mp.participant_id === p.id && mp.match_id === m.id))
        .filter(Boolean);

      const exact = preds.filter(mp => (Number(mp.points_earned) || 0) >= 3).length;
      if (exact > 0) badges.push({ icon: "🎯", label: `${exact} ${exact === 1 ? "resultado exacto" : "resultados exactos"}` });

      // Racha: 3+ pronósticos seguidos puntuando
      let streak = 0, best = 0;
      preds.forEach(mp => {
        if ((Number(mp.points_earned) || 0) >= 1) { streak++; best = Math.max(best, streak); }
        else streak = 0;
      });
      if (best >= 3) badges.push({ icon: "🔥", label: `Racha de ${best} pronósticos puntuando` });

      // Pleno: todos los pronósticos de una jornada terminada puntuando (mín. 2)
      const byRound = {};
      finished.forEach(m => {
        const key = matchRoundKey(m);
        (byRound[key] = byRound[key] || []).push(m.id);
      });
      let pleno = false, gafe = false;
      Object.values(byRound).forEach(ids => {
        const roundPreds = preds.filter(mp => ids.includes(mp.match_id));
        if (roundPreds.length >= 2) {
          if (roundPreds.every(mp => (Number(mp.points_earned) || 0) >= 1)) pleno = true;
          if (roundPreds.every(mp => (Number(mp.points_earned) || 0) === 0)) gafe = true;
        }
      });
      if (pleno) badges.push({ icon: "⭐", label: "Pleno: jornada completa puntuando" });
      if (gafe) badges.push({ icon: "💀", label: "Jornada en blanco: 0 puntos" });

      if (badges.length) result[p.id] = badges;
    });

    return result;
  }

  function achievementsHtml(badges) {
    if (!badges || badges.length === 0) return "";
    return `<span class="achievements">${badges.map(b =>
      `<span class="achievement" title="${esc(b.label)}">${b.icon}</span>`
    ).join("")}</span>`;
  }

  // ---------------------------------------------------------------------------
  // Cuenta atrás hasta el próximo partido
  // ---------------------------------------------------------------------------

  function getNextMatch(data) {
    const now = Date.now();
    const upcoming = (data.matches || [])
      .filter(m => m.kickoff_utc && m.status !== "finished" && new Date(m.kickoff_utc).getTime() > now)
      .sort((a, b) => new Date(a.kickoff_utc) - new Date(b.kickoff_utc));
    return upcoming[0] || null;
  }

  let _countdownTimer = null;

  function startCountdown(elId, isoTime) {
    if (_countdownTimer) clearInterval(_countdownTimer);
    const target = new Date(isoTime).getTime();
    if (isNaN(target)) return;

    const tick = () => {
      const el = document.getElementById(elId);
      if (!el) { clearInterval(_countdownTimer); return; }
      let diff = Math.max(0, target - Date.now());
      const d = Math.floor(diff / 86400000); diff -= d * 86400000;
      const h = Math.floor(diff / 3600000); diff -= h * 3600000;
      const m = Math.floor(diff / 60000); diff -= m * 60000;
      const s = Math.floor(diff / 1000);
      const pad = n => String(n).padStart(2, "0");
      el.innerHTML = (d > 0 ? `<span class="cd-unit"><b>${d}</b>d</span>` : "") +
        `<span class="cd-unit"><b>${pad(h)}</b>h</span>` +
        `<span class="cd-unit"><b>${pad(m)}</b>m</span>` +
        `<span class="cd-unit"><b>${pad(s)}</b>s</span>`;
      if (target - Date.now() <= 0) clearInterval(_countdownTimer);
    };
    tick();
    _countdownTimer = setInterval(tick, 1000);
  }

  // ---------------------------------------------------------------------------
  // Implementaciones v2 para nuevas fases
  // ---------------------------------------------------------------------------

  const _countdownTimersV2 = {};

  function startCountdownV2(elId, isoTime) {
    if (_countdownTimersV2[elId]) clearInterval(_countdownTimersV2[elId]);
    const target = new Date(isoTime).getTime();
    if (isNaN(target)) return;

    const tick = () => {
      const el = document.getElementById(elId);
      if (!el) {
        clearInterval(_countdownTimersV2[elId]);
        delete _countdownTimersV2[elId];
        return;
      }
      let diff = Math.max(0, target - Date.now());
      const d = Math.floor(diff / 86400000); diff -= d * 86400000;
      const h = Math.floor(diff / 3600000); diff -= h * 3600000;
      const m = Math.floor(diff / 60000); diff -= m * 60000;
      const s = Math.floor(diff / 1000);
      const pad = n => String(n).padStart(2, "0");
      el.innerHTML = (d > 0 ? `<span class="cd-unit"><b>${d}</b>d</span>` : "") +
        `<span class="cd-unit"><b>${pad(h)}</b>h</span>` +
        `<span class="cd-unit"><b>${pad(m)}</b>m</span>` +
        `<span class="cd-unit"><b>${pad(s)}</b>s</span>`;
      if (target - Date.now() <= 0) {
        clearInterval(_countdownTimersV2[elId]);
        delete _countdownTimersV2[elId];
      }
    };
    tick();
    _countdownTimersV2[elId] = setInterval(tick, 1000);
  }

  function evolutionChartHtmlV2(model, activeParticipantId) {
    if (!model || model.rounds.length === 0) return "";

    const W = 720, H = 300;
    const PAD = { top: 16, right: 16, bottom: 34, left: 36 };
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const xCount = model.rounds.length + 1;
    const xPos = i => PAD.left + (xCount === 1 ? innerW / 2 : (innerW * i) / (xCount - 1));
    const maxPts = Math.max(1, ...model.series.map(s => s.cum[s.cum.length - 1] || 0));
    const minPts = Math.min(0, ...model.series.flatMap(s => s.cum));
    const range = Math.max(1, maxPts - minPts);
    const yPos = v => PAD.top + innerH - ((v - minPts) / range) * innerH;
    const step = Math.max(1, Math.ceil(range / 5));
    let gridLines = "";

    for (let v = Math.ceil(minPts / step) * step; v <= maxPts; v += step) {
      const y = yPos(v);
      gridLines += `<line x1="${PAD.left}" y1="${y}" x2="${W - PAD.right}" y2="${y}" class="chart-grid"/>` +
        `<text x="${PAD.left - 8}" y="${y + 4}" class="chart-axis-label" text-anchor="end">${v}</text>`;
    }

    const xLabels = ["Inicio", ...model.labels].map((lbl, i) => {
      const short = lbl.replace("Jornada ", "J").replace("Octavos de Final", "Octavos").replace("Cuartos de Final", "Cuartos").replace("Ronda de 32", "R32").replace("Tercer Puesto", "3o");
      return `<text x="${xPos(i)}" y="${H - 10}" class="chart-axis-label" text-anchor="middle">${esc(short)}</text>`;
    }).join("");

    const selectedId = activeParticipantId || null;
    const knockoutIdx = model.rounds.findIndex(r => !String(r).startsWith("group_md"));
    const knockoutBand = knockoutIdx >= 0
      ? `<rect x="${Math.max(PAD.left, xPos(knockoutIdx + 1) - 8).toFixed(1)}" y="${PAD.top}" width="16" height="${innerH}" class="chart-knockout-band"><title>Inicio de eliminatorias</title></rect>`
      : "";

    const lines = [...model.series]
      .sort((a, b) => (a.cum[a.cum.length - 1] || 0) - (b.cum[b.cum.length - 1] || 0))
      .map(s => {
        const c = avatarColor(s.name);
        const pts = [0, ...s.cum];
        const path = pts.map((v, i) => `${i === 0 ? "M" : "L"}${xPos(i).toFixed(1)},${yPos(v).toFixed(1)}`).join(" ");
        const isActive = selectedId && s.id === selectedId;
        const dots = pts.map((v, i) => {
          const label = `${s.name} - ${i === 0 ? "Inicio" : model.labels[i - 1]}: ${v} pts`;
          const cx = xPos(i).toFixed(1);
          const cy = yPos(v).toFixed(1);
          return `<g class="chart-point"><circle cx="${cx}" cy="${cy}" r="10" class="chart-hit-area"><title>${esc(label)}</title></circle><circle cx="${cx}" cy="${cy}" r="${isActive ? "4.8" : "3.5"}" fill="${c.ring}"><title>${esc(label)}</title></circle></g>`;
        }).join("");
        const last = pts[pts.length - 1];
        const endLabel = `<text x="${(xPos(pts.length - 1) + 6).toFixed(1)}" y="${(yPos(last) + 4).toFixed(1)}" class="chart-end-label" fill="${c.ring}">${last}</text>`;
        return `<g class="chart-series ${isActive ? "chart-series--active" : selectedId ? "chart-series--muted" : ""}" data-series-id="${esc(s.id)}"><path d="${path}" fill="none" stroke="${c.ring}" stroke-width="${isActive ? "4" : "2.5"}" stroke-linejoin="round" stroke-linecap="round"/>${dots}${endLabel}</g>`;
      }).join("");

    const legend = [...model.series]
      .sort((a, b) => (b.cum[b.cum.length - 1] || 0) - (a.cum[a.cum.length - 1] || 0))
      .map(s => {
        const c = avatarColor(s.name);
        const activeClass = selectedId && s.id === selectedId ? " chart-legend-item--active" : "";
        return `<button type="button" class="chart-legend-item${activeClass}" data-chart-focus="${esc(s.id)}"><span class="chart-legend-swatch" style="background:${c.ring}"></span>${esc(s.name)}</button>`;
      }).join("");

    return `
      <div class="chart-wrap ${model.rounds.length > 5 ? "chart-wrap--scroll" : ""}">
        <svg viewBox="0 0 ${W} ${H}" class="evolution-chart" role="img" aria-label="Evolucion de puntos por jornada">
          ${knockoutBand}
          ${gridLines}
          ${xLabels}
          ${lines}
        </svg>
        <div class="chart-legend">${legend}</div>
      </div>
    `;
  }

  function evolutionPositionChartHtml(model, activeParticipantId) {
    if (!model || model.rounds.length === 0 || model.series.length === 0) return "";

    const N = model.series.length;
    const W = 720, H = 300;
    const PAD = { top: 20, right: 16, bottom: 34, left: 36 };
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;

    const xCount = model.rounds.length + 1;
    const xPos = i => PAD.left + (xCount === 1 ? innerW / 2 : (innerW * i) / (xCount - 1));
    const yPos = p => PAD.top + ((p - 1) / (N - 1)) * innerH;

    let gridLines = "";
    for (let p = 1; p <= N; p++) {
      const y = yPos(p);
      gridLines += `<line x1="${PAD.left}" y1="${y}" x2="${W - PAD.right}" y2="${y}" class="chart-grid"/>` +
        `<text x="${PAD.left - 8}" y="${y + 4}" class="chart-axis-label" text-anchor="end">${p}º</text>`;
    }

    const xLabels = ["Inicio", ...model.labels].map((lbl, i) => {
      const short = lbl.replace("Jornada ", "J").replace("Octavos de Final", "Octavos").replace("Cuartos de Final", "Cuartos").replace("Ronda de 32", "R32").replace("Tercer Puesto", "3o");
      return `<text x="${xPos(i)}" y="${H - 10}" class="chart-axis-label" text-anchor="middle">${esc(short)}</text>`;
    }).join("");

    const historyPositions = {};
    model.series.forEach(s => { historyPositions[s.id] = []; });

    for (let i = 0; i < xCount; i++) {
      const standings = model.series.map(s => {
        const pts = i === 0 ? 0 : s.cum[i - 1];
        return { id: s.id, name: s.name, pts };
      });
      standings.sort((a, b) => (b.pts - a.pts) || a.name.localeCompare(b.name));
      standings.forEach((entry, rank) => {
        historyPositions[entry.id].push(rank + 1);
      });
    }

    const selectedId = activeParticipantId || null;
    const knockoutIdx = model.rounds.findIndex(r => !String(r).startsWith("group_md"));
    const knockoutBand = knockoutIdx >= 0
      ? `<rect x="${Math.max(PAD.left, xPos(knockoutIdx + 1) - 8).toFixed(1)}" y="${PAD.top}" width="16" height="${innerH}" class="chart-knockout-band"><title>Inicio de eliminatorias</title></rect>`
      : "";

    const lines = [...model.series]
      .sort((a, b) => {
        const lastA = historyPositions[a.id][historyPositions[a.id].length - 1];
        const lastB = historyPositions[b.id][historyPositions[b.id].length - 1];
        return lastB - lastA;
      })
      .map(s => {
        const c = avatarColor(s.name);
        const positions = historyPositions[s.id];
        const path = positions.map((pos, i) => `${i === 0 ? "M" : "L"}${xPos(i).toFixed(1)},${yPos(pos).toFixed(1)}`).join(" ");
        const isActive = selectedId && s.id === selectedId;
        const dots = positions.map((pos, i) => {
          const label = `${s.name} - ${i === 0 ? "Inicio" : model.labels[i - 1]}: Posicion ${pos}º`;
          const cx = xPos(i).toFixed(1);
          const cy = yPos(pos).toFixed(1);
          return `<g class="chart-point"><circle cx="${cx}" cy="${cy}" r="10" class="chart-hit-area"><title>${esc(label)}</title></circle><circle cx="${cx}" cy="${cy}" r="${isActive ? "4.8" : "3.5"}" fill="${c.ring}"><title>${esc(label)}</title></circle></g>`;
        }).join("");
        const last = positions[positions.length - 1];
        const endLabel = `<text x="${(xPos(positions.length - 1) + 6).toFixed(1)}" y="${(yPos(last) + 4).toFixed(1)}" class="chart-end-label" fill="${c.ring}">${last}º</text>`;
        return `<g class="chart-series ${isActive ? "chart-series--active" : selectedId ? "chart-series--muted" : ""}" data-series-id="${esc(s.id)}"><path d="${path}" fill="none" stroke="${c.ring}" stroke-width="${isActive ? "4" : "2.5"}" stroke-linejoin="round" stroke-linecap="round"/>${dots}${endLabel}</g>`;
      }).join("");

    const legend = [...model.series]
      .sort((a, b) => {
        const lastA = historyPositions[a.id][historyPositions[a.id].length - 1];
        const lastB = historyPositions[b.id][historyPositions[b.id].length - 1];
        return lastA - lastB;
      })
      .map(s => {
        const c = avatarColor(s.name);
        const activeClass = selectedId && s.id === selectedId ? " chart-legend-item--active" : "";
        return `<button type="button" class="chart-legend-item${activeClass}" data-chart-focus="${esc(s.id)}"><span class="chart-legend-swatch" style="background:${c.ring}"></span>${esc(s.name)}</button>`;
      }).join("");

    return `
      <div class="chart-wrap ${model.rounds.length > 5 ? "chart-wrap--scroll" : ""}">
        <svg viewBox="0 0 ${W} ${H}" class="evolution-chart" role="img" aria-label="Evolucion de posiciones por jornada">
          ${knockoutBand}
          ${gridLines}
          ${xLabels}
          ${lines}
        </svg>
        <div class="chart-legend">${legend}</div>
      </div>
    `;
  }

  function icsDate(isoTime) {
    const d = new Date(isoTime);
    if (isNaN(d.getTime())) return "";
    return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  }

  function icsText(str) {
    return String(str ?? "")
      .replace(/\\/g, "\\\\")
      .replace(/\n/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");
  }

  function foldIcsLine(line) {
    const chunks = [];
    let rest = String(line);
    while (rest.length > 74) {
      chunks.push(rest.slice(0, 74));
      rest = " " + rest.slice(74);
    }
    chunks.push(rest);
    return chunks.join("\r\n");
  }

  function buildIcs(events) {
    const nowStamp = icsDate(new Date().toISOString());
    const eventLines = (events || [])
      .filter(ev => ev && ev.start)
      .map(ev => {
        const start = icsDate(ev.start);
        if (!start) return "";
        const uid = ev.uid || `porra-${String(ev.id || ev.summary || start).toLowerCase().replace(/[^a-z0-9]+/g, "-")}@porra-mundial`;
        return [
          "BEGIN:VEVENT",
          `UID:${icsText(uid)}`,
          `DTSTAMP:${nowStamp}`,
          `DTSTART:${start}`,
          `SUMMARY:${icsText(ev.summary || "Cierre pronosticos")}`,
          `DESCRIPTION:${icsText(ev.description || "La Porra del Mundial 2026")}`,
          "BEGIN:VALARM",
          "TRIGGER:-PT2H",
          "ACTION:DISPLAY",
          `DESCRIPTION:${icsText(ev.alarm || ev.summary || "Cierre pronosticos")}`,
          "END:VALARM",
          "END:VEVENT"
        ].map(foldIcsLine).join("\r\n");
      })
      .filter(Boolean)
      .join("\r\n");

    return [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//La Porra del Mundial//ES",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      eventLines,
      "END:VCALENDAR"
    ].filter(Boolean).join("\r\n") + "\r\n";
  }

  function buildReminderEvents(data) {
    const byRound = {};
    (data.matches || []).forEach(m => {
      const key = matchRoundKey(m);
      if (!key || !m.kickoff_utc) return;
      const ts = new Date(m.kickoff_utc).getTime();
      if (isNaN(ts)) return;
      if (!byRound[key] || ts < new Date(byRound[key].start).getTime()) {
        byRound[key] = {
          id: key,
          uid: `porra-${key}@porra-mundial`,
          start: m.kickoff_utc,
          summary: `Cierre pronosticos ${roundLabel(key)}`,
          description: `Primer partido de ${roundLabel(key)}. Envia tus pronosticos antes del inicio.`
        };
      }
    });

    const special = (data.specialEvents || [])
      .filter(ev => ev && ev.id !== "E2" && ev.deadline_utc && (ev.is_active === true || ev.is_active === "true" || ev.is_active === "TRUE"))
      .map(ev => ({
        id: ev.id,
        uid: `porra-evento-${ev.id}@porra-mundial`,
        start: ev.deadline_utc,
        summary: `Cierre evento ${ev.id}: ${ev.name || ev.id}`,
        description: ev.description || "Evento especial de La Porra del Mundial 2026"
      }));

    return [...Object.values(byRound), ...special].sort((a, b) => new Date(a.start) - new Date(b.start));
  }

  function googleCalendarUrl(ev) {
    if (!ev || !ev.start) return "";
    const start = icsDate(ev.start);
    if (!start) return "";
    const end = icsDate(new Date(new Date(ev.start).getTime() + 30 * 60000).toISOString());
    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: ev.summary || "Cierre pronosticos",
      dates: `${start}/${end}`,
      details: ev.description || "La Porra del Mundial 2026"
    });
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }

  function normalizePrediction(pred) {
    if (!pred) return null;
    const home = pred.predicted_home ?? pred.home;
    const away = pred.predicted_away ?? pred.away;
    if (home === null || home === undefined || home === "" || away === null || away === undefined || away === "") return null;
    return { home: Number(home), away: Number(away) };
  }

  function currentScoreByParticipant(data) {
    const board = Scoring.buildLeaderboard(
      data.participants || [],
      data.matchPredictions || [],
      data.scorerPicks || [],
      data.goalkeeperPicks || [],
      data.specialEventPicks || []
    );
    return Object.fromEntries(board.map(p => [p.id, p.totalPoints]));
  }

  function simulateScenarios(data, aId, bId, roundKey) {
    const scoreMap = currentScoreByParticipant(data);
    const currentA = Number(scoreMap[aId]) || 0;
    const currentB = Number(scoreMap[bId]) || 0;
    const allPending = (data.matches || [])
      .filter(m => matchRoundKey(m) === roundKey && m.status !== "finished")
      .filter(m => m.home_score === null || m.home_score === undefined || m.home_score === "");
    const matches = allPending
      .sort((a, b) => new Date(a.kickoff_utc || 0) - new Date(b.kickoff_utc || 0))
      .slice(0, 6);

    const details = matches.map(match => {
      const predA = normalizePrediction((data.matchPredictions || []).find(mp => mp.participant_id === aId && mp.match_id === match.id));
      const predB = normalizePrediction((data.matchPredictions || []).find(mp => mp.participant_id === bId && mp.match_id === match.id));
      let best = null;
      let worst = null;
      for (let h = 0; h <= 4; h++) {
        for (let a = 0; a <= 4; a++) {
          const doublePoints = match.is_double_points === true || match.is_double_points === "true" || match.is_double_points === "TRUE";
          const pointsA = predA ? Scoring.calculateMatchPoints(predA.home, predA.away, h, a, doublePoints) : 0;
          const pointsB = predB ? Scoring.calculateMatchPoints(predB.home, predB.away, h, a, doublePoints) : 0;
          const scenario = { home: h, away: a, pointsA, pointsB, diff: pointsA - pointsB };
          if (!best || scenario.diff > best.diff) best = scenario;
          if (!worst || scenario.diff < worst.diff) worst = scenario;
        }
      }
      return { match, predA, predB, best, worst };
    });

    const bestDelta = details.reduce((sum, item) => sum + (item.best ? item.best.diff : 0), 0);
    const worstDelta = details.reduce((sum, item) => sum + (item.worst ? item.worst.diff : 0), 0);
    const currentDiff = currentA - currentB;

    return {
      aId,
      bId,
      roundKey,
      currentA,
      currentB,
      currentDiff,
      bestDiff: currentDiff + bestDelta,
      worstDiff: currentDiff + worstDelta,
      bestDelta,
      worstDelta,
      limited: allPending.length > matches.length,
      matches: details
    };
  }

  function headToHead(data, aId, bId) {
    const finished = (data.matches || [])
      .filter(m => m.status === "finished" && m.home_score !== null && m.home_score !== undefined && m.home_score !== "")
      .sort((a, b) => new Date(a.kickoff_utc || 0) - new Date(b.kickoff_utc || 0));
    const rows = finished.map(match => {
      const predA = (data.matchPredictions || []).find(mp => mp.participant_id === aId && mp.match_id === match.id);
      const predB = (data.matchPredictions || []).find(mp => mp.participant_id === bId && mp.match_id === match.id);
      const pointsA = Number(predA && predA.points_earned) || 0;
      const pointsB = Number(predB && predB.points_earned) || 0;
      const winner = pointsA > pointsB ? "A" : pointsB > pointsA ? "B" : "=";
      return { match, predA: normalizePrediction(predA), predB: normalizePrediction(predB), pointsA, pointsB, winner };
    });

    const moduleTotals = {
      matchA: rows.reduce((s, r) => s + r.pointsA, 0),
      matchB: rows.reduce((s, r) => s + r.pointsB, 0),
      scorerA: (data.scorerPicks || []).filter(p => p.participant_id === aId).reduce((s, p) => s + (Number(p.points_earned) || 0), 0),
      scorerB: (data.scorerPicks || []).filter(p => p.participant_id === bId).reduce((s, p) => s + (Number(p.points_earned) || 0), 0),
      goalkeeperA: (data.goalkeeperPicks || []).filter(p => p.participant_id === aId).reduce((s, p) => s + (Number(p.points_earned) || 0), 0),
      goalkeeperB: (data.goalkeeperPicks || []).filter(p => p.participant_id === bId).reduce((s, p) => s + (Number(p.points_earned) || 0), 0),
      specialA: (data.specialEventPicks || []).filter(p => p.participant_id === aId).reduce((s, p) => s + (Number(p.points_earned) || 0), 0),
      specialB: (data.specialEventPicks || []).filter(p => p.participant_id === bId).reduce((s, p) => s + (Number(p.points_earned) || 0), 0)
    };

    const winsA = rows.filter(r => r.winner === "A").length;
    const winsB = rows.filter(r => r.winner === "B").length;
    let streakOwner = "=", streakLength = 0;
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i].winner === "=") {
        if (streakLength === 0) streakOwner = "=";
        break;
      }
      if (streakLength === 0) {
        streakOwner = rows[i].winner;
        streakLength = 1;
      } else if (rows[i].winner === streakOwner) {
        streakLength++;
      } else {
        break;
      }
    }

    return { rows, winsA, winsB, draws: rows.length - winsA - winsB, moduleTotals, streakOwner, streakLength };
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  return {
    avatarHtml,
    avatarColor,
    computeRoundTotals,
    computePositionDeltas,
    deltaBadgeHtml,
    evolutionChartHtml: evolutionChartHtmlV2,
    evolutionPositionChartHtml,
    computeFunStats,
    funStatsHtml,
    computeAchievements,
    achievementsHtml,
    getNextMatch,
    startCountdown: startCountdownV2,
    buildIcs,
    buildReminderEvents,
    googleCalendarUrl,
    simulateScenarios,
    headToHead
  };
})();

// =============================================================================
// Oracle Floating Widget — self-contained, mounts on every page
// =============================================================================
(function initOracleWidget() {
  "use strict";

  const chatHistory = [];
  let isOpen = false;
  let isBusy = false;

  // ── Build DOM ──────────────────────────────────────────────────────────────
  function mount() {
    const widget = document.createElement("div");
    widget.className = "oracle-widget";
    widget.id = "oracle-widget";
    widget.innerHTML = `
      <div class="oracle-panel" id="oracle-panel" style="display:none;">
        <div class="oracle-panel__header">
          <span class="oracle-panel__header-emoji">🧙‍♂️</span>
          <div>
            <div class="oracle-panel__header-title">El Oráculo del Cuñao</div>
          </div>
        </div>
        <div class="oracle-panel__messages" id="oracle-messages">
          <div class="oraculo-msg oraculo-msg--oracle">
            <span class="oraculo-avatar">🧙‍♂️</span>
            <div class="oraculo-bubble oraculo-bubble--oracle">Buenas. El Oráculo al aparato. Pregunta lo que quieras, que de esto sé un rato.</div>
          </div>
        </div>
        <div class="oracle-panel__footer">
          <textarea id="oracle-input" class="oracle-panel__input" rows="1"
            placeholder="Pregunta algo…"></textarea>
          <button id="oracle-send" class="oracle-panel__send" title="Enviar">➤</button>
        </div>
      </div>
      <button class="oracle-fab" id="oracle-fab" aria-label="Abrir el Oráculo">🧙‍♂️</button>
    `;
    document.body.appendChild(widget);

    document.getElementById("oracle-fab").addEventListener("click", togglePanel);
    document.getElementById("oracle-send").addEventListener("click", sendMessage);
    document.getElementById("oracle-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
  }

  // ── Toggle panel ──────────────────────────────────────────────────────────
  function togglePanel() {
    isOpen = !isOpen;
    const panel = document.getElementById("oracle-panel");
    const fab   = document.getElementById("oracle-fab");
    if (isOpen) {
      panel.style.display = "flex";
      panel.style.flexDirection = "column";
      fab.textContent = "✕";
      fab.classList.add("oracle-fab--open");
      document.getElementById("oracle-input").focus();
    } else {
      panel.style.display = "none";
      fab.textContent = "🧙‍♂️";
      fab.classList.remove("oracle-fab--open");
    }
  }

  // ── Messaging helpers ──────────────────────────────────────────────────────
  function scrollBottom() {
    const box = document.getElementById("oracle-messages");
    if (box) box.scrollTop = box.scrollHeight;
  }

  function appendMsg(role, text) {
    const isOracle = role === "oracle";
    const div = document.createElement("div");
    div.className = `oraculo-msg ${isOracle ? "oraculo-msg--oracle" : "oraculo-msg--user"}`;
    div.innerHTML = `
      ${isOracle ? '<span class="oraculo-avatar">🧙‍♂️</span>' : ""}
      <div class="oraculo-bubble ${isOracle ? "oraculo-bubble--oracle" : "oraculo-bubble--user"}">${escHtml(text)}</div>
      ${!isOracle ? '<span class="oraculo-avatar">👤</span>' : ""}
    `;
    document.getElementById("oracle-messages").appendChild(div);
    scrollBottom();
  }

  function createStreamBubble() {
    const div = document.createElement("div");
    div.className = "oraculo-msg oraculo-msg--oracle";
    div.innerHTML = `
      <span class="oraculo-avatar">🧙‍♂️</span>
      <div class="oraculo-bubble oraculo-bubble--oracle oraculo-bubble--streaming"></div>
    `;
    document.getElementById("oracle-messages").appendChild(div);
    scrollBottom();
    const bubble = div.querySelector(".oraculo-bubble");
    let acc = "";
    return {
      append(chunk) { acc += chunk; bubble.textContent = acc; scrollBottom(); },
      finalize() { bubble.classList.remove("oraculo-bubble--streaming"); return acc; }
    };
  }

  function appendTyping() {
    const div = document.createElement("div");
    div.className = "oraculo-msg oraculo-msg--oracle";
    div.id = "oracle-typing";
    div.innerHTML = `
      <span class="oraculo-avatar">🧙‍♂️</span>
      <div class="oraculo-bubble oraculo-bubble--oracle oraculo-typing">
        <span></span><span></span><span></span>
      </div>`;
    document.getElementById("oracle-messages").appendChild(div);
    scrollBottom();
  }

  function removeTyping() {
    document.getElementById("oracle-typing")?.remove();
  }

  function escHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ── GAS context ───────────────────────────────────────────────────────────
  async function fetchContext() {
    try {
      const r = await fetch(CONFIG.appsScriptUrl, {
        method: "POST", mode: "cors",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "getOracleContext" })
      });
      const j = await r.json();
      if (j.success && j.result) {
        return {
          context: j.result.context,
          geminiApiKey: j.result.geminiApiKey
        };
      }
      return null;
    } catch { return null; }
  }

  // ── Prompt builder ─────────────────────────────────────────────────────────
  function buildPrompt(question, ctx) {
    let ctxBlock = "";
    if (ctx) {
      ctxBlock = "\n\n--- DATOS ACTUALES DE LA PORRA ---\n" +
        "Jornada: " + ctx.jornada + "\n" +
        "Clasificación:\n" + ctx.clasificacion + "\n" +
        "Goleadores: " + ctx.goleadores + "\n" +
        "Porteros: " + ctx.porteros + "\n--- FIN ---";
    }
    const system = "Eres 'El Oráculo de la Barra', un tío que sabe demasiado de fútbol y no puede callarse. Tu tono es humor español de Twitter: takes calientes, ironía seca, frases cortas y contundentes, algún emoji bien puesto (no más de 2), nada de parrafadas. Tienes acceso a los datos reales de una porra del Mundial entre amigos y DEBES usarlos cuando sean relevantes: liquida al colista, ensalza al líder, opina sobre los picks con total seguridad. Responde en máximo 3-4 frases. Estilo: si alguien dice algo obvio tú ya lo sabías. Si hay un colista, es culpa suya. Si hay un líder, es por suerte. Nunca admitas incertidumbre." + ctxBlock;

    let prompt = system + "\n\n";
    chatHistory.slice(-8).forEach(m => {
      prompt += (m.role === "user" ? "Usuario: " : "Cuñado: ") + m.text + "\n";
    });
    prompt += "Usuario: " + question + "\nCuñado:";
    return prompt;
  }

  // ── Gemini call (non-streaming) ───────────────────────────────────────────
  async function callGemini(promptText, apiKey) {
    const key = apiKey || CONFIG.geminiApiKey;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${key}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
    });
    if (!resp.ok) throw new Error(`Gemini ${resp.status}`);
    const data = await resp.json();
    const parts = data?.candidates?.[0]?.content?.parts || [];
    let text = "";
    for (const part of parts) {
      if (part.thought !== true && part.text) {
        text += part.text;
      }
    }
    if (!text) throw new Error("Respuesta vacía de la IA");
    return text;
  }

  // ── Send ───────────────────────────────────────────────────────────────────
  async function sendMessage() {
    if (isBusy) return;
    const input = document.getElementById("oracle-input");
    const sendBtn = document.getElementById("oracle-send");
    const question = input.value.trim();
    if (!question) return;

    input.value = "";
    isBusy = true;
    sendBtn.disabled = true;

    appendMsg("user", question);
    chatHistory.push({ role: "user", text: question });

    appendTyping();
    const resultObj = await fetchContext();
    
    try {
      const prompt = buildPrompt(question, resultObj?.context);
      const apiKey = resultObj?.geminiApiKey;
      const full = await callGemini(prompt, apiKey);
      removeTyping();
      appendMsg("oracle", full);
      chatHistory.push({ role: "oracle", text: full });
    } catch (err) {
      removeTyping();
      appendMsg("oracle", "Se ha caído la Wi-Fi del bar 😤 (" + err.message + ")");
    } finally {
      isBusy = false;
      sendBtn.disabled = false;
      input.focus();
    }
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();

