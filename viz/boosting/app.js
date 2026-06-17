/* UI и отрисовка градиентного бустинга (1D-регрессия).
   Главный холст: данные (x,y), истинная y(x), ломаная ансамбля F(x), остатки и
   вертикали-сплиты последнего дерева. Ниже — две постоянные панели:
   слева структура дерева, которое строится (узлы-сплиты + листья),
   справа кривая train-MSE. Логика — в boosting.js (window.Boosting). */
(function () {
  "use strict";

  const C_ENS = "#4f46e5", C_TRUE = "#94a3b8", C_RESID = "#ef4444", C_PT = "#1f2937", C_TEST = "#ea8a1e";
  const LEAF_POS = [239, 68, 68], LEAF_NEG = [79, 70, 229]; // лист: +остаток красный, −остаток синий
  const FONT = "-apple-system, system-ui, sans-serif";

  const $ = (id) => document.getElementById(id);
  const canvas = $("canvas"), ctx = canvas.getContext("2d");
  const treeCv = $("tree"), tctx = treeCv.getContext("2d");
  const mseCv = $("mse"), mctx = mseCv.getContext("2d");

  const targetSel = $("target");
  const pointsRange = $("points"), pointsVal = $("pointsVal");
  const noiseRange = $("noise"), noiseVal = $("noiseVal");
  const etaRange = $("eta"), etaVal = $("etaVal");
  const depthRange = $("depth"), depthVal = $("depthVal");
  const nestRange = $("nest"), nestVal = $("nestVal");
  const speedRange = $("speed"), speedVal = $("speedVal");
  const playBtn = $("play"), stepBtn = $("step"), resetBtn = $("reset"), regenBtn = $("regen");
  const progressBar = $("progressBar"), treeNo = $("treeNo");

  let data = null, testData = null, model = null;
  let yLo = 0, yHi = 1;
  let playing = false, accT = 0, lastT = 0, seed = 7;
  let W = 0, H = 0, TW = 0, TH = 0, MW = 0, MH = 0;

  window.Boosting.targets.forEach((t) => {
    const o = document.createElement("option"); o.value = t.id; o.textContent = t.name; targetSel.appendChild(o);
  });
  targetSel.value = "sine";

  const noiseOf = () => (+noiseRange.value) / 100;
  const etaOf = () => (+etaRange.value) / 100;

  function sizeCanvas(cv, c) {
    const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    c.setTransform(dpr, 0, 0, dpr, 0, 0); return { w: r.width, h: r.height };
  }
  function resize() {
    const a = sizeCanvas(canvas, ctx); W = a.w; H = a.h;
    const b = sizeCanvas(treeCv, tctx); TW = b.w; TH = b.h;
    const c = sizeCanvas(mseCv, mctx); MW = c.w; MH = c.h;
    render();
  }

  function regenData() {
    const n = +pointsRange.value, noise = noiseOf();
    data = window.Boosting.generate(targetSel.value, n, noise, seed);
    // отложенная (тестовая) выборка: та же зависимость и шум, но другой seed и точки
    const nTest = Math.max(20, Math.round(n * 0.45));
    testData = window.Boosting.generate(targetSel.value, nTest, noise, (seed ^ 0x9e3779b9) >>> 0);
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < data.y.length; i++) { lo = Math.min(lo, data.y[i], data.ytrue[i]); hi = Math.max(hi, data.y[i], data.ytrue[i]); }
    for (let i = 0; i < testData.y.length; i++) { lo = Math.min(lo, testData.y[i]); hi = Math.max(hi, testData.y[i]); }
    const pad = (hi - lo) * 0.12 || 0.1;
    yLo = lo - pad; yHi = hi + pad;
    rebuild();
  }
  function rebuild() {
    model = new window.Boosting.BoostStepper(data, {
      eta: etaOf(), maxDepth: +depthRange.value, minLeaf: 1, target: +nestRange.value,
      xt: testData.x, yt: testData.y,
    });
    pause(); updateStats(); render();
  }

  function doStep() { if (!model.done) model.step(); updateStats(); }
  function stepsPerSec() { const t = (+speedRange.value - 1) / 99; return Math.round(1 + 28 * t * t); }

  function play() { if (model.done) rebuild(); playing = true; accT = 0; updatePlayBtn(); }
  function pause() { playing = false; updatePlayBtn(); }
  function togglePlay() { playing ? pause() : play(); }
  function updatePlayBtn() {
    playBtn.innerHTML = playing
      ? '<svg width="13" height="13" viewBox="0 0 12 12"><rect x="2" y="1.5" width="3" height="9" rx="1" fill="currentColor"/><rect x="7" y="1.5" width="3" height="9" rx="1" fill="currentColor"/></svg> Пауза'
      : '<svg width="13" height="13" viewBox="0 0 12 12"><path d="M3 1.5l7 4.5-7 4.5z" fill="currentColor"/></svg> Запуск';
  }

  const fmt = (v) => (v >= 0.01 ? v.toFixed(3) : v.toExponential(1));
  function updateStats() {
    const s = model.stats();
    $("statTrees").textContent = s.nTrees;
    $("statMSE").textContent = fmt(s.mse);
    $("statMSEt").textContent = isFinite(s.mseTest) ? fmt(s.mseTest) : "—";
    $("statEta").textContent = etaOf().toFixed(2);
    treeNo.textContent = s.nTrees ? "#" + s.nTrees : "—";
    progressBar.style.width = (model.target > 0 ? (s.nTrees / model.target) * 100 : 0) + "%";
    stepBtn.disabled = s.done;
    updateNote(s);
  }
  function updateNote(s) {
    const note = $("note");
    const mse0 = model.mseHistory[0];
    if (!s.nTrees) {
      note.innerHTML = `Пока только база <span style="font-family:var(--mono)">F₀ = среднее y</span> — горизонтальная линия. Жми <b>«Дерево ⏭»</b>: первое дерево возьмётся за самые большие остатки — увидишь его сплиты внизу слева, а на тесте проверим, не выучили ли мы шум.`;
      return;
    }
    const drop = mse0 > 0 ? (1 - s.mse / mse0) * 100 : 0;
    // лучшее число деревьев по тесту (early stopping)
    const th = model.mseTestHistory; let bestK = 0, bestV = Infinity;
    for (let k = 0; k < th.length; k++) if (th[k] < bestV) { bestV = th[k]; bestK = k; }
    let txt = `Деревьев: <b>${s.nTrees}</b>, η = <b>${etaOf().toFixed(2)}</b>. <b style="color:#4f46e5">train-MSE ${fmt(s.mse)}</b> (−${drop.toFixed(0)}% от старта), <b style="color:#ea8a1e">test-MSE ${fmt(s.mseTest)}</b>. `;
    if (s.nTrees > bestK + 2 && s.mseTest > bestV * 1.05) {
      txt += `<b>Переобучение</b>: train всё падает, а <b style="color:#ea8a1e">тест уже растёт</b> — лучшее качество было примерно на <b>${bestK}</b> деревьях. Это и есть момент для <b>early stopping</b>.`;
    } else if (bestK >= th.length - 1) {
      txt += `Тест ещё падает — ансамбль недообучен, можно добавить деревьев или поднять η.`;
    } else {
      txt += `Тест около минимума (≈<b>${bestK}</b> деревьев) — почти оптимально.`;
    }
    note.innerHTML = txt;
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function niceStep(range) {
    if (!(range > 0)) return 1;
    const raw = range / 5, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / mag; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
  }

  // ---- главный холст ----
  const M = { l: 44, r: 14, t: 14, b: 26 };
  const mx = (w, xn) => M.l + xn * (w - M.l - M.r);
  const my = (h, v) => { const d = (yHi - yLo) || 1; return M.t + (1 - (v - yLo) / d) * (h - M.t - M.b); };

  function collectThr(node, arr) { if (!node || node.leaf) return; arr.push(node.thr); collectThr(node.left, arr); collectThr(node.right, arr); }

  function drawMain() {
    ctx.clearRect(0, 0, W, H);
    if (!model || !data) return;
    // сетка Y + ось X
    ctx.font = "10px " + FONT; ctx.textBaseline = "middle"; ctx.textAlign = "right";
    ctx.strokeStyle = "rgba(20,23,28,.06)"; ctx.lineWidth = 1;
    const step = niceStep(yHi - yLo);
    for (let v = Math.ceil(yLo / step) * step; v <= yHi + 1e-9; v += step) {
      const y = my(H, v); ctx.beginPath(); ctx.moveTo(M.l, y); ctx.lineTo(W - M.r, y); ctx.stroke();
      ctx.fillStyle = "#8a93a3"; ctx.fillText((+v.toFixed(2)).toString(), M.l - 6, y);
    }
    ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.fillStyle = "#8a93a3";
    for (const xn of [0, 0.25, 0.5, 0.75, 1]) ctx.fillText(xn.toFixed(2), mx(W, xn), H - 4);

    const n = data.x.length;
    // вертикали-сплиты последнего дерева — связывают дерево слева с осью x
    if (model.lastTree) {
      const thr = []; collectThr(model.lastTree, thr);
      ctx.strokeStyle = "rgba(79,70,229,.22)"; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      for (const t of thr) { const X = mx(W, t); ctx.beginPath(); ctx.moveTo(X, M.t); ctx.lineTo(X, H - M.b); ctx.stroke(); }
      ctx.setLineDash([]);
    }
    // остатки — вертикальные чёрточки от F(x_i) до y_i
    ctx.strokeStyle = "rgba(239,68,68,.5)"; ctx.lineWidth = 1.4;
    for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.moveTo(mx(W, data.x[i]), my(H, data.y[i])); ctx.lineTo(mx(W, data.x[i]), my(H, model.F[i])); ctx.stroke(); }
    // истинная y(x)
    ctx.strokeStyle = C_TRUE; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); ctx.beginPath();
    for (let k = 0; k <= 200; k++) { const xn = k / 200, v = data.fn(xn); const X = mx(W, xn), Y = my(H, v); k ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }
    ctx.stroke(); ctx.setLineDash([]);
    // ансамбль F(x)
    ctx.strokeStyle = C_ENS; ctx.lineWidth = 2.6; ctx.lineJoin = "round"; ctx.beginPath();
    for (let k = 0; k <= 320; k++) { const xn = k / 320, v = model.predict(xn); const X = mx(W, xn), Y = my(H, v); k ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }
    ctx.stroke();
    // обучающие точки
    for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.arc(mx(W, data.x[i]), my(H, data.y[i]), W > 360 ? 3 : 2, 0, Math.PI * 2); ctx.fillStyle = C_PT; ctx.globalAlpha = 0.78; ctx.fill(); ctx.globalAlpha = 1; }
    // тестовые точки — полые оранжевые кольца (held-out, в обучении не участвуют)
    if (testData) {
      ctx.lineWidth = 1.6; ctx.strokeStyle = C_TEST;
      const rr = W > 360 ? 3.2 : 2.4;
      for (let i = 0; i < testData.x.length; i++) {
        ctx.beginPath(); ctx.arc(mx(W, testData.x[i]), my(H, testData.y[i]), rr, 0, Math.PI * 2);
        ctx.fillStyle = "#fff"; ctx.globalAlpha = 0.92; ctx.fill(); ctx.globalAlpha = 1; ctx.stroke();
      }
    }
  }

  // ---- панель: структура дерева, которое строится ----
  function drawTree() {
    tctx.clearRect(0, 0, TW, TH);
    const root = model && model.lastTree;
    if (!root) {
      tctx.fillStyle = "#8a93a3"; tctx.font = "13px " + FONT; tctx.textAlign = "center"; tctx.textBaseline = "middle";
      tctx.fillText("Дерева ещё нет — жми «Дерево ⏭»", TW / 2, TH / 2);
      return;
    }
    // компоновка: листья по горизонтали, внутренние узлы — над детьми
    let leafIdx = 0, maxD = 0, maxAbs = 1e-6;
    (function layout(node, d) {
      if (d > maxD) maxD = d;
      if (node.leaf) { node._x = leafIdx++; node._d = d; maxAbs = Math.max(maxAbs, Math.abs(node.value)); }
      else { layout(node.left, d + 1); layout(node.right, d + 1); node._x = (node.left._x + node.right._x) / 2; node._d = d; }
    })(root, 0);
    const nL = leafIdx;
    const PADX = 18, PADT = 22, PADB = 16;
    const spacing = nL > 1 ? (TW - 2 * PADX) / (nL - 1) : 0;
    const colX = (slot) => nL <= 1 ? TW / 2 : PADX + slot * spacing;
    const rowY = (d) => maxD <= 0 ? TH / 2 : PADT + (d / maxD) * (TH - PADT - PADB);
    const leafW = Math.max(34, Math.min(48, spacing - 6)) || 46, leafH = 21, intW = 56, intH = 21;

    // рёбра
    tctx.strokeStyle = "rgba(20,23,28,.22)"; tctx.lineWidth = 1.4;
    (function edges(n) {
      if (n.leaf) return;
      const x0 = colX(n._x), y0 = rowY(n._d);
      for (const c of [n.left, n.right]) { tctx.beginPath(); tctx.moveTo(x0, y0); tctx.lineTo(colX(c._x), rowY(c._d)); tctx.stroke(); }
      edges(n.left); edges(n.right);
    })(root);

    // узлы
    tctx.textAlign = "center"; tctx.textBaseline = "middle";
    (function nodes(n) {
      const x = colX(n._x), y = rowY(n._d);
      if (n.leaf) {
        const v = n.value, t = Math.min(1, Math.abs(v) / maxAbs), col = v >= 0 ? LEAF_POS : LEAF_NEG;
        roundRect(tctx, x - leafW / 2, y - leafH / 2, leafW, leafH, 7);
        tctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${0.14 + 0.58 * t})`; tctx.fill();
        tctx.lineWidth = 1; tctx.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},.85)`; tctx.stroke();
        tctx.fillStyle = "#14171c"; tctx.font = "700 10.5px " + FONT;
        tctx.fillText((v >= 0 ? "+" : "−") + Math.abs(v).toFixed(2), x, y + 0.5);
      } else {
        roundRect(tctx, x - intW / 2, y - intH / 2, intW, intH, 7);
        tctx.fillStyle = "#fff"; tctx.fill();
        tctx.lineWidth = 1.2; tctx.strokeStyle = C_ENS; tctx.stroke();
        tctx.fillStyle = C_ENS; tctx.font = "600 10.5px " + FONT;
        tctx.fillText("x ≤ " + n.thr.toFixed(2), x, y + 0.5);
        nodes(n.left); nodes(n.right);
      }
    })(root);

    // подпись «корень / листья»
    tctx.fillStyle = "#b6bcc7"; tctx.font = "9.5px " + FONT; tctx.textAlign = "left"; tctx.textBaseline = "top";
    tctx.fillText("корень", 6, 5);
  }

  // ---- панель: кривая train-MSE (всегда видна) ----
  function drawMseCurve() {
    mctx.clearRect(0, 0, MW, MH);
    if (!model) return;
    const hist = model.mseHistory, histT = model.mseTestHistory, target = model.target;
    const PADL = 50, PADR = 12, PADT = 22, PADB = 24;
    let hi = 1e-9;
    for (const v of hist) if (isFinite(v)) hi = Math.max(hi, v);
    for (const v of histT) if (isFinite(v)) hi = Math.max(hi, v);
    hi *= 1.06; const lo = 0;
    const mxX = (k) => PADL + (target > 0 ? k / target : 0) * (MW - PADL - PADR);
    const myY = (v) => { const d = (hi - lo) || 1; return PADT + (1 - (v - lo) / d) * (MH - PADT - PADB); };

    // сетка + ось
    mctx.font = "10px " + FONT; mctx.textBaseline = "middle"; mctx.textAlign = "right";
    mctx.strokeStyle = "rgba(20,23,28,.06)"; mctx.lineWidth = 1;
    const step = niceStep(hi - lo);
    for (let v = 0; v <= hi + 1e-9; v += step) {
      const y = myY(v); mctx.beginPath(); mctx.moveTo(PADL, y); mctx.lineTo(MW - PADR, y); mctx.stroke();
      mctx.fillStyle = "#8a93a3"; mctx.fillText(fmt(v), PADL - 6, y);
    }
    mctx.textAlign = "center"; mctx.textBaseline = "bottom"; mctx.fillStyle = "#8a93a3";
    mctx.fillText("число деревьев →", PADL + (MW - PADL - PADR) / 2, MH - 4);

    // минимум теста — пунктир + подпись (момент early stopping)
    let bestK = 0, bestV = Infinity;
    for (let k = 0; k < histT.length; k++) if (isFinite(histT[k]) && histT[k] < bestV) { bestV = histT[k]; bestK = k; }
    if (histT.length > 2 && bestK < histT.length - 1) {
      const X = mxX(bestK);
      mctx.strokeStyle = "rgba(234,138,30,.5)"; mctx.lineWidth = 1; mctx.setLineDash([3, 3]);
      mctx.beginPath(); mctx.moveTo(X, PADT); mctx.lineTo(X, MH - PADB); mctx.stroke(); mctx.setLineDash([]);
      mctx.fillStyle = C_TEST; mctx.font = "600 9.5px " + FONT; mctx.textAlign = "center"; mctx.textBaseline = "top";
      mctx.fillText("min тест", X, PADT + 1);
    }

    const curve = (h, color) => {
      mctx.strokeStyle = color; mctx.lineWidth = 2.2; mctx.lineJoin = "round"; mctx.beginPath();
      let started = false;
      for (let k = 0; k < h.length; k++) { const v = h[k]; if (!isFinite(v)) { started = false; continue; } const X = mxX(k), Y = myY(v); started ? mctx.lineTo(X, Y) : mctx.moveTo(X, Y); started = true; }
      mctx.stroke();
      const last = h.length - 1; if (isFinite(h[last])) { mctx.beginPath(); mctx.arc(mxX(last), myY(h[last]), 3, 0, Math.PI * 2); mctx.fillStyle = color; mctx.fill(); mctx.lineWidth = 1.5; mctx.strokeStyle = "#fff"; mctx.stroke(); }
    };
    curve(histT, C_TEST);
    curve(hist, C_ENS);

    // мини-легенда
    mctx.textBaseline = "top"; mctx.textAlign = "left"; mctx.font = "600 11px " + FONT;
    mctx.fillStyle = C_ENS; mctx.fillText("train", PADL + 2, 4);
    mctx.fillStyle = C_TEST; mctx.fillText("test", PADL + 46, 4);
  }

  function render() { drawMain(); drawTree(); drawMseCurve(); }

  function loop(t) {
    requestAnimationFrame(loop);
    if (!lastT) lastT = t;
    const dt = t - lastT; lastT = t;
    if (playing && model && !model.done) {
      accT += dt; const interval = 1000 / stepsPerSec(); let guard = 0;
      while (accT >= interval && !model.done && guard < 30) { model.step(); accT -= interval; guard++; }
      updateStats();
      if (model.done) pause();
    }
    render();
  }

  function syncLabels() {
    pointsVal.textContent = pointsRange.value;
    noiseVal.textContent = noiseOf().toFixed(2);
    etaVal.textContent = etaOf().toFixed(2);
    depthVal.textContent = depthRange.value;
    nestVal.textContent = nestRange.value;
    speedVal.textContent = speedRange.value;
  }

  targetSel.addEventListener("change", regenData);
  pointsRange.addEventListener("input", () => { syncLabels(); regenData(); });
  noiseRange.addEventListener("input", () => { syncLabels(); regenData(); });
  etaRange.addEventListener("input", () => { syncLabels(); rebuild(); });
  depthRange.addEventListener("input", () => { syncLabels(); rebuild(); });
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
