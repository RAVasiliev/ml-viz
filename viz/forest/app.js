/* UI и отрисовка Random Forest: гладкая граница ансамбля (heatmap голосов),
   вторичная панель — граница одного дерева ИЛИ кривая train/OOB-точности от
   числа деревьев. Живой вывод в note-box. */
(function () {
  "use strict";

  const CLASS = [[79, 70, 229], [239, 68, 68], [16, 185, 129], [245, 158, 11]];
  const CLASS_HEX = ["#4f46e5", "#ef4444", "#10b981", "#f59e0b"];
  const BG = [245, 247, 250];
  const C_TRAIN = "#4f46e5", C_OOB = "#10b981";

  const $ = (id) => document.getElementById(id);
  const canvas = $("canvas"), ctx = canvas.getContext("2d");
  const sub = $("sub"), sctx = sub.getContext("2d");
  const cHint = canvas.parentElement.querySelector(".canvas-hint");
  const HINT_DEFAULT = cHint ? cHint.textContent : "";

  const datasetSel = $("dataset");
  const pointsRange = $("points"), pointsVal = $("pointsVal");
  const treesRange = $("trees"), treesVal = $("treesVal");
  const depthRange = $("depth"), depthVal = $("depthVal");
  const featSel = $("feat");
  const speedRange = $("speed"), speedVal = $("speedVal");
  const playBtn = $("play"), stepBtn = $("step"), resetBtn = $("reset"), regenBtn = $("regen");
  const progressBar = $("progressBar");
  const subLabel = $("subLabel"), modeTreeBtn = $("modeTree"), modeAccBtn = $("modeAcc");

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
  let subMode = "tree";              // "tree" | "acc"
  let W = 0, H = 0, SW = 0, SH = 0;
  const PAD = 16;

  window.LabeledDatasets.list.forEach((d) => {
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
    const a = sizeCanvas(canvas, ctx); W = a.w; H = a.h;
    const b = sizeCanvas(sub, sctx); SW = b.w; SH = b.h;
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
      const cell = forest.cell(gx, gy);
      const col = CLASS[cell.cls % CLASS.length];
      const margin = Math.max(0, (cell.conf - 1 / nC) / (1 - 1 / nC));
      const a = forest.trees.length ? 0.16 + 0.6 * margin : 0;
      d[o] = lerp(BG[0], col[0], a); d[o + 1] = lerp(BG[1], col[1], a); d[o + 2] = lerp(BG[2], col[2], a); d[o + 3] = 255;
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

  const pct = (v) => (isFinite(v) ? (v * 100).toFixed(1) + "%" : "—");
  function updateStats() {
    const s = forest.stats();
    $("statTrees").textContent = s.trees + " / " + s.target;
    $("statAcc").textContent = pct(s.acc);
    $("statOOB").textContent = pct(s.oob);
    progressBar.style.width = (s.target ? (s.trees / s.target) * 100 : 0) + "%";
    stepBtn.disabled = s.done;
    updateNote(s);
  }
  function updateNote(s) {
    const note = $("note");
    if (!s.trees) {
      note.innerHTML = "Лес пуст. Жми <b>«+ Дерево»</b> или <b>«Запуск»</b> — деревья добавляются по одному, и фон-голос из рваного становится гладким.";
      return;
    }
    const one = forest.accHist[0];   // train-точность одного дерева
    const trees = s.trees;
    let txt = `Деревьев: <b>${trees}</b>. Каждое училось на бутстрепе (≈63.2% точек; остальные ≈36.8% — OOB). `;
    txt += `Голос всего зала узнаёт обучающие точки на <b>${pct(s.acc)}</b> (train), а честная <b class="c2">OOB-оценка</b> — <b class="c2">${pct(s.oob)}</b>. `;
    if (trees >= 2 && isFinite(one)) {
      const d = (s.acc - one) * 100;
      txt += d > 0.3
        ? `Одно дерево давало train ${pct(one)} — усреднение ${trees} деревьев подняло точность и, главное, <b>стабилизировало</b> границу.`
        : `Граница уже почти не меняется — добавлять деревья смысла мало, кривая справа на <b>плато</b>.`;
    } else {
      txt += `Добавь ещё деревьев — смотри, как растёт OOB-точность и сглаживается фон.`;
    }
    note.innerHTML = txt;
  }

  function drawPoints(c, w, h) {
    const p = plot(w, h);
    for (let i = 0; i < X.length; i++) {
      c.beginPath(); c.arc(p.ox + X[i].x * p.size, p.oy + X[i].y * p.size, w > 360 ? 3.6 : 2, 0, Math.PI * 2);
      c.fillStyle = CLASS_HEX[yv[i] % CLASS_HEX.length]; c.fill();
      if (w > 360) { c.lineWidth = 1; c.strokeStyle = "rgba(255,255,255,.7)"; c.stroke(); }
    }
  }

  // кривая train/OOB-точности от числа деревьев — ключевые ориентиры всегда в кадре
  function drawAccCurve(c, w, h) {
    c.clearRect(0, 0, w, h);
    const M = forest.opts.nTrees;
    const PADL = 40, PADR = 12, PADT = 26, PADB = 26;
    const px = (k) => PADL + (M > 1 ? (k - 1) / (M - 1) : 0) * (w - PADL - PADR);
    // диапазон Y: 1.0 всегда сверху, низ — чуть ниже минимума, но не выше 0.85
    let lo = 1;
    for (const a of forest.accHist) if (isFinite(a)) lo = Math.min(lo, a);
    for (const a of forest.oobHist) if (isFinite(a)) lo = Math.min(lo, a);
    const yMin = Math.max(0, Math.min(0.85, lo - 0.04)), yMax = 1.0;
    const py = (v) => { const d = (yMax - yMin) || 1; return PADT + (1 - (v - yMin) / d) * (h - PADT - PADB); };

    // сетка + подписи Y
    c.font = "10px " + getCSS("--font", "sans-serif");
    c.textBaseline = "middle"; c.textAlign = "right";
    c.strokeStyle = "rgba(20,23,28,.07)"; c.lineWidth = 1;
    const ticks = niceTicks(yMin, yMax);
    for (const v of ticks) {
      const y = py(v);
      c.beginPath(); c.moveTo(PADL, y); c.lineTo(w - PADR, y); c.stroke();
      c.fillStyle = "#8a93a3"; c.fillText(Math.round(v * 100) + "%", PADL - 6, y);
    }
    // подпись оси X
    c.textAlign = "center"; c.textBaseline = "bottom"; c.fillStyle = "#8a93a3";
    c.fillText("число деревьев →", PADL + (w - PADL - PADR) / 2, h - 4);

    if (!forest.accHist.length) return;
    const line = (hist, color, dash) => {
      c.strokeStyle = color; c.lineWidth = 2; c.setLineDash(dash || []); c.beginPath();
      let started = false;
      for (let k = 0; k < hist.length; k++) {
        const v = hist[k]; if (!isFinite(v)) { started = false; continue; }
        const X0 = px(k + 1), Y0 = py(v);
        if (!started) { c.moveTo(X0, Y0); started = true; } else c.lineTo(X0, Y0);
      }
      c.stroke(); c.setLineDash([]);
    };
    line(forest.oobHist, C_OOB, [5, 4]);
    line(forest.accHist, C_TRAIN, []);

    // маркер текущего (последнего) значения
    const k = forest.accHist.length;
    const markDot = (hist, color) => {
      const v = hist[k - 1]; if (!isFinite(v)) return;
      c.beginPath(); c.arc(px(k), py(v), 3.2, 0, Math.PI * 2); c.fillStyle = color; c.fill();
      c.lineWidth = 1.5; c.strokeStyle = "#fff"; c.stroke();
    };
    markDot(forest.oobHist, C_OOB); markDot(forest.accHist, C_TRAIN);

    // мини-легенда
    c.font = "600 11px " + getCSS("--font", "sans-serif");
    c.textBaseline = "top"; c.textAlign = "left";
    c.fillStyle = C_TRAIN; c.fillText("train", PADL + 2, 4);
    c.fillStyle = C_OOB; c.fillText("OOB", PADL + 44, 4);
  }
  function niceTicks(lo, hi) {
    const out = []; for (let v = Math.ceil(lo / 0.1) * 0.1; v <= hi + 1e-9; v += 0.1) out.push(+v.toFixed(2));
    if (!out.length || out[out.length - 1] < hi - 1e-9) out.push(hi);
    return out;
  }
  function getCSS(varName, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    return v || fallback;
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    if (forest) {
      const p = plot(W, H);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(grid, p.ox, p.oy, p.size, p.size);
      drawPoints(ctx, W, H);
    }
    // вторичная панель
    if (subMode === "acc") {
      if (forest) drawAccCurve(sctx, SW, SH);
    } else {
      sctx.clearRect(0, 0, SW, SH);
      if (forest) {
        const p = plot(SW, SH);
        sctx.imageSmoothingEnabled = false;
        sctx.drawImage(lastGrid, p.ox, p.oy, p.size, p.size);
        drawPoints(sctx, SW, SH);
      }
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

  function setSubMode(m) {
    subMode = m;
    modeTreeBtn.classList.toggle("on", m === "tree");
    modeAccBtn.classList.toggle("on", m === "acc");
    subLabel.textContent = m === "tree"
      ? "Последнее дерево · одиночная «зубчатая» осевая граница"
      : "Точность от числа деревьев · train и честная OOB-оценка";
    render();
  }

  function syncLabels() {
    pointsVal.textContent = pointsRange.value;
    treesVal.textContent = treesRange.value;
    depthVal.textContent = depthRange.value;
    speedVal.textContent = speedRange.value;
  }

  // ховер по полю — предсказание леса в точке курсора (Rule 6a)
  function onHover(e) {
    if (!forest || !forest.trees.length) return;
    const r = canvas.getBoundingClientRect();
    const p = plot(W, H);
    const nx = (e.clientX - r.left - p.ox) / p.size, ny = (e.clientY - r.top - p.oy) / p.size;
    if (nx < 0 || nx > 1 || ny < 0 || ny > 1) { cHint.textContent = HINT_DEFAULT; return; }
    const gx = Math.min(G - 1, Math.max(0, (nx * G) | 0)), gy = Math.min(G - 1, Math.max(0, (ny * G) | 0));
    const cell = forest.cell(gx, gy);
    cHint.textContent = `здесь лес голосует за класс ${cell.cls} · ${Math.round(cell.conf * 100)}% деревьев «за»`;
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
  modeTreeBtn.addEventListener("click", () => setSubMode("tree"));
  modeAccBtn.addEventListener("click", () => setSubMode("acc"));
  canvas.addEventListener("mousemove", onHover);
  canvas.addEventListener("mouseleave", () => { cHint.textContent = HINT_DEFAULT; });

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
