/* Логистическая регрессия: heatmap вероятности p(x) + граница p=0.5 (сверху);
   снизу — тепловая карта поверхности лог-лосса L(w1,w2) с траекторией
   градиентного спуска и кривая лог-лосса по итерациям. Vanilla JS. */
(function () {
  "use strict";

  const C0 = [79, 70, 229], C1 = [239, 68, 68];     // класс 0 синий, класс 1 красный
  const COL0 = "#4f46e5", COL1 = "#ef4444", ACCENT = "#4f46e5";
  const $ = (id) => document.getElementById(id);

  // ---------- датасеты (линейно-разумные, симметричны относительно центра) ----------
  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function gauss(r, m, sd) { let u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return m + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  const clampp = (x) => Math.max(0.05, Math.min(0.95, x));
  function blobs(seed, angleDeg, offset, sigma, n) {
    const r = mulberry32(seed >>> 0), a = angleDeg * Math.PI / 180;
    const dx = Math.cos(a) * offset, dy = Math.sin(a) * offset;
    const points = [], labels = [];
    for (let i = 0; i < n; i++) {
      const c0 = i % 2 === 0;
      const mx = 0.5 + (c0 ? -dx : dx), my = 0.5 + (c0 ? -dy : dy);
      points.push({ x: clampp(gauss(r, mx, sigma)), y: clampp(gauss(r, my, sigma)) });
      labels.push(c0 ? 0 : 1);
    }
    return { points, labels };
  }
  const DS = [
    { id: "sep", name: "Два облака (разделимы)", gen: (s) => blobs(s, 35, 0.27, 0.075, 240) },
    { id: "overlap", name: "С перекрытием", gen: (s) => blobs(s, 35, 0.15, 0.12, 240) },
    { id: "vert", name: "Вертикальная граница", gen: (s) => blobs(s, 2, 0.28, 0.085, 240) },
    { id: "diag", name: "По диагонали", gen: (s) => blobs(s, 118, 0.26, 0.08, 240) },
  ];

  const canvas = $("canvas"), ctx = canvas.getContext("2d");
  const surfCv = $("surfCv"), pctx = surfCv.getContext("2d");
  const lossCv = $("lossCv"), lctx = lossCv.getContext("2d");
  const datasetSel = $("dataset");
  const lrRange = $("lr"), lrVal = $("lrVal");
  const lambdaRange = $("lambda"), lambdaVal = $("lambdaVal");
  const speedRange = $("speed"), speedVal = $("speedVal");
  const playBtn = $("play"), stepBtn = $("step"), resetBtn = $("reset"), regenBtn = $("regen");
  const progressBar = $("progressBar");

  let X = [], yv = [], model = null;
  let playing = false, acc = 0, lastT = 0, seed = 7;
  let W = 0, H = 0, PW = 0, PH = 0, LW = 0, LH = 0;
  const PAD = 16;

  // буфер heatmap вероятности (главная карта)
  const GRID = 96;
  const hm = document.createElement("canvas"); hm.width = GRID; hm.height = GRID;
  const hmCtx = hm.getContext("2d"); const hmImg = hmCtx.createImageData(GRID, GRID);
  // буфер поверхности лог-лосса (нижняя панель)
  const SG = 60;
  const sf = document.createElement("canvas"); sf.width = SG; sf.height = SG;
  const sfCtx = sf.getContext("2d"); const sfImg = sfCtx.createImageData(SG, SG);
  let R = 4, wStar = [0, 0];

  DS.forEach((d) => { const o = document.createElement("option"); o.value = d.id; o.textContent = d.name; datasetSel.appendChild(o); });
  datasetSel.value = "sep";

  function plot() { const size = Math.min(W, H) - 2 * PAD; return { size, ox: (W - size) / 2, oy: (H - size) / 2 }; }
  const toX = (nx) => { const p = plot(); return p.ox + nx * p.size; };
  const toY = (ny) => { const p = plot(); return p.oy + ny * p.size; };

  function sizeCanvas(cv, c) { const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1; cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); c.setTransform(dpr, 0, 0, dpr, 0, 0); return { w: r.width, h: r.height }; }
  function resize() {
    const a = sizeCanvas(canvas, ctx); W = a.w; H = a.h;
    const b = sizeCanvas(surfCv, pctx); PW = b.w; PH = b.h;
    const d = sizeCanvas(lossCv, lctx); LW = d.w; LH = d.h;
    render();
  }

  function regenData() { const r = DS.find((d) => d.id === datasetSel.value) || DS[0]; const g = r.gen(seed); X = g.points; yv = g.labels; rebuild(); }
  function rebuild() {
    model = new window.LogRegStepper(X, yv, { lr: +lrRange.value, lambda: +lambdaRange.value, maxIter: 600 });
    computeSurface();
    pause(); updateStats(); render();
  }
  // поверхность L(w1,w2): прогоняем копию до сходимости → wStar → масштаб R → сетка значений
  function computeSurface() {
    const probe = new window.LogRegStepper(X, yv, { lr: +lrRange.value, lambda: +lambdaRange.value, maxIter: 1500 });
    let g = 0; while (!probe.done && g < 1500) { probe.step(); g++; }
    wStar = [probe.w[0], probe.w[1]];
    R = Math.max(2, 1.45 * Math.max(Math.abs(wStar[0]), Math.abs(wStar[1])));
    let mn = Infinity, mx = -Infinity; const vals = new Float64Array(SG * SG);
    for (let gy = 0; gy < SG; gy++) {
      const b = R - (gy + 0.5) / SG * 2 * R;
      for (let gx = 0; gx < SG; gx++) {
        const a = -R + (gx + 0.5) / SG * 2 * R;
        const v = model.lossW(a, b); vals[gy * SG + gx] = v;
        if (v < mn) mn = v; if (v > mx) mx = v;
      }
    }
    const dd = sfImg.data, span = (mx - mn) || 1;
    for (let i = 0; i < SG * SG; i++) {
      const t = Math.pow((vals[i] - mn) / span, 0.55);  // gamma — подчёркиваем дно
      // дно — тёмный индиго, верхи — почти белый (высокий контраст)
      dd[i * 4] = Math.round(49 + (246 - 49) * t);
      dd[i * 4 + 1] = Math.round(46 + (247 - 46) * t);
      dd[i * 4 + 2] = Math.round(129 + (252 - 129) * t);
      dd[i * 4 + 3] = 255;
    }
    sfCtx.putImageData(sfImg, 0, 0);
  }

  function doStep() { if (model && !model.done) model.step(); updateStats(); }
  function stepsPerSec() { const t = (+speedRange.value - 1) / 99; return Math.round(2 + 90 * t * t); }
  function play() { if (model.done) rebuild(); playing = true; acc = 0; updatePlayBtn(); }
  function pause() { playing = false; updatePlayBtn(); }
  function togglePlay() { playing ? pause() : play(); }
  function updatePlayBtn() {
    playBtn.innerHTML = playing
      ? '<svg width="13" height="13" viewBox="0 0 12 12"><rect x="2" y="1.5" width="3" height="9" rx="1" fill="currentColor"/><rect x="7" y="1.5" width="3" height="9" rx="1" fill="currentColor"/></svg> Пауза'
      : '<svg width="13" height="13" viewBox="0 0 12 12"><path d="M3 1.5l7 4.5-7 4.5z" fill="currentColor"/></svg> Запуск';
  }
  function updateStats() {
    if (!model) return; const s = model.stats();
    $("statIter").textContent = s.iter;
    $("statLoss").textContent = s.loss.toFixed(3);
    $("statAcc").textContent = (s.acc * 100).toFixed(1) + "%";
    $("statNorm").textContent = s.wnorm.toFixed(2);
    progressBar.style.width = Math.min(100, (s.iter / model.maxIter) * 100) + "%";
    stepBtn.disabled = s.done;
  }

  // ---------- главная карта: вероятность + граница ----------
  function renderHeatmap() {
    const buf = hmImg.data;
    for (let gy = 0; gy < GRID; gy++) { const ny = (gy + 0.5) / GRID;
      for (let gx = 0; gx < GRID; gx++) { const nx = (gx + 0.5) / GRID;
        const p = model.proba(nx, ny), a = 0.42;
        const r = C0[0] + (C1[0] - C0[0]) * p, g = C0[1] + (C1[1] - C0[1]) * p, b = C0[2] + (C1[2] - C0[2]) * p;
        const idx = (gy * GRID + gx) * 4;
        buf[idx] = Math.round(r * a + 255 * (1 - a)); buf[idx + 1] = Math.round(g * a + 255 * (1 - a)); buf[idx + 2] = Math.round(b * a + 255 * (1 - a)); buf[idx + 3] = Math.round(255 * a);
      } }
    hmCtx.putImageData(hmImg, 0, 0);
    const p = plot(); ctx.imageSmoothingEnabled = true; ctx.drawImage(hm, p.ox, p.oy, p.size, p.size);
  }
  function renderBoundary() {
    const N = 120, p = plot(), cell = p.size / N, val = new Float64Array((N + 1) * (N + 1));
    for (let j = 0; j <= N; j++) { const ny = j / N; for (let i = 0; i <= N; i++) val[j * (N + 1) + i] = model.proba(i / N, ny) - 0.5; }
    ctx.save(); ctx.lineWidth = 2.4; ctx.strokeStyle = "#fff"; ctx.shadowColor = "rgba(20,23,28,.35)"; ctx.shadowBlur = 2; ctx.beginPath();
    const at = (i, j) => val[j * (N + 1) + i], lerp = (a, b) => a / (a - b);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const tl = at(i, j), tr = at(i + 1, j), br = at(i + 1, j + 1), bl = at(i, j + 1);
      let idx = 0; if (tl > 0) idx |= 8; if (tr > 0) idx |= 4; if (br > 0) idx |= 2; if (bl > 0) idx |= 1;
      if (idx === 0 || idx === 15) continue;
      const x0 = p.ox + i * cell, y0 = p.oy + j * cell;
      const top = () => ({ x: x0 + lerp(tl, tr) * cell, y: y0 }), right = () => ({ x: x0 + cell, y: y0 + lerp(tr, br) * cell }), bottom = () => ({ x: x0 + lerp(bl, br) * cell, y: y0 + cell }), left = () => ({ x: x0, y: y0 + lerp(tl, bl) * cell });
      const seg = (a, b) => { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); };
      switch (idx) { case 1: case 14: seg(left(), bottom()); break; case 2: case 13: seg(bottom(), right()); break; case 3: case 12: seg(left(), right()); break; case 4: case 11: seg(top(), right()); break; case 6: case 9: seg(top(), bottom()); break; case 7: case 8: seg(left(), top()); break; case 5: seg(left(), top()); seg(bottom(), right()); break; case 10: seg(left(), bottom()); seg(top(), right()); break; }
    }
    ctx.stroke(); ctx.restore();
  }
  function render() {
    ctx.clearRect(0, 0, W, H);
    if (model) {
      renderHeatmap(); renderBoundary();
      for (let i = 0; i < X.length; i++) {
        const x = toX(X[i].x), yy = toY(X[i].y), yi = yv[i] > 0 ? 1 : 0, pred = model.proba(X[i].x, X[i].y) >= 0.5 ? 1 : 0;
        ctx.beginPath(); ctx.arc(x, yy, 3.8, 0, Math.PI * 2); ctx.fillStyle = yi === 1 ? COL1 : COL0; ctx.fill();
        ctx.lineWidth = 1; ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.stroke();
        if (pred !== yi) { ctx.beginPath(); ctx.arc(x, yy, 5.6, 0, Math.PI * 2); ctx.lineWidth = 1.8; ctx.strokeStyle = "#14171c"; ctx.stroke(); }
      }
    }
    renderSurface(); renderLoss();
  }

  // ---------- нижняя панель 1: поверхность лог-лосса + траектория спуска ----------
  function surfPlot() { const size = Math.min(PW, PH) - 14; return { size, ox: (PW - size) / 2, oy: (PH - size) / 2 }; }
  const wToX = (a) => { const s = surfPlot(); return s.ox + (a + R) / (2 * R) * s.size; };
  const wToY = (b) => { const s = surfPlot(); return s.oy + s.size - (b + R) / (2 * R) * s.size; };
  function renderSurface() {
    pctx.clearRect(0, 0, PW, PH);
    if (!model) return;
    const s = surfPlot();
    pctx.imageSmoothingEnabled = true; pctx.drawImage(sf, s.ox, s.oy, s.size, s.size);
    pctx.strokeStyle = "rgba(20,23,28,.12)"; pctx.lineWidth = 1; pctx.strokeRect(s.ox, s.oy, s.size, s.size);
    // оси w=0
    pctx.strokeStyle = "rgba(255,255,255,.45)"; pctx.lineWidth = 1; pctx.beginPath();
    pctx.moveTo(wToX(0), s.oy); pctx.lineTo(wToX(0), s.oy + s.size); pctx.moveTo(s.ox, wToY(0)); pctx.lineTo(s.ox + s.size, wToY(0)); pctx.stroke();
    // траектория весов — тёмная обводка + белая линия (видна на любом фоне)
    const wh = model.wHist;
    if (wh.length > 1) {
      const path = () => { pctx.beginPath(); for (let i = 0; i < wh.length; i++) { const x = wToX(wh[i][0]), y = wToY(wh[i][1]); i === 0 ? pctx.moveTo(x, y) : pctx.lineTo(x, y); } pctx.stroke(); };
      pctx.lineJoin = "round"; pctx.strokeStyle = "rgba(20,23,28,.55)"; pctx.lineWidth = 3.5; path();
      pctx.strokeStyle = "#fff"; pctx.lineWidth = 1.6; path();
    }
    // минимум ✕
    const mx = wToX(wStar[0]), my = wToY(wStar[1]);
    pctx.strokeStyle = "#fff"; pctx.lineWidth = 2.4; pctx.beginPath();
    pctx.moveTo(mx - 6, my - 6); pctx.lineTo(mx + 6, my + 6); pctx.moveTo(mx + 6, my - 6); pctx.lineTo(mx - 6, my + 6); pctx.stroke();
    // старт (0,0)
    pctx.beginPath(); pctx.arc(wToX(0), wToY(0), 3, 0, Math.PI * 2); pctx.fillStyle = "rgba(255,255,255,.7)"; pctx.fill();
    // текущая точка
    const cx = wToX(model.w[0]), cy = wToY(model.w[1]);
    pctx.beginPath(); pctx.arc(cx, cy, 5, 0, Math.PI * 2); pctx.fillStyle = "#fde047"; pctx.fill(); pctx.lineWidth = 1.8; pctx.strokeStyle = "#14171c"; pctx.stroke();
    // подписи осей
    pctx.fillStyle = "rgba(20,23,28,.5)"; pctx.font = "10px -apple-system, sans-serif"; pctx.textAlign = "right"; pctx.textBaseline = "bottom";
    pctx.fillText("w₁", s.ox + s.size - 2, s.oy + s.size - 2);
    pctx.textAlign = "left"; pctx.textBaseline = "top"; pctx.fillText("w₂", s.ox + 3, s.oy + 2);
  }

  // ---------- нижняя панель 2: лог-лосс по итерациям ----------
  function renderLoss() {
    lctx.clearRect(0, 0, LW, LH);
    const padL = 30, padR = 12, padT = 14, padB = 18, x0 = padL, x1 = LW - padR, y0 = padT, y1 = LH - padB;
    if (!model || model.history.length < 1) return;
    const hist = model.history, last = hist.length - 1;
    let maxL = 1e-6; for (let i = 0; i < hist.length; i++) if (hist[i] > maxL) maxL = hist[i];
    const denom = Math.max(1, last), iToX = (i) => x0 + (i / denom) * (x1 - x0), lToY = (l) => y1 - (l / maxL) * (y1 - y0);
    lctx.strokeStyle = "rgba(20,23,28,.12)"; lctx.lineWidth = 1; lctx.beginPath(); lctx.moveTo(x0, y0); lctx.lineTo(x0, y1); lctx.lineTo(x1, y1); lctx.stroke();
    lctx.strokeStyle = "#10b981"; lctx.lineWidth = 2.2; lctx.beginPath();
    for (let i = 0; i < hist.length; i++) { const px = iToX(i), py = lToY(hist[i]); i === 0 ? lctx.moveTo(px, py) : lctx.lineTo(px, py); }
    lctx.stroke();
    const cx = iToX(last), cy = lToY(hist[last]);
    lctx.beginPath(); lctx.arc(cx, cy, 3.5, 0, Math.PI * 2); lctx.fillStyle = "#10b981"; lctx.fill(); lctx.strokeStyle = "#fff"; lctx.lineWidth = 1.5; lctx.stroke();
    lctx.fillStyle = "rgba(20,23,28,.5)"; lctx.font = "10px -apple-system, sans-serif"; lctx.textAlign = "left";
    lctx.fillText(maxL.toFixed(2), 4, y0 + 4); lctx.fillText("0", 4, y1 + 2);
    lctx.textAlign = "center"; lctx.fillText("итерации →", (x0 + x1) / 2, LH - 4);
    lctx.textAlign = "right"; lctx.fillStyle = "rgba(16,185,129,.95)"; lctx.fillText("L=" + hist[last].toFixed(3), x1, y0 + 4);
    lctx.textAlign = "left";
  }

  function loop(t) {
    requestAnimationFrame(loop);
    if (!lastT) lastT = t; const dt = t - lastT; lastT = t;
    if (playing && model && !model.done) {
      acc += dt; const interval = 1000 / stepsPerSec(); let guard = 0;
      while (acc >= interval && !model.done && guard < 60) { model.step(); acc -= interval; guard++; }
      updateStats(); if (model.done) pause();
    }
    render();
  }
  function syncLabels() { lrVal.textContent = (+lrRange.value).toFixed(2); lambdaVal.textContent = (+lambdaRange.value).toFixed(2); speedVal.textContent = speedRange.value; }

  datasetSel.addEventListener("change", regenData);
  lrRange.addEventListener("input", () => { syncLabels(); rebuild(); });
  lambdaRange.addEventListener("input", () => { syncLabels(); rebuild(); });
  speedRange.addEventListener("input", syncLabels);
  playBtn.addEventListener("click", togglePlay);
  stepBtn.addEventListener("click", () => { pause(); doStep(); });
  resetBtn.addEventListener("click", rebuild);
  regenBtn.addEventListener("click", () => { seed = (seed * 1103515245 + 12345) >>> 0; regenData(); });
  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "SELECT" || e.target.tagName === "INPUT") return;
    if (e.code === "Space") { e.preventDefault(); togglePlay(); }
    else if (e.code === "ArrowRight") { pause(); doStep(); }
    else if (e.key === "r" || e.key === "R" || e.key === "к" || e.key === "К") rebuild();
    else if (e.key === "n" || e.key === "N" || e.key === "т" || e.key === "Т") { seed = (seed * 1103515245 + 12345) >>> 0; regenData(); }
  });
  window.addEventListener("resize", resize);

  syncLabels(); resize(); regenData(); requestAnimationFrame(loop);
})();
