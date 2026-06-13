/* UI и отрисовка визуализации K-Means. */
(function () {
  "use strict";

  const PALETTE = ["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444",
                   "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

  const $ = (id) => document.getElementById(id);
  const canvas = $("canvas");
  const ctx = canvas.getContext("2d");

  const datasetSel = $("dataset");
  const pointsRange = $("points"), pointsVal = $("pointsVal");
  const kRange = $("k"), kVal = $("kVal");
  const initSel = $("init");
  const speedRange = $("speed"), speedVal = $("speedVal");
  const playBtn = $("play"), stepBtn = $("step"), resetBtn = $("reset"), regenBtn = $("regen");

  let pts = [];
  let km = null;
  let cdisp = [];           // отображаемые позиции центроидов (для плавного скольжения)
  let trails = [];          // следы центроидов
  let playing = false, acc = 0, lastT = 0, seed = 11;
  let W = 0, H = 0;
  const PAD = 18;

  window.Datasets.list.forEach((d) => {
    const o = document.createElement("option");
    o.value = d.id; o.textContent = d.name;
    datasetSel.appendChild(o);
  });
  datasetSel.value = "blobs";

  function plot() { const size = Math.min(W, H) - 2 * PAD; return { size, ox: (W - size) / 2, oy: (H - size) / 2 }; }
  function toX(nx) { const p = plot(); return p.ox + nx * p.size; }
  function toY(ny) { const p = plot(); return p.oy + ny * p.size; }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    W = rect.width; H = rect.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    render();
  }

  function regenData() {
    pts = window.Datasets.generate(datasetSel.value, +pointsRange.value, seed);
    rebuild();
  }
  function rebuild() {
    km = new window.KMeansStepper(pts, +kRange.value, initSel.value);
    cdisp = km.centroids.map((c) => ({ x: c.x, y: c.y }));
    trails = km.centroids.map((c) => [{ x: c.x, y: c.y }]);
    pause();
    updateStats();
    render();
  }
  function reinitCentroids() { rebuild(); } // тот же эффект — новые центроиды

  function doStep() {
    if (km.converged) return;
    const ev = km.step();
    if (ev && ev.type === "update") {
      km.centroids.forEach((c, i) => {
        const t = trails[i];
        const last = t[t.length - 1];
        if (Math.hypot(last.x - c.x, last.y - c.y) > 1e-3) t.push({ x: c.x, y: c.y });
      });
    }
    updateStats();
  }

  function stepsPerSec() { const t = (+speedRange.value - 1) / 99; return Math.round(1 + 11 * t * t); }

  function play() { if (km.converged) rebuild(); playing = true; acc = 0; updatePlayBtn(); }
  function pause() { playing = false; updatePlayBtn(); }
  function togglePlay() { playing ? pause() : play(); }
  function updatePlayBtn() {
    playBtn.innerHTML = playing
      ? '<svg width="13" height="13" viewBox="0 0 12 12"><rect x="2" y="1.5" width="3" height="9" rx="1" fill="currentColor"/><rect x="7" y="1.5" width="3" height="9" rx="1" fill="currentColor"/></svg> Пауза'
      : '<svg width="13" height="13" viewBox="0 0 12 12"><path d="M3 1.5l7 4.5-7 4.5z" fill="currentColor"/></svg> Запуск';
  }

  function updateStats() {
    const s = km.stats();
    $("statIter").textContent = s.iter;
    $("statInertia").textContent = s.inertia.toFixed(2);
    $("statMoved").textContent = s.moved.toFixed(4);
    const phaseRu = s.converged ? "сошёлся" : (s.phase === "assign" ? "далее: распределение" : "далее: сдвиг центров");
    $("statPhase").textContent = phaseRu;
    stepBtn.disabled = s.converged;
    $("phaseTag").textContent = s.converged ? "✓ сходимость" : (s.phase === "assign" ? "шаг: assign" : "шаг: update");
    $("phaseTag").className = "phase-tag " + (s.converged ? "done" : s.phase);
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    if (!km) return;

    // линии привязки точек к центроидам
    ctx.lineWidth = 1;
    for (let i = 0; i < pts.length; i++) {
      const c = km.assign[i];
      if (c < 0) continue;
      ctx.strokeStyle = hexA(PALETTE[c % PALETTE.length], 0.13);
      ctx.beginPath();
      ctx.moveTo(toX(pts[i].x), toY(pts[i].y));
      ctx.lineTo(toX(cdisp[c].x), toY(cdisp[c].y));
      ctx.stroke();
    }

    // точки
    for (let i = 0; i < pts.length; i++) {
      const c = km.assign[i];
      ctx.beginPath();
      ctx.arc(toX(pts[i].x), toY(pts[i].y), 4, 0, Math.PI * 2);
      ctx.fillStyle = c < 0 ? "#cbd5e1" : PALETTE[c % PALETTE.length];
      ctx.fill();
    }

    // следы центроидов
    for (let c = 0; c < cdisp.length; c++) {
      const t = trails[c];
      if (t.length < 2) continue;
      ctx.strokeStyle = hexA(PALETTE[c % PALETTE.length], 0.4);
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(toX(t[0].x), toY(t[0].y));
      for (let j = 1; j < t.length; j++) ctx.lineTo(toX(t[j].x), toY(t[j].y));
      ctx.lineTo(toX(cdisp[c].x), toY(cdisp[c].y));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // центроиды — крупные ромбы
    for (let c = 0; c < cdisp.length; c++) {
      const x = toX(cdisp[c].x), y = toY(cdisp[c].y), col = PALETTE[c % PALETTE.length];
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = col;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.rect(-7, -7, 14, 14);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  function loop(t) {
    requestAnimationFrame(loop);
    if (!lastT) lastT = t;
    const dt = t - lastT; lastT = t;
    // плавное скольжение отображаемых центроидов к фактическим
    if (km) {
      for (let c = 0; c < cdisp.length; c++) {
        cdisp[c].x += (km.centroids[c].x - cdisp[c].x) * 0.18;
        cdisp[c].y += (km.centroids[c].y - cdisp[c].y) * 0.18;
      }
    }
    if (playing && km && !km.converged) {
      acc += dt;
      const interval = 1000 / stepsPerSec();
      let guard = 0;
      while (acc >= interval && !km.converged && guard < 50) { doStep(); acc -= interval; guard++; }
      if (km.converged) pause();
    }
    render();
  }

  function syncLabels() {
    pointsVal.textContent = pointsRange.value;
    kVal.textContent = kRange.value;
    speedVal.textContent = speedRange.value;
  }

  datasetSel.addEventListener("change", regenData);
  pointsRange.addEventListener("input", () => { syncLabels(); regenData(); });
  kRange.addEventListener("input", () => { syncLabels(); rebuild(); });
  initSel.addEventListener("change", rebuild);
  speedRange.addEventListener("input", syncLabels);
  playBtn.addEventListener("click", togglePlay);
  stepBtn.addEventListener("click", () => { pause(); doStep(); });
  resetBtn.addEventListener("click", reinitCentroids);
  regenBtn.addEventListener("click", () => { seed = (seed * 1103515245 + 12345) >>> 0; regenData(); });

  canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const p = plot();
    const nx = (e.clientX - rect.left - p.ox) / p.size;
    const ny = (e.clientY - rect.top - p.oy) / p.size;
    if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return;
    pts.push({ x: nx, y: ny });
    rebuild();
  });

  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "SELECT" || e.target.tagName === "INPUT") return;
    if (e.code === "Space") { e.preventDefault(); togglePlay(); }
    else if (e.code === "ArrowRight") { pause(); doStep(); }
    else if (e.key === "r" || e.key === "R" || e.key === "к" || e.key === "К") reinitCentroids();
    else if (e.key === "n" || e.key === "N" || e.key === "т" || e.key === "Т") { seed = (seed * 1103515245 + 12345) >>> 0; regenData(); }
  });
  window.addEventListener("resize", resize);

  syncLabels();
  resize();
  regenData();
  requestAnimationFrame(loop);
})();
