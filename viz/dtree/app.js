/* UI и отрисовка Decision Tree: граница решений + диаграмма дерева + accuracy. */
(function () {
  "use strict";

  const CLASS = ["#4f46e5", "#ef4444", "#10b981", "#f59e0b"];
  const $ = (id) => document.getElementById(id);
  const canvas = $("canvas"), ctx = canvas.getContext("2d");
  const tcv = $("tree"), tctx = tcv.getContext("2d");

  const datasetSel = $("dataset");
  const pointsRange = $("points"), pointsVal = $("pointsVal");
  const depthRange = $("depth"), depthVal = $("depthVal");
  const leafRange = $("leaf"), leafVal = $("leafVal");
  const critSel = $("criterion");
  const speedRange = $("speed"), speedVal = $("speedVal");
  const playBtn = $("play"), stepBtn = $("step"), resetBtn = $("reset"), regenBtn = $("regen");
  const progressBar = $("progressBar");

  let data = null, X = [], yv = [], nC = 2;
  let tree = null;
  let playing = false, acc = 0, lastT = 0, seed = 3;
  let W = 0, H = 0, TW = 0, TH = 0;
  const PAD = 16;

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
    const b = sizeCanvas(tcv, tctx); TW = b.w; TH = b.h;
    render();
  }

  function regenData() {
    data = window.LabeledDatasets.generate(datasetSel.value, +pointsRange.value, seed);
    X = data.points; yv = data.labels; nC = data.nClasses;
    rebuild();
  }
  function rebuild() {
    tree = new window.DTreeStepper(X, yv, {
      nClasses: nC, criterion: critSel.value,
      maxDepth: +depthRange.value, minSamples: +leafRange.value, maxFeatures: 2,
    });
    pause(); updateStats(); render();
  }

  function doStep() { if (!tree.done) tree.step(); updateStats(); }
  function stepsPerSec() { const t = (+speedRange.value - 1) / 99; return Math.round(1 + 24 * t * t); }

  function play() { if (tree.done) rebuild(); playing = true; acc = 0; updatePlayBtn(); }
  function pause() { playing = false; updatePlayBtn(); }
  function togglePlay() { playing ? pause() : play(); }
  function updatePlayBtn() {
    playBtn.innerHTML = playing
      ? '<svg width="13" height="13" viewBox="0 0 12 12"><rect x="2" y="1.5" width="3" height="9" rx="1" fill="currentColor"/><rect x="7" y="1.5" width="3" height="9" rx="1" fill="currentColor"/></svg> Пауза'
      : '<svg width="13" height="13" viewBox="0 0 12 12"><path d="M3 1.5l7 4.5-7 4.5z" fill="currentColor"/></svg> Запуск';
  }

  function updateStats() {
    const s = tree.stats();
    $("statDepth").textContent = s.depth;
    $("statLeaves").textContent = s.leaves;
    $("statNodes").textContent = s.nodes;
    $("statAcc").textContent = (s.acc * 100).toFixed(1) + "%";
    const cap = Math.pow(2, +depthRange.value); // грубая оценка прогресса
    progressBar.style.width = Math.min(100, (s.nodes / cap) * 100) + "%";
    stepBtn.disabled = s.done;
  }

  function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }

  function render() {
    ctx.clearRect(0, 0, W, H);
    if (tree) {
      // регионы (осевые прямоугольники), цвет — предсказанный класс
      for (const node of tree.regions()) {
        const b = node.box, x = toX(b.x0), yy = toY(b.y0), w = toX(b.x1) - x, h = toY(b.y1) - yy;
        ctx.fillStyle = hexA(CLASS[node.prediction % CLASS.length], 0.18);
        ctx.fillRect(x, yy, w, h);
        ctx.strokeStyle = "rgba(20,23,28,.10)"; ctx.lineWidth = 1; ctx.strokeRect(x + .5, yy + .5, w, h);
      }
      // точки: цвет — истинный класс; ошибочно классифицированные обведены
      for (let i = 0; i < X.length; i++) {
        const x = toX(X[i].x), yy = toY(X[i].y);
        const pred = tree.predict(X[i].x, X[i].y);
        ctx.beginPath(); ctx.arc(x, yy, 3.8, 0, Math.PI * 2);
        ctx.fillStyle = CLASS[yv[i] % CLASS.length]; ctx.fill();
        if (pred !== yv[i]) { ctx.lineWidth = 1.8; ctx.strokeStyle = "#14171c"; ctx.stroke(); }
      }
    }
    renderTree();
  }

  // диаграмма дерева: листья по слотам слева-направо, глубина — по вертикали
  function renderTree() {
    tctx.clearRect(0, 0, TW, TH);
    if (!tree) return;
    const nodes = tree.nodes;
    const pos = {}; let slot = 0, maxDepth = 0;
    for (const n of nodes) if (n.depth > maxDepth) maxDepth = n.depth;
    (function layout(id) {
      const n = nodes[id];
      if (n.left < 0) { pos[id] = { x: slot++, d: n.depth }; return; }
      layout(n.left); layout(n.right);
      pos[id] = { x: (pos[n.left].x + pos[n.right].x) / 2, d: n.depth };
    })(0);
    const nLeaves = slot || 1;
    const padX = 18, padY = 16;
    const PX = (x) => padX + (nLeaves <= 1 ? 0.5 : x / (nLeaves - 1)) * (TW - 2 * padX);
    const PY = (d) => padY + (maxDepth === 0 ? 0 : d / maxDepth) * (TH - 2 * padY);

    // рёбра
    tctx.strokeStyle = "rgba(20,23,28,.18)"; tctx.lineWidth = 1.2;
    for (const n of nodes) {
      if (n.left < 0) continue;
      for (const ch of [n.left, n.right]) {
        tctx.beginPath();
        tctx.moveTo(PX(pos[n.id].x), PY(pos[n.id].d));
        tctx.lineTo(PX(pos[ch].x), PY(pos[ch].d));
        tctx.stroke();
      }
    }
    // узлы: лист — залит классом, внутренний — обведён
    for (const n of nodes) {
      const x = PX(pos[n.id].x), y = PY(pos[n.id].d);
      const col = CLASS[n.prediction % CLASS.length];
      tctx.beginPath(); tctx.arc(x, y, n.left < 0 ? 5 : 4, 0, Math.PI * 2);
      if (n.left < 0) { tctx.fillStyle = col; tctx.fill(); }
      else { tctx.fillStyle = "#fff"; tctx.fill(); tctx.lineWidth = 2; tctx.strokeStyle = col; tctx.stroke(); }
    }
  }

  function loop(t) {
    requestAnimationFrame(loop);
    if (!lastT) lastT = t;
    const dt = t - lastT; lastT = t;
    if (playing && tree && !tree.done) {
      acc += dt; const interval = 1000 / stepsPerSec(); let guard = 0;
      while (acc >= interval && !tree.done && guard < 100) { tree.step(); acc -= interval; guard++; }
      updateStats(); if (tree.done) pause();
    }
    render();
  }

  function syncLabels() {
    pointsVal.textContent = pointsRange.value;
    depthVal.textContent = depthRange.value;
    leafVal.textContent = leafRange.value;
    speedVal.textContent = speedRange.value;
  }

  datasetSel.addEventListener("change", regenData);
  pointsRange.addEventListener("input", () => { syncLabels(); regenData(); });
  depthRange.addEventListener("input", () => { syncLabels(); rebuild(); });
  leafRange.addEventListener("input", () => { syncLabels(); rebuild(); });
  critSel.addEventListener("change", rebuild);
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
