/* UI и отрисовка ядерного SVM (Pegasos):
   heatmap решающей функции f(x), контуры f=0 (граница) и f=±1 (полоса),
   обводка опорных векторов, точки по истинному классу. */
(function () {
  "use strict";

  const NEG = "#4f46e5";   // класс −1
  const POS = "#ef4444";   // класс +1
  const $ = (id) => document.getElementById(id);
  const canvas = $("canvas"), ctx = canvas.getContext("2d");

  const datasetSel = $("dataset");
  const pointsRange = $("points"), pointsVal = $("pointsVal");
  const kernelSel = $("kernel");
  const gammaCtl = $("gammaCtl"), gammaRange = $("gamma"), gammaVal = $("gammaVal");
  const cRange = $("cparam"), cVal = $("cVal");
  const speedRange = $("speed"), speedVal = $("speedVal");
  const playBtn = $("play"), stepBtn = $("step"), resetBtn = $("reset"), regenBtn = $("regen");
  const progressBar = $("progressBar");
  const datasetHint = $("datasetHint");

  // только двухклассовые датасеты
  const ALLOWED = ["moons", "circles", "xor"];
  const HINTS = {
    moons: "Две луны — почти линейно разделимы.",
    circles: "Кольца: linear не разделит, RBF — да (покрути γ).",
    xor: "XOR: классическая нелинейность для ядра.",
  };

  let data = null, X = [], yv = [], svm = null;
  let playing = false, accT = 0, lastT = 0, seed = 7;
  let W = 0, H = 0;
  const PAD = 16;
  const GRID = 90;                  // разрешение сетки heatmap/контуров
  let field = null;                 // Float32Array GRID×GRID значений f
  let fieldDirty = true;

  // C из логарифмического ползунка: 10^value ∈ [0.01 .. 100]
  function curC() { return Math.pow(10, +cRange.value); }
  function fmtC(c) { return c >= 10 ? c.toFixed(0) : c >= 1 ? c.toFixed(1) : c.toFixed(2); }

  window.LabeledDatasets.list
    .filter((d) => ALLOWED.includes(d.id))
    .forEach((d) => {
      const o = document.createElement("option");
      o.value = d.id; o.textContent = d.name; datasetSel.appendChild(o);
    });
  datasetSel.value = "circles";

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
    render();
  }

  function regenData() {
    data = window.LabeledDatasets.generate(datasetSel.value, +pointsRange.value, seed);
    X = data.points; yv = data.labels;
    rebuild();
  }

  function rebuild() {
    svm = new window.KernelSVM(X, yv, {
      kernel: kernelSel.value,
      gamma: +gammaRange.value,
      C: curC(),
      seed: (seed ^ 0x9e3779b9) >>> 0,
      maxEpochs: 60,
    });
    pause();
    fieldDirty = true;
    updateStats();
    render();
  }

  function doStep() { if (!svm.done) svm.step(); fieldDirty = true; updateStats(); }
  function stepsPerSec() { const t = (+speedRange.value - 1) / 99; return Math.round(1 + 18 * t * t); }

  function play() { if (svm.done) rebuild(); playing = true; accT = 0; updatePlayBtn(); }
  function pause() { playing = false; updatePlayBtn(); }
  function togglePlay() { playing ? pause() : play(); }
  function updatePlayBtn() {
    playBtn.innerHTML = playing
      ? '<svg width="13" height="13" viewBox="0 0 12 12"><rect x="2" y="1.5" width="3" height="9" rx="1" fill="currentColor"/><rect x="7" y="1.5" width="3" height="9" rx="1" fill="currentColor"/></svg> Пауза'
      : '<svg width="13" height="13" viewBox="0 0 12 12"><path d="M3 1.5l7 4.5-7 4.5z" fill="currentColor"/></svg> Запуск';
  }

  function updateStats() {
    const s = svm.stats();
    $("statAcc").textContent = (s.acc * 100).toFixed(1) + "%";
    $("statSV").textContent = s.sv;
    $("statEpoch").textContent = s.epoch;
    $("statMargin").textContent =
      s.marginWidth == null ? "—" : s.marginWidth.toFixed(3);
    progressBar.style.width = Math.min(100, (s.epoch / 60) * 100) + "%";
    stepBtn.disabled = s.done;
  }

  // ---------- Поле f(x): пересчёт сетки ----------
  function computeField() {
    if (!field) field = new Float32Array(GRID * GRID);
    for (let gy = 0; gy < GRID; gy++) {
      const ny = gy / (GRID - 1);
      for (let gx = 0; gx < GRID; gx++) {
        const nx = gx / (GRID - 1);
        field[gy * GRID + gx] = svm.f(nx, ny);
      }
    }
    fieldDirty = false;
  }

  // насыщенность фона растёт с |f|, насыщаясь к |f|=1.5
  function bgColor(f) {
    const a = Math.min(1, Math.abs(f) / 1.5);
    const col = f >= 0 ? POS : NEG;
    return hexA(col, 0.05 + 0.20 * a);
  }
  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  // ---------- Контуры (marching squares) для уровня level ----------
  function contour(level) {
    const segs = [];
    const at = (gx, gy) => field[gy * GRID + gx] - level;
    const interp = (x1, y1, v1, x2, y2, v2) => {
      const t = v1 / (v1 - v2);
      return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
    };
    for (let gy = 0; gy < GRID - 1; gy++) {
      for (let gx = 0; gx < GRID - 1; gx++) {
        const x0 = gx / (GRID - 1), x1 = (gx + 1) / (GRID - 1);
        const y0 = gy / (GRID - 1), y1 = (gy + 1) / (GRID - 1);
        const a = at(gx, gy), b = at(gx + 1, gy), c = at(gx + 1, gy + 1), d = at(gx, gy + 1);
        let idx = 0;
        if (a > 0) idx |= 1;
        if (b > 0) idx |= 2;
        if (c > 0) idx |= 4;
        if (d > 0) idx |= 8;
        if (idx === 0 || idx === 15) continue;
        const top = () => interp(x0, y0, a, x1, y0, b);
        const right = () => interp(x1, y0, b, x1, y1, c);
        const bot = () => interp(x1, y1, c, x0, y1, d);
        const left = () => interp(x0, y1, d, x0, y0, a);
        const push = (p, q) => segs.push([p, q]);
        switch (idx) {
          case 1: case 14: push(left(), top()); break;
          case 2: case 13: push(top(), right()); break;
          case 3: case 12: push(left(), right()); break;
          case 4: case 11: push(right(), bot()); break;
          case 6: case 9: push(top(), bot()); break;
          case 7: case 8: push(left(), bot()); break;
          case 5: push(left(), top()); push(right(), bot()); break;
          case 10: push(top(), right()); push(left(), bot()); break;
        }
      }
    }
    return segs;
  }

  function drawContour(level, dash, width, color) {
    const segs = contour(level);
    if (!segs.length) return;
    ctx.save();
    ctx.setLineDash(dash);
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.lineCap = "round";
    ctx.beginPath();
    for (const [p, q] of segs) {
      ctx.moveTo(toX(p[0]), toY(p[1]));
      ctx.lineTo(toX(q[0]), toY(q[1]));
    }
    ctx.stroke();
    ctx.restore();
  }

  // ---------- Рендер ----------
  function render() {
    ctx.clearRect(0, 0, W, H);
    if (!svm) return;
    if (fieldDirty) computeField();

    const p = plot();
    // heatmap по ячейкам сетки (cell-центрированный, заполняет квадрат)
    const cw = p.size / GRID, ch = p.size / GRID;
    for (let gy = 0; gy < GRID; gy++) {
      for (let gx = 0; gx < GRID; gx++) {
        ctx.fillStyle = bgColor(field[gy * GRID + gx]);
        ctx.fillRect(p.ox + gx * cw, p.oy + gy * ch, cw + 1, ch + 1);
      }
    }

    if (svm.t > 0) {
      // полоса f=±1 (пунктир) и граница f=0 (сплошная)
      drawContour(1, [5, 4], 1.4, "rgba(20,23,28,.45)");
      drawContour(-1, [5, 4], 1.4, "rgba(20,23,28,.45)");
      drawContour(0, [], 2.4, "#14171c");
    }

    // точки: цвет — истинный класс; опорные векторы обведены
    for (let i = 0; i < X.length; i++) {
      const x = toX(X[i].x), yy = toY(X[i].y);
      ctx.beginPath(); ctx.arc(x, yy, 3.8, 0, Math.PI * 2);
      ctx.fillStyle = yv[i] === 0 ? NEG : POS; ctx.fill();
      if (svm.isSupport(i)) {
        ctx.lineWidth = 2; ctx.strokeStyle = "#14171c"; ctx.stroke();
      }
    }
  }

  function loop(t) {
    requestAnimationFrame(loop);
    if (!lastT) lastT = t;
    const dt = t - lastT; lastT = t;
    if (playing && svm && !svm.done) {
      accT += dt; const interval = 1000 / stepsPerSec(); let guard = 0;
      while (accT >= interval && !svm.done && guard < 60) { svm.step(); accT -= interval; guard++; }
      fieldDirty = true; updateStats(); if (svm.done) pause();
    }
    render();
  }

  function syncLabels() {
    pointsVal.textContent = pointsRange.value;
    gammaVal.textContent = gammaRange.value;
    cVal.textContent = fmtC(curC());
    speedVal.textContent = speedRange.value;
    datasetHint.textContent = HINTS[datasetSel.value] || "";
  }
  function syncKernelUI() {
    gammaCtl.style.display = kernelSel.value === "rbf" ? "" : "none";
  }

  datasetSel.addEventListener("change", regenData);
  pointsRange.addEventListener("input", () => { syncLabels(); regenData(); });
  kernelSel.addEventListener("change", () => { syncKernelUI(); rebuild(); });
  gammaRange.addEventListener("input", () => { syncLabels(); rebuild(); });
  cRange.addEventListener("input", () => { syncLabels(); rebuild(); });
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

  syncKernelUI(); syncLabels(); resize(); regenData(); requestAnimationFrame(loop);
})();
