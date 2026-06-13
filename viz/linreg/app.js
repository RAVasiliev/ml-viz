/* UI и отрисовка линейной регрессии 1D: точки, истинная и подобранная линии,
   остатки, бейзлайн ȳ, живые метрики недели 1. Подгонка — замкнутой формой
   (OLS/LAD) или градиентным спуском с анимацией по итерациям. */
(function () {
  "use strict";

  const ACCENT = "#4f46e5";   // подобранная линия / точки
  const ERR = "#ef4444";      // остатки
  const TRUE = "#10b981";     // истинная линия
  const FAINT = "#8a93a3";

  const $ = (id) => document.getElementById(id);
  const canvas = $("canvas"), ctx = canvas.getContext("2d");

  const datasetSel = $("dataset");
  const pointsRange = $("points"), pointsVal = $("pointsVal");
  const noiseRange = $("noise"), noiseVal = $("noiseVal");
  const lossSel = $("loss");
  const methodSel = $("method");
  const lrRange = $("lr"), lrVal = $("lrVal");
  const speedRange = $("speed"), speedVal = $("speedVal");
  const playBtn = $("play"), stepBtn = $("step"), resetBtn = $("reset"), regenBtn = $("regen");
  const progressBar = $("progressBar");
  const eqnEl = $("eqn");

  let pts = [];                 // сырые точки {x in [0,1], y}
  let trueLine = null;          // {a,b} или null
  let gd = null;                // степпер GD (когда method=gd)
  let line = { a: 0, b: 0 };    // текущая отображаемая линия
  let yMin = 0, yMax = 1, yMean = 0;
  let playing = false, acc = 0, lastT = 0, seed = 7;
  let W = 0, H = 0;
  const PAD = 22;

  window.LinReg.list.forEach((d) => {
    const o = document.createElement("option"); o.value = d.id; o.textContent = d.name; datasetSel.appendChild(o);
  });
  datasetSel.value = "linear";

  /* ---------- координаты: квадратный плот, x∈[0,1] по горизонтали,
       y маппится из [yMin,yMax] в [0,1] (с инверсией — выше значение выше на экране) ---------- */
  function plot() { const size = Math.min(W, H) - 2 * PAD; return { size, ox: (W - size) / 2, oy: (H - size) / 2 }; }
  const toPX = (nx) => { const p = plot(); return p.ox + nx * p.size; };
  const toPY = (ny) => { const p = plot(); return p.oy + (1 - ny) * p.size; }; // ny∈[0,1], 0 внизу
  function normY(y) { const span = (yMax - yMin) || 1; return (y - yMin) / span; }
  const sx = (x) => toPX(x);
  const sy = (y) => toPY(normY(y));

  function sizeCanvas(cv, c) {
    const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    c.setTransform(dpr, 0, 0, dpr, 0, 0); return { w: r.width, h: r.height };
  }
  function resize() { const a = sizeCanvas(canvas, ctx); W = a.w; H = a.h; render(); }

  function noiseSigma() { return +noiseRange.value / 100; }    // 0..0.60
  function learnRate() { return (+lrRange.value) / 100; }      // 0.01..1.20

  function computeYRange() {
    if (!pts.length) { yMin = 0; yMax = 1; yMean = 0; return; }
    let lo = Infinity, hi = -Infinity, s = 0;
    for (const p of pts) { if (p.y < lo) lo = p.y; if (p.y > hi) hi = p.y; s += p.y; }
    yMean = s / pts.length;
    const pad = (hi - lo) * 0.08 || 0.1;
    yMin = lo - pad; yMax = hi + pad;
  }

  function regenData() {
    const d = window.LinReg.generate(datasetSel.value, +pointsRange.value, noiseSigma(), seed);
    pts = d.points; trueLine = d.trueLine;
    computeYRange();
    rebuild();
  }

  // Пересобрать подгонку под текущие настройки (лосс/метод).
  function rebuild() {
    const loss = lossSel.value;
    if (methodSel.value === "gd") {
      gd = new window.LinReg.GD(pts, { loss, lr: learnRate(), maxIter: 600 });
      line = gd.line();
    } else {
      gd = null;
      line = (loss === "mae") ? window.LinReg.fitLAD(pts) : window.LinReg.fitOLS(pts);
    }
    pause();
    updateStats();
    render();
  }

  function doStep() { if (gd && !gd.done) { gd.step(); line = gd.line(); } updateStats(); }
  function stepsPerSec() { const t = (+speedRange.value - 1) / 99; return Math.round(2 + 60 * t * t); }

  function play() {
    if (methodSel.value !== "gd") { methodSel.value = "gd"; rebuild(); }
    if (gd && gd.done) rebuild();
    playing = true; acc = 0; updatePlayBtn();
  }
  function pause() { playing = false; updatePlayBtn(); }
  function togglePlay() { playing ? pause() : play(); }
  function updatePlayBtn() {
    playBtn.innerHTML = playing
      ? '<svg width="13" height="13" viewBox="0 0 12 12"><rect x="2" y="1.5" width="3" height="9" rx="1" fill="currentColor"/><rect x="7" y="1.5" width="3" height="9" rx="1" fill="currentColor"/></svg> Пауза'
      : '<svg width="13" height="13" viewBox="0 0 12 12"><path d="M3 1.5l7 4.5-7 4.5z" fill="currentColor"/></svg> Запуск';
  }

  function fmt(v) { return Number.isFinite(v) ? (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(3)) : "—"; }

  function updateStats() {
    const m = window.LinReg.metrics(pts, line.a, line.b);
    $("statMSE").textContent = fmt(m.mse);
    $("statMAE").textContent = fmt(m.mae);
    $("statRMSE").textContent = fmt(m.rmse);
    $("statR2").textContent = Number.isFinite(m.r2) ? m.r2.toFixed(3) : "—";
    $("statMAPE").textContent = fmt(m.mape) + "%";
    const iter = gd ? gd.iter : 0;
    $("statIter").textContent = iter;

    if (methodSel.value === "gd" && gd) {
      progressBar.style.width = Math.min(100, (gd.iter / gd.maxIter) * 100) + "%";
      stepBtn.disabled = gd.done;
    } else {
      progressBar.style.width = "100%";
      stepBtn.disabled = true;
    }

    const eqLine = `<span class="lab-line">ŷ = ${line.a.toFixed(3)}·x ${line.b >= 0 ? "+ " + line.b.toFixed(3) : "− " + Math.abs(line.b).toFixed(3)}</span>`;
    const eqTrue = trueLine
      ? `<br><span class="lab-true">истинная: y = ${trueLine.a.toFixed(2)}·x + ${trueLine.b.toFixed(2)} + шум</span>`
      : `<br><span class="lab-true">истинная связь нелинейна — прямая её не ловит идеально</span>`;
    eqnEl.innerHTML = eqLine + eqTrue;
  }

  /* ---------- отрисовка ---------- */
  function render() {
    ctx.clearRect(0, 0, W, H);
    if (!pts.length) return;
    const p = plot();

    // рамка плота
    ctx.strokeStyle = "rgba(20,23,28,.10)"; ctx.lineWidth = 1;
    ctx.strokeRect(p.ox + .5, p.oy + .5, p.size, p.size);

    // бейзлайн ȳ (горизонтальная пунктирная) — знаменатель R²
    const yb = sy(yMean);
    ctx.save();
    ctx.strokeStyle = "rgba(20,23,28,.28)"; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(p.ox, yb); ctx.lineTo(p.ox + p.size, yb); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = FAINT; ctx.font = "11px -apple-system, sans-serif";
    ctx.fillText("ȳ (бейзлайн)", p.ox + 6, yb - 5);

    // остатки: вертикальный отрезок от точки до линии
    ctx.strokeStyle = "rgba(239,68,68,.5)"; ctx.lineWidth = 1.4;
    for (const pt of pts) {
      const yhat = line.a * pt.x + line.b;
      ctx.beginPath();
      ctx.moveTo(sx(pt.x), sy(pt.y));
      ctx.lineTo(sx(pt.x), sy(yhat));
      ctx.stroke();
    }

    // истинная линия (пунктир, если применимо)
    if (trueLine) {
      ctx.save();
      ctx.strokeStyle = TRUE; ctx.lineWidth = 2; ctx.setLineDash([7, 5]);
      drawLineSeg(trueLine.a, trueLine.b);
      ctx.restore();
    }

    // подобранная линия (сплошная, акцент)
    ctx.strokeStyle = ACCENT; ctx.lineWidth = 3;
    drawLineSeg(line.a, line.b);

    // точки выборки поверх
    for (const pt of pts) {
      ctx.beginPath(); ctx.arc(sx(pt.x), sy(pt.y), 3.8, 0, Math.PI * 2);
      ctx.fillStyle = ACCENT; ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = "#fff"; ctx.stroke();
    }
  }

  // нарисовать линию y=a*x+b по диапазону x∈[0,1], клиппинг через плот
  function drawLineSeg(a, b) {
    const x0 = 0, x1 = 1;
    ctx.beginPath();
    ctx.moveTo(sx(x0), sy(a * x0 + b));
    ctx.lineTo(sx(x1), sy(a * x1 + b));
    ctx.stroke();
  }

  function loop(t) {
    requestAnimationFrame(loop);
    if (!lastT) lastT = t;
    const dt = t - lastT; lastT = t;
    if (playing && gd && !gd.done) {
      acc += dt; const interval = 1000 / stepsPerSec(); let guard = 0;
      while (acc >= interval && !gd.done && guard < 200) { gd.step(); acc -= interval; guard++; }
      line = gd.line();
      updateStats();
      if (gd.done) pause();
    }
    render();
  }

  function syncLabels() {
    pointsVal.textContent = pointsRange.value;
    noiseVal.textContent = noiseSigma().toFixed(2);
    lrVal.textContent = learnRate().toFixed(2);
    speedVal.textContent = speedRange.value;
  }

  datasetSel.addEventListener("change", regenData);
  pointsRange.addEventListener("input", () => { syncLabels(); regenData(); });
  noiseRange.addEventListener("input", () => { syncLabels(); regenData(); });
  lossSel.addEventListener("change", rebuild);
  methodSel.addEventListener("change", rebuild);
  lrRange.addEventListener("input", () => { syncLabels(); if (methodSel.value === "gd") rebuild(); });
  speedRange.addEventListener("input", syncLabels);
  playBtn.addEventListener("click", togglePlay);
  stepBtn.addEventListener("click", () => { if (methodSel.value !== "gd") { methodSel.value = "gd"; rebuild(); } pause(); doStep(); });
  resetBtn.addEventListener("click", rebuild);
  regenBtn.addEventListener("click", () => { seed = (seed * 1103515245 + 12345) >>> 0; regenData(); });

  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "SELECT" || e.target.tagName === "INPUT") return;
    if (e.code === "Space") { e.preventDefault(); togglePlay(); }
    else if (e.code === "ArrowRight") { if (methodSel.value !== "gd") { methodSel.value = "gd"; rebuild(); } pause(); doStep(); }
    else if (e.key === "r" || e.key === "R" || e.key === "к" || e.key === "К") rebuild();
    else if (e.key === "n" || e.key === "N" || e.key === "т" || e.key === "Т") { seed = (seed * 1103515245 + 12345) >>> 0; regenData(); }
  });
  window.addEventListener("resize", resize);

  syncLabels(); resize(); regenData(); requestAnimationFrame(loop);
})();
