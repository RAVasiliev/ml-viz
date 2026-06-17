/* UI и отрисовка AdaBoost (2D-классификация).
   Главный холст: граница ансамбля H(x) + обучающие точки размером по весу + тест-кольца.
   Панель слева: текущий пень (прямой разрез + полуплоскости) с теми же весами.
   Панель справа: train/test-ошибка по числу пней. Логика — adaboost.js. */
(function () {
  "use strict";

  const CLS_RGB = [[239, 68, 68], [79, 70, 229]];   // 0 — красный (■), 1 — индиго (●)
  const CLS_HEX = ["#ef4444", "#4f46e5"];
  const C_TEST = "#ea8a1e", BG = [245, 247, 250];
  const FONT = "-apple-system, system-ui, sans-serif";

  const $ = (id) => document.getElementById(id);
  const canvas = $("canvas"), ctx = canvas.getContext("2d");
  const stumpCv = $("stump"), pctx = stumpCv.getContext("2d");
  const errCv = $("err"), ectx = errCv.getContext("2d");

  const datasetSel = $("dataset");
  const pointsRange = $("points"), pointsVal = $("pointsVal");
  const nestRange = $("nest"), nestVal = $("nestVal");
  const speedRange = $("speed"), speedVal = $("speedVal");
  const playBtn = $("play"), stepBtn = $("step"), resetBtn = $("reset"), regenBtn = $("regen");
  const progressBar = $("progressBar"), stumpNo = $("stumpNo");

  const G = 64;
  const grid = document.createElement("canvas"); grid.width = G; grid.height = G;
  const gctx = grid.getContext("2d");
  const gimg = gctx.createImageData(G, G);

  let X = [], y = [], yLab = [], Xt = [], ytLab = [];
  let model = null, playing = false, accT = 0, lastT = 0, seed = 5;
  let W = 0, H = 0, SW = 0, SH = 0, EW = 0, EH = 0;
  const PAD = 14;

  // только 2-классовые, где осевые пни осмысленны (XOR симметричен для одиночного пня → бустинг стопорится)
  window.LabeledDatasets.list.filter((d) => d.id !== "blobs3" && d.id !== "xor").forEach((d) => {
    const o = document.createElement("option"); o.value = d.id; o.textContent = d.name; datasetSel.appendChild(o);
  });
  datasetSel.value = "moons";

  function plot(w, h) { const size = Math.min(w, h) - 2 * PAD; return { size, ox: (w - size) / 2, oy: (h - size) / 2 }; }
  function sizeCanvas(cv, c) {
    const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    c.setTransform(dpr, 0, 0, dpr, 0, 0); return { w: r.width, h: r.height };
  }
  function resize() {
    let a = sizeCanvas(canvas, ctx); W = a.w; H = a.h;
    a = sizeCanvas(stumpCv, pctx); SW = a.w; SH = a.h;
    a = sizeCanvas(errCv, ectx); EW = a.w; EH = a.h;
    render();
  }

  function regenData() {
    const n = +pointsRange.value;
    const ds = window.LabeledDatasets.generate(datasetSel.value, n, seed);
    X = ds.points; yLab = ds.labels; y = yLab.map((l) => (l === 1 ? 1 : -1));
    const nTest = Math.max(20, Math.round(n * 0.45));
    const dt = window.LabeledDatasets.generate(datasetSel.value, nTest, (seed ^ 0x9e3779b9) >>> 0);
    Xt = dt.points; ytLab = dt.labels;
    rebuild();
  }
  function rebuild() {
    model = new window.AdaBoost.AdaBoost(X, y, {
      Xt: Xt, yt: ytLab.map((l) => (l === 1 ? 1 : -1)),
      target: +nestRange.value, grid: G, seed: seed,
    });
    refreshGrid(); pause(); updateStats(); render();
  }

  const lerp = (a, b, t) => Math.round(a + (b - a) * t);
  function refreshGrid() {
    const d = gimg.data;
    for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
      const o = (gy * G + gx) * 4;
      if (!model.stumps.length) { d[o] = BG[0]; d[o + 1] = BG[1]; d[o + 2] = BG[2]; d[o + 3] = 255; continue; }
      const c = model.cell(gx, gy), col = CLS_RGB[c.cls];
      const a = 0.12 + 0.62 * c.conf;
      d[o] = lerp(BG[0], col[0], a); d[o + 1] = lerp(BG[1], col[1], a); d[o + 2] = lerp(BG[2], col[2], a); d[o + 3] = 255;
    }
    gctx.putImageData(gimg, 0, 0);
  }

  function doStep() { if (!model.done) { model.step(); refreshGrid(); } updateStats(); }
  function stepsPerSec() { const t = (+speedRange.value - 1) / 99; return Math.round(1 + 16 * t * t); }
  function play() { if (model.done) rebuild(); playing = true; accT = 0; updatePlayBtn(); }
  function pause() { playing = false; updatePlayBtn(); }
  function togglePlay() { playing ? pause() : play(); }
  function updatePlayBtn() {
    playBtn.innerHTML = playing
      ? '<svg width="13" height="13" viewBox="0 0 12 12"><rect x="2" y="1.5" width="3" height="9" rx="1" fill="currentColor"/><rect x="7" y="1.5" width="3" height="9" rx="1" fill="currentColor"/></svg> Пауза'
      : '<svg width="13" height="13" viewBox="0 0 12 12"><path d="M3 1.5l7 4.5-7 4.5z" fill="currentColor"/></svg> Запуск';
  }

  const pct = (v) => (isFinite(v) ? (v * 100).toFixed(1) + "%" : "—");
  function updateStats() {
    const s = model.stats();
    $("statStumps").textContent = s.nStumps + " / " + s.target;
    $("statAlpha").textContent = isFinite(s.lastAlpha) ? s.lastAlpha.toFixed(2) : "—";
    $("statErrTr").textContent = pct(s.errTrain);
    $("statErrTe").textContent = pct(s.errTest);
    stumpNo.textContent = s.nStumps ? "#" + s.nStumps : "—";
    progressBar.style.width = (s.target ? (s.nStumps / s.target) * 100 : 0) + "%";
    stepBtn.disabled = s.done;
    updateNote(s);
  }
  function updateNote(s) {
    const note = $("note");
    if (!s.nStumps) {
      note.innerHTML = `Все объекты пока с <b>равными весами</b>. Жми <b>«Пень ⏭»</b>: первый пень разрежет плоскость одной прямой, ошибётся на части точек — и они <b>потяжелеют</b> к следующему шагу.`;
      return;
    }
    const th = model.errTestHist; let bestK = 0, bestV = Infinity;
    for (let k = 0; k < th.length; k++) if (isFinite(th[k]) && th[k] < bestV) { bestV = th[k]; bestK = k; }
    let txt = `Пней: <b>${s.nStumps}</b>. Последний имел ошибку <b>${pct(s.lastErr)}</b> → вес <b>α = ${s.lastAlpha.toFixed(2)}</b>. <b style="color:#4f46e5">train-ошибка ${pct(s.errTrain)}</b>, <b style="color:#ea8a1e">test-ошибка ${pct(s.errTest)}</b>. `;
    if (s.errTrain < 1e-9) txt += `Train-ошибка уже <b>0</b> — ансамбль идеально разделил обучающую выборку из грубых пней. `;
    if (s.nStumps > bestK + 2 && s.errTest > bestV + 0.02) {
      txt += `<b>Переобучение</b>: тест уже растёт, лучшее было ≈<b>${bestK}</b> пней (early stopping).`;
    } else {
      txt += `Тяжёлые точки заставляют новые пни заниматься трудными местами.`;
    }
    note.innerHTML = txt;
  }

  // ---- точки ----
  function ptRadius(wi) { const base = W > 360 ? 3.2 : 2.2; let r = base * Math.sqrt(Math.max(wi * X.length, 0.16)); return Math.max(2, Math.min(base * 3.1, r)); }
  function drawTrain(c, w, h, weighted) {
    const p = plot(w, h);
    for (let i = 0; i < X.length; i++) {
      const cx = p.ox + X[i].x * p.size, cy = p.oy + X[i].y * p.size;
      const r = weighted ? ptRadius(model.w[i]) : (w > 360 ? 3 : 2);
      c.fillStyle = CLS_HEX[yLab[i]];
      if (yLab[i] === 1) { c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill(); }
      else c.fillRect(cx - r, cy - r, 2 * r, 2 * r);
      if (w > 360) { c.lineWidth = 1; c.strokeStyle = "rgba(255,255,255,.7)"; if (yLab[i] === 1) { c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke(); } else c.strokeRect(cx - r, cy - r, 2 * r, 2 * r); }
    }
  }
  function drawTest(c, w, h) {
    const p = plot(w, h), rr = w > 360 ? 3 : 2.2;
    c.lineWidth = 1.6;
    for (let i = 0; i < Xt.length; i++) {
      const cx = p.ox + Xt[i].x * p.size, cy = p.oy + Xt[i].y * p.size;
      c.strokeStyle = CLS_HEX[ytLab[i]]; c.fillStyle = "#fff"; c.globalAlpha = 0.92;
      if (ytLab[i] === 1) { c.beginPath(); c.arc(cx, cy, rr, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1; c.stroke(); }
      else { c.fillRect(cx - rr, cy - rr, 2 * rr, 2 * rr); c.globalAlpha = 1; c.strokeRect(cx - rr, cy - rr, 2 * rr, 2 * rr); }
    }
    c.globalAlpha = 1;
  }

  // ---- панель текущего пня ----
  function drawStumpPanel() {
    pctx.clearRect(0, 0, SW, SH);
    const s = model && model.lastStump;
    if (!s) {
      pctx.fillStyle = "#8a93a3"; pctx.font = "13px " + FONT; pctx.textAlign = "center"; pctx.textBaseline = "middle";
      pctx.fillText("Пня ещё нет — жми «Пень ⏭»", SW / 2, SH / 2); return;
    }
    const p = plot(SW, SH);
    const tintRect = (x, yy, ww, hh, cls) => { const col = CLS_RGB[cls]; pctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},0.16)`; pctx.fillRect(x, yy, ww, hh); };
    if (s.feat === 0) {
      const xs = p.ox + Math.max(0, Math.min(1, s.thr)) * p.size;
      tintRect(p.ox, p.oy, xs - p.ox, p.size, model.stumpClass(s.thr - 0.01, 0.5));
      tintRect(xs, p.oy, p.ox + p.size - xs, p.size, model.stumpClass(s.thr + 0.01, 0.5));
      pctx.strokeStyle = "#14171c"; pctx.lineWidth = 2; pctx.beginPath(); pctx.moveTo(xs, p.oy); pctx.lineTo(xs, p.oy + p.size); pctx.stroke();
    } else {
      const ys = p.oy + Math.max(0, Math.min(1, s.thr)) * p.size;
      tintRect(p.ox, p.oy, p.size, ys - p.oy, model.stumpClass(0.5, s.thr - 0.01));
      tintRect(p.ox, ys, p.size, p.oy + p.size - ys, model.stumpClass(0.5, s.thr + 0.01));
      pctx.strokeStyle = "#14171c"; pctx.lineWidth = 2; pctx.beginPath(); pctx.moveTo(p.ox, ys); pctx.lineTo(p.ox + p.size, ys); pctx.stroke();
    }
    drawTrain(pctx, SW, SH, true);
  }

  // ---- панель ошибки train/test ----
  function drawErr() {
    ectx.clearRect(0, 0, EW, EH);
    if (!model) return;
    const ht = model.errTrainHist, hte = model.errTestHist, target = model.target;
    const PADL = 44, PADR = 12, PADT = 22, PADB = 24;
    let hi = 0.05;
    for (const v of ht) if (isFinite(v)) hi = Math.max(hi, v);
    for (const v of hte) if (isFinite(v)) hi = Math.max(hi, v);
    hi = Math.min(1, hi * 1.15);
    const mxX = (k) => PADL + (target > 0 ? k / target : 0) * (EW - PADL - PADR);
    const myY = (v) => { const d = hi || 1; return PADT + (1 - v / d) * (EH - PADT - PADB); };

    ectx.font = "10px " + FONT; ectx.textBaseline = "middle"; ectx.textAlign = "right";
    ectx.strokeStyle = "rgba(20,23,28,.06)"; ectx.lineWidth = 1;
    const stepY = niceStep(hi);
    for (let v = 0; v <= hi + 1e-9; v += stepY) {
      const yv = myY(v); ectx.beginPath(); ectx.moveTo(PADL, yv); ectx.lineTo(EW - PADR, yv); ectx.stroke();
      ectx.fillStyle = "#8a93a3"; ectx.fillText(Math.round(v * 100) + "%", PADL - 6, yv);
    }
    ectx.textAlign = "center"; ectx.textBaseline = "bottom"; ectx.fillStyle = "#8a93a3";
    ectx.fillText("число пней →", PADL + (EW - PADL - PADR) / 2, EH - 4);

    // минимум теста
    let bestK = 0, bestV = Infinity;
    for (let k = 0; k < hte.length; k++) if (isFinite(hte[k]) && hte[k] < bestV) { bestV = hte[k]; bestK = k; }
    if (hte.length > 2 && bestK < hte.length - 1) {
      const Xx = mxX(bestK);
      ectx.strokeStyle = "rgba(234,138,30,.5)"; ectx.lineWidth = 1; ectx.setLineDash([3, 3]);
      ectx.beginPath(); ectx.moveTo(Xx, PADT); ectx.lineTo(Xx, EH - PADB); ectx.stroke(); ectx.setLineDash([]);
      ectx.fillStyle = C_TEST; ectx.font = "600 9.5px " + FONT; ectx.textAlign = "center"; ectx.textBaseline = "top";
      ectx.fillText("min тест", Xx, PADT + 1);
    }

    const curve = (h, color) => {
      ectx.strokeStyle = color; ectx.lineWidth = 2.2; ectx.lineJoin = "round"; ectx.beginPath();
      let started = false;
      for (let k = 0; k < h.length; k++) { const v = h[k]; if (!isFinite(v)) { started = false; continue; } const Xx = mxX(k), Yy = myY(v); started ? ectx.lineTo(Xx, Yy) : ectx.moveTo(Xx, Yy); started = true; }
      ectx.stroke();
      const last = h.length - 1; if (isFinite(h[last])) { ectx.beginPath(); ectx.arc(mxX(last), myY(h[last]), 3, 0, Math.PI * 2); ectx.fillStyle = color; ectx.fill(); ectx.lineWidth = 1.5; ectx.strokeStyle = "#fff"; ectx.stroke(); }
    };
    curve(hte, C_TEST); curve(ht, CLS_HEX[1]);

    ectx.textBaseline = "top"; ectx.textAlign = "left"; ectx.font = "600 11px " + FONT;
    ectx.fillStyle = CLS_HEX[1]; ectx.fillText("train", PADL + 2, 4);
    ectx.fillStyle = C_TEST; ectx.fillText("test", PADL + 46, 4);
  }
  function niceStep(range) {
    if (!(range > 0)) return 0.1;
    const raw = range / 4, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / mag; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    if (model) {
      const p = plot(W, H);
      ctx.imageSmoothingEnabled = true;
      if (model.stumps.length) ctx.drawImage(grid, p.ox, p.oy, p.size, p.size);
      drawTest(ctx, W, H);
      drawTrain(ctx, W, H, true);
    }
    drawStumpPanel();
    drawErr();
  }

  function loop(t) {
    requestAnimationFrame(loop);
    if (!lastT) lastT = t;
    const dt = t - lastT; lastT = t;
    if (playing && model && !model.done) {
      accT += dt; const interval = 1000 / stepsPerSec(); let guard = 0;
      while (accT >= interval && !model.done && guard < 20) { model.step(); accT -= interval; guard++; }
      refreshGrid(); updateStats(); if (model.done) pause();
    }
    render();
  }

  function syncLabels() {
    pointsVal.textContent = pointsRange.value;
    nestVal.textContent = nestRange.value;
    speedVal.textContent = speedRange.value;
  }

  datasetSel.addEventListener("change", regenData);
  pointsRange.addEventListener("input", () => { syncLabels(); regenData(); });
  nestRange.addEventListener("input", () => { syncLabels(); rebuild(); });
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
