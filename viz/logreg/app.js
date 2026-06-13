/* UI и отрисовка логистической регрессии: heatmap вероятности p(x),
   контур границы p=0.5, точки по истинному классу + под-панели
   (сигмоида и падающий лог-лосс). Один шаг = одна итерация градиентного
   спуска по всей выборке. */
(function () {
  "use strict";

  // класс 0 — синий (#4f46e5), класс 1 — красный (#ef4444)
  const C0 = [79, 70, 229];
  const C1 = [239, 68, 68];
  const COL0 = "#4f46e5", COL1 = "#ef4444";

  const $ = (id) => document.getElementById(id);
  const canvas = $("canvas"), ctx = canvas.getContext("2d");
  const sigCv = $("sigCv"), sctx = sigCv.getContext("2d");
  const lossCv = $("lossCv"), lctx = lossCv.getContext("2d");

  const datasetSel = $("dataset");
  const phiSel = $("phi");
  const lrRange = $("lr"), lrVal = $("lrVal");
  const lambdaRange = $("lambda"), lambdaVal = $("lambdaVal");
  const speedRange = $("speed"), speedVal = $("speedVal");
  const playBtn = $("play"), stepBtn = $("step"), resetBtn = $("reset"), regenBtn = $("regen");
  const progressBar = $("progressBar");

  let data = null, X = [], yv = [];
  let model = null;
  let playing = false, acc = 0, lastT = 0, seed = 7;
  let W = 0, H = 0, SW = 0, SH = 0, LW = 0, LH = 0;
  const PAD = 16;

  // offscreen-буфер для heatmap (низкое разрешение, потом масштабируем)
  const GRID = 96;
  const hmCanvas = document.createElement("canvas");
  hmCanvas.width = GRID; hmCanvas.height = GRID;
  const hmCtx = hmCanvas.getContext("2d");
  const hmImg = hmCtx.createImageData(GRID, GRID);

  window.LabeledDatasets.list.forEach((d) => {
    const o = document.createElement("option"); o.value = d.id; o.textContent = d.name; datasetSel.appendChild(o);
  });
  datasetSel.value = "moons";

  function plot() { const size = Math.min(W, H) - 2 * PAD; return { size, ox: (W - size) / 2, oy: (H - size) / 2 }; }
  const toX = (nx) => { const p = plot(); return p.ox + nx * p.size; };
  const toY = (ny) => { const p = plot(); return p.oy + ny * p.size; };

  function sizeCanvas(cv, c) {
    const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    c.setTransform(dpr, 0, 0, dpr, 0, 0); return { w: r.width, h: r.height };
  }
  function resize() {
    const a = sizeCanvas(canvas, ctx); W = a.w; H = a.h;
    const b = sizeCanvas(sigCv, sctx); SW = b.w; SH = b.h;
    const d = sizeCanvas(lossCv, lctx); LW = d.w; LH = d.h;
    render();
  }

  function regenData() {
    data = window.LabeledDatasets.generate(datasetSel.value, 240, seed);
    X = data.points; yv = data.labels;
    rebuild();
  }
  function rebuild() {
    model = new window.LogRegStepper(X, yv, {
      lr: +lrRange.value,
      lambda: +lambdaRange.value,
      degree: +phiSel.value,
      maxIter: 400,
    });
    pause(); updateStats(); render();
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

  function wNorm() {
    if (!model) return 0;
    let s = 0; for (let k = 0; k < model.w.length; k++) s += model.w[k] * model.w[k];
    return Math.sqrt(s);
  }

  function updateStats() {
    if (!model) return;
    const s = model.stats();
    $("statIter").textContent = s.iter;
    $("statLoss").textContent = s.loss.toFixed(3);
    $("statAcc").textContent = (s.acc * 100).toFixed(1) + "%";
    $("statNorm").textContent = wNorm().toFixed(2);
    progressBar.style.width = Math.min(100, (s.iter / model.maxIter) * 100) + "%";
    stepBtn.disabled = s.done;
  }

  // ---------- heatmap вероятности ----------
  function renderHeatmap() {
    if (!model) return;
    const buf = hmImg.data;
    for (let gy = 0; gy < GRID; gy++) {
      const ny = (gy + 0.5) / GRID;
      for (let gx = 0; gx < GRID; gx++) {
        const nx = (gx + 0.5) / GRID;
        const p = model.proba(nx, ny);             // вероятность класса 1
        // смешиваем синий(0) → красный(1); насыщенность мягкая
        const a = 0.42;                             // прозрачность заливки
        const r = Math.round(C0[0] + (C1[0] - C0[0]) * p);
        const g = Math.round(C0[1] + (C1[1] - C0[1]) * p);
        const b = Math.round(C0[2] + (C1[2] - C0[2]) * p);
        const idx = (gy * GRID + gx) * 4;
        // премультиплицируем на белый фон, чтобы цвета были мягче
        buf[idx]     = Math.round(r * a + 255 * (1 - a));
        buf[idx + 1] = Math.round(g * a + 255 * (1 - a));
        buf[idx + 2] = Math.round(b * a + 255 * (1 - a));
        buf[idx + 3] = Math.round(255 * a);
      }
    }
    hmCtx.putImageData(hmImg, 0, 0);
    const p = plot();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(hmCanvas, p.ox, p.oy, p.size, p.size);
  }

  // контур p=0.5 через marching squares по сетке вероятностей
  function renderBoundary() {
    if (!model) return;
    const N = 120;
    const p = plot();
    const cell = p.size / N;
    const val = new Float64Array((N + 1) * (N + 1));
    for (let j = 0; j <= N; j++) {
      const ny = j / N;
      for (let i = 0; i <= N; i++) {
        const nx = i / N;
        val[j * (N + 1) + i] = model.proba(nx, ny) - 0.5;
      }
    }
    ctx.save();
    ctx.lineWidth = 2.4; ctx.strokeStyle = "#ffffff";
    ctx.shadowColor = "rgba(20,23,28,.35)"; ctx.shadowBlur = 2;
    ctx.beginPath();
    const at = (i, j) => val[j * (N + 1) + i];
    const lerp = (a, b) => a / (a - b); // доля до пересечения нуля
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const tl = at(i, j), tr = at(i + 1, j), br = at(i + 1, j + 1), bl = at(i, j + 1);
        let idx = 0;
        if (tl > 0) idx |= 8; if (tr > 0) idx |= 4; if (br > 0) idx |= 2; if (bl > 0) idx |= 1;
        if (idx === 0 || idx === 15) continue;
        const x0 = p.ox + i * cell, y0 = p.oy + j * cell;
        // точки пересечения на рёбрах
        const top = () => ({ x: x0 + lerp(tl, tr) * cell, y: y0 });
        const right = () => ({ x: x0 + cell, y: y0 + lerp(tr, br) * cell });
        const bottom = () => ({ x: x0 + lerp(bl, br) * cell, y: y0 + cell });
        const left = () => ({ x: x0, y: y0 + lerp(tl, bl) * cell });
        const seg = (a, b) => { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); };
        switch (idx) {
          case 1: case 14: seg(left(), bottom()); break;
          case 2: case 13: seg(bottom(), right()); break;
          case 3: case 12: seg(left(), right()); break;
          case 4: case 11: seg(top(), right()); break;
          case 6: case 9:  seg(top(), bottom()); break;
          case 7: case 8:  seg(left(), top()); break;
          case 5: seg(left(), top()); seg(bottom(), right()); break;
          case 10: seg(left(), bottom()); seg(top(), right()); break;
        }
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    if (model) {
      renderHeatmap();
      renderBoundary();
      // точки по истинному классу; ошибочные обведены
      for (let i = 0; i < X.length; i++) {
        const x = toX(X[i].x), yy = toY(X[i].y);
        const yi = yv[i] > 0 ? 1 : 0;
        const pred = model.proba(X[i].x, X[i].y) >= 0.5 ? 1 : 0;
        ctx.beginPath(); ctx.arc(x, yy, 3.8, 0, Math.PI * 2);
        ctx.fillStyle = yi === 1 ? COL1 : COL0; ctx.fill();
        ctx.lineWidth = 1; ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.stroke();
        if (pred !== yi) {
          ctx.beginPath(); ctx.arc(x, yy, 5.6, 0, Math.PI * 2);
          ctx.lineWidth = 1.8; ctx.strokeStyle = "#14171c"; ctx.stroke();
        }
      }
    }
    renderSigmoid();
    renderLoss();
  }

  // ---------- под-панель 1: сигмоида σ(z) ----------
  function renderSigmoid() {
    sctx.clearRect(0, 0, SW, SH);
    const padL = 26, padR = 12, padT = 14, padB = 18;
    const x0 = padL, x1 = SW - padR, y0 = padT, y1 = SH - padB;
    const ZMAX = 6;
    const zToX = (z) => x0 + ((z + ZMAX) / (2 * ZMAX)) * (x1 - x0);
    const pToY = (p) => y1 - p * (y1 - y0);

    // оси / уровни 0, 0.5, 1
    sctx.strokeStyle = "rgba(20,23,28,.12)"; sctx.lineWidth = 1;
    sctx.beginPath();
    sctx.moveTo(x0, pToY(0)); sctx.lineTo(x1, pToY(0));
    sctx.moveTo(x0, pToY(1)); sctx.lineTo(x1, pToY(1));
    sctx.stroke();
    // линия p=0.5 и z=0 (пунктир)
    sctx.setLineDash([4, 4]); sctx.strokeStyle = "rgba(20,23,28,.22)";
    sctx.beginPath();
    sctx.moveTo(x0, pToY(0.5)); sctx.lineTo(x1, pToY(0.5));
    sctx.moveTo(zToX(0), y0); sctx.lineTo(zToX(0), y1);
    sctx.stroke(); sctx.setLineDash([]);

    // кривая сигмоиды
    const sigma = window.LogRegStepper.sigma;
    sctx.strokeStyle = "#4f46e5"; sctx.lineWidth = 2.2;
    sctx.beginPath();
    for (let i = 0; i <= 120; i++) {
      const z = -ZMAX + (2 * ZMAX) * (i / 120);
      const px = zToX(z), py = pToY(sigma(z));
      i === 0 ? sctx.moveTo(px, py) : sctx.lineTo(px, py);
    }
    sctx.stroke();

    // отметка: средний |z| обучающей выборки — «насколько уверенна модель»
    if (model && model.n > 0) {
      let zsum = 0;
      for (let i = 0; i < model.n; i++) zsum += Math.abs(model._z(model.Phi[i]));
      let zm = zsum / model.n;
      zm = Math.max(-ZMAX, Math.min(ZMAX, zm));
      const mx = zToX(zm), my = pToY(sigma(zm));
      sctx.beginPath(); sctx.arc(mx, my, 4, 0, Math.PI * 2);
      sctx.fillStyle = "#ef4444"; sctx.fill();
      sctx.strokeStyle = "#fff"; sctx.lineWidth = 1.5; sctx.stroke();
    }

    // подписи
    sctx.fillStyle = "rgba(20,23,28,.5)"; sctx.font = "10px -apple-system, sans-serif";
    sctx.textAlign = "left";
    sctx.fillText("1", 6, pToY(1) + 4);
    sctx.fillText("0.5", 2, pToY(0.5) + 4);
    sctx.fillText("0", 6, pToY(0) + 4);
    sctx.textAlign = "center";
    sctx.fillText("z = w·φ(x)+b", (x0 + x1) / 2, SH - 5);
    sctx.textAlign = "left";
  }

  // ---------- под-панель 2: лог-лосс по итерациям ----------
  function renderLoss() {
    lctx.clearRect(0, 0, LW, LH);
    const padL = 30, padR = 12, padT = 14, padB = 18;
    const x0 = padL, x1 = LW - padR, y0 = padT, y1 = LH - padB;

    if (!model || model.history.length < 1) return;
    const hist = model.history;
    const last = hist.length - 1;
    let maxL = 1e-6;
    for (let i = 0; i < hist.length; i++) if (hist[i] > maxL) maxL = hist[i];
    const denom = Math.max(1, last);
    const iToX = (i) => x0 + (i / denom) * (x1 - x0);
    const lToY = (l) => y1 - (l / maxL) * (y1 - y0);

    // оси
    lctx.strokeStyle = "rgba(20,23,28,.12)"; lctx.lineWidth = 1;
    lctx.beginPath();
    lctx.moveTo(x0, y0); lctx.lineTo(x0, y1); lctx.lineTo(x1, y1);
    lctx.stroke();

    // кривая лог-лосса
    lctx.strokeStyle = "#10b981"; lctx.lineWidth = 2.2;
    lctx.beginPath();
    for (let i = 0; i < hist.length; i++) {
      const px = iToX(i), py = lToY(hist[i]);
      i === 0 ? lctx.moveTo(px, py) : lctx.lineTo(px, py);
    }
    lctx.stroke();

    // текущая точка
    const cx = iToX(last), cy = lToY(hist[last]);
    lctx.beginPath(); lctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
    lctx.fillStyle = "#10b981"; lctx.fill();
    lctx.strokeStyle = "#fff"; lctx.lineWidth = 1.5; lctx.stroke();

    // подписи
    lctx.fillStyle = "rgba(20,23,28,.5)"; lctx.font = "10px -apple-system, sans-serif";
    lctx.textAlign = "left";
    lctx.fillText(maxL.toFixed(2), 4, y0 + 4);
    lctx.fillText("0", 4, y1 + 2);
    lctx.textAlign = "center";
    lctx.fillText("итерации →", (x0 + x1) / 2, LH - 4);
    lctx.textAlign = "right";
    lctx.fillStyle = "rgba(16,185,129,.95)";
    lctx.fillText("L=" + hist[last].toFixed(3), x1, y0 + 4);
    lctx.textAlign = "left";
  }

  function loop(t) {
    requestAnimationFrame(loop);
    if (!lastT) lastT = t;
    const dt = t - lastT; lastT = t;
    if (playing && model && !model.done) {
      acc += dt; const interval = 1000 / stepsPerSec(); let guard = 0;
      while (acc >= interval && !model.done && guard < 60) { model.step(); acc -= interval; guard++; }
      updateStats(); if (model.done) pause();
    }
    render();
  }

  function syncLabels() {
    lrVal.textContent = (+lrRange.value).toFixed(2);
    lambdaVal.textContent = (+lambdaRange.value).toFixed(2);
    speedVal.textContent = speedRange.value;
  }

  datasetSel.addEventListener("change", regenData);
  phiSel.addEventListener("change", rebuild);
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
