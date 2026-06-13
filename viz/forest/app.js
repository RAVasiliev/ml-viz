/* UI и отрисовка Random Forest: гладкая граница ансамбля (heatmap голосов)
   + панель «последнее дерево» (зубчатая граница одиночного дерева). */
(function () {
  "use strict";

  const CLASS = [[79, 70, 229], [239, 68, 68], [16, 185, 129], [245, 158, 11]];
  const CLASS_HEX = ["#4f46e5", "#ef4444", "#10b981", "#f59e0b"];
  const BG = [245, 247, 250];

  const $ = (id) => document.getElementById(id);
  const canvas = $("canvas"), ctx = canvas.getContext("2d");
  const lcv = $("last"), lctx = lcv.getContext("2d");

  const datasetSel = $("dataset");
  const pointsRange = $("points"), pointsVal = $("pointsVal");
  const treesRange = $("trees"), treesVal = $("treesVal");
  const depthRange = $("depth"), depthVal = $("depthVal");
  const featSel = $("feat");
  const speedRange = $("speed"), speedVal = $("speedVal");
  const playBtn = $("play"), stepBtn = $("step"), resetBtn = $("reset"), regenBtn = $("regen");
  const progressBar = $("progressBar");

  const G = 60;
  const grid = document.createElement("canvas"); grid.width = G; grid.height = G;
  const gctx = grid.getContext("2d");
  const gimg = gctx.createImageData(G, G);
  const lastGrid = document.createElement("canvas"); lastGrid.width = G; lastGrid.height = G;
  const lgctx = lastGrid.getContext("2d");
  const limg = lgctx.createImageData(G, G);

  let data = null, X = [], yv = [], nC = 2;
  let forest = null;
  let playing = false, acc = 0, lastT = 0, seed = 4;
  let W = 0, H = 0, LW = 0, LH = 0;
  const PAD = 16;

  window.LabeledDatasets.list.forEach((d) => {
    const o = document.createElement("option"); o.value = d.id; o.textContent = d.name; datasetSel.appendChild(o);
  });
  datasetSel.value = "moons";

  function plot(w, h) { const size = Math.min(w, h) - 2 * PAD; return { size, ox: (w - size) / 2, oy: (h - size) / 2 }; }
  const toX = (nx) => { const p = plot(W, H); return p.ox + nx * p.size; };
  const toY = (ny) => { const p = plot(W, H); return p.oy + ny * p.size; };

  function sizeCanvas(cv, c) {
    const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    c.setTransform(dpr, 0, 0, dpr, 0, 0); return { w: r.width, h: r.height };
  }
  function resize() {
    const a = sizeCanvas(canvas, ctx); W = a.w; H = a.h;
    const b = sizeCanvas(lcv, lctx); LW = b.w; LH = b.h;
    render();
  }

  function regenData() {
    data = window.LabeledDatasets.generate(datasetSel.value, +pointsRange.value, seed);
    X = data.points; yv = data.labels; nC = data.nClasses;
    rebuild();
  }
  function rebuild() {
    forest = new window.ForestStepper(X, yv, {
      nTrees: +treesRange.value, maxDepth: +depthRange.value, minSamples: 1,
      criterion: "gini", maxFeatures: +featSel.value, nClasses: nC, seed: seed, grid: G,
    });
    refreshGrids(); pause(); updateStats(); render();
  }

  function lerp(a, b, t) { return Math.round(a + (b - a) * t); }
  function refreshGrids() {
    const d = gimg.data, ld = limg.data;
    for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
      const o = (gy * G + gx) * 4;
      // ансамбль
      const cell = forest.cell(gx, gy);
      const col = CLASS[cell.cls % CLASS.length];
      const margin = Math.max(0, (cell.conf - 1 / nC) / (1 - 1 / nC));
      const a = forest.trees.length ? 0.16 + 0.6 * margin : 0;
      d[o] = lerp(BG[0], col[0], a); d[o + 1] = lerp(BG[1], col[1], a); d[o + 2] = lerp(BG[2], col[2], a); d[o + 3] = 255;
      // последнее дерево (жёсткая граница)
      if (forest.lastTree) {
        const c2 = CLASS[window.TreeCore.predict(forest.lastTree, (gx + 0.5) / G, (gy + 0.5) / G) % CLASS.length];
        ld[o] = lerp(BG[0], c2[0], 0.5); ld[o + 1] = lerp(BG[1], c2[1], 0.5); ld[o + 2] = lerp(BG[2], c2[2], 0.5); ld[o + 3] = 255;
      } else { ld[o] = BG[0]; ld[o + 1] = BG[1]; ld[o + 2] = BG[2]; ld[o + 3] = 255; }
    }
    gctx.putImageData(gimg, 0, 0);
    lgctx.putImageData(limg, 0, 0);
  }

  function doStep() { if (!forest.done) { forest.addTree(); refreshGrids(); } updateStats(); }
  function stepsPerSec() { const t = (+speedRange.value - 1) / 99; return Math.round(1 + 18 * t * t); }

  function play() { if (forest.done) rebuild(); playing = true; acc = 0; updatePlayBtn(); }
  function pause() { playing = false; updatePlayBtn(); }
  function togglePlay() { playing ? pause() : play(); }
  function updatePlayBtn() {
    playBtn.innerHTML = playing
      ? '<svg width="13" height="13" viewBox="0 0 12 12"><rect x="2" y="1.5" width="3" height="9" rx="1" fill="currentColor"/><rect x="7" y="1.5" width="3" height="9" rx="1" fill="currentColor"/></svg> Пауза'
      : '<svg width="13" height="13" viewBox="0 0 12 12"><path d="M3 1.5l7 4.5-7 4.5z" fill="currentColor"/></svg> Запуск';
  }

  function updateStats() {
    const s = forest.stats();
    $("statTrees").textContent = s.trees + " / " + s.target;
    $("statAcc").textContent = (s.acc * 100).toFixed(1) + "%";
    progressBar.style.width = (s.target ? (s.trees / s.target) * 100 : 0) + "%";
    stepBtn.disabled = s.done;
  }

  function drawPoints(c, w, h) {
    const p = plot(w, h);
    for (let i = 0; i < X.length; i++) {
      c.beginPath(); c.arc(p.ox + X[i].x * p.size, p.oy + X[i].y * p.size, w > 360 ? 3.6 : 2, 0, Math.PI * 2);
      c.fillStyle = CLASS_HEX[yv[i] % CLASS_HEX.length]; c.fill();
      if (w > 360) { c.lineWidth = 1; c.strokeStyle = "rgba(255,255,255,.7)"; c.stroke(); }
    }
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    if (forest) {
      const p = plot(W, H);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(grid, p.ox, p.oy, p.size, p.size); // гладкая граница ансамбля
      drawPoints(ctx, W, H);
    }
    // панель последнего дерева
    lctx.clearRect(0, 0, LW, LH);
    if (forest) {
      const p = plot(LW, LH);
      lctx.imageSmoothingEnabled = false;
      lctx.drawImage(lastGrid, p.ox, p.oy, p.size, p.size); // зубчатая граница одного дерева
      drawPoints(lctx, LW, LH);
    }
  }

  function loop(t) {
    requestAnimationFrame(loop);
    if (!lastT) lastT = t;
    const dt = t - lastT; lastT = t;
    if (playing && forest && !forest.done) {
      acc += dt; const interval = 1000 / stepsPerSec(); let guard = 0;
      while (acc >= interval && !forest.done && guard < 20) { forest.addTree(); acc -= interval; guard++; }
      refreshGrids(); updateStats(); if (forest.done) pause();
    }
    render();
  }

  function syncLabels() {
    pointsVal.textContent = pointsRange.value;
    treesVal.textContent = treesRange.value;
    depthVal.textContent = depthRange.value;
    speedVal.textContent = speedRange.value;
  }

  datasetSel.addEventListener("change", regenData);
  pointsRange.addEventListener("input", () => { syncLabels(); regenData(); });
  treesRange.addEventListener("input", () => { syncLabels(); rebuild(); });
  depthRange.addEventListener("input", () => { syncLabels(); rebuild(); });
  featSel.addEventListener("change", rebuild);
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
