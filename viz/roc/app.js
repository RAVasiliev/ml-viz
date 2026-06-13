/* UI и отрисовка «Метрики классификации и ROC».
   Левый canvas: гистограммы скоров двух классов + перетаскиваемая линия порога.
   Правый canvas: ROC- или PR-кривая с текущей точкой + матрица ошибок.
   «Запуск» прогоняет порог t от 1 к 0 — видно, как точка едет по ROC и как
   меняется компромисс полнота↔точность.                                  */
(function () {
  "use strict";

  const COL0 = "#4f46e5";   // класс 0 (negative)
  const COL1 = "#ef4444";   // класс 1 (positive)
  const COL_OK = "#10b981"; // верный прогноз
  const COL_ERR = "#f59e0b";// ошибка
  const INK = "#14171c";
  const GRID = "rgba(20,23,28,.12)";
  const AXIS = "rgba(20,23,28,.30)";
  const FAINT = "rgba(20,23,28,.5)";

  const $ = (id) => document.getElementById(id);
  const canvas = $("canvas"), ctx = canvas.getContext("2d");
  const rcv = $("roc"), rctx = rcv.getContext("2d");

  const thrRange = $("threshold"), thrVal = $("thresholdVal");
  const sepRange = $("sep"), sepVal = $("sepVal");
  const balRange = $("balance"), balVal = $("balanceVal");
  const cntRange = $("count"), cntVal = $("countVal");
  const curveSel = $("curve");
  const curveLabel = $("curveLabel");
  const playBtn = $("play"), stepBtn = $("step"), resetBtn = $("reset"), regenBtn = $("regen");

  let data = null, roc = null, hist = null;
  let t = 0.5;
  let playing = false, lastT = 0, acc = 0, seed = 7;
  let dragging = false;
  let W = 0, H = 0, RW = 0, RH = 0;
  const PAD = 16;

  // ---------- размеры canvas (DPR + квадрат для правой панели) ----------
  function sizeCanvas(cv, c) {
    const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: r.width, h: r.height };
  }
  function resize() {
    const a = sizeCanvas(canvas, ctx); W = a.w; H = a.h;
    const b = sizeCanvas(rcv, rctx); RW = b.w; RH = b.h;
    render();
  }

  // ---------- данные ----------
  function regenData() {
    data = window.RocModel.generate(+cntRange.value, +balRange.value, +sepRange.value, seed);
    roc = window.RocModel.rocCurve(data);
    hist = window.RocModel.histogram(data, 34);
    updateStats();
    render();
  }
  // смена разделимости/баланса/числа — новые данные с тем же seed
  function rebuild() { regenData(); }

  // ---------- метрики ----------
  function currentMetrics() {
    const cm = window.RocModel.confusion(data, t);
    return { cm, m: window.RocModel.metrics(cm) };
  }
  function pct(x) { return (x * 100).toFixed(1) + "%"; }

  function updateStats() {
    const { m } = currentMetrics();
    $("statPrec").textContent = pct(m.precision);
    $("statRec").textContent = pct(m.recall);
    $("statSpec").textContent = pct(m.specificity);
    $("statF1").textContent = pct(m.f1);
    $("statAcc").textContent = pct(m.accuracy);
    $("statAuc").textContent = roc.auc.toFixed(3);
    stepBtn.disabled = false;
  }

  // ===================== ЛЕВАЯ ПАНЕЛЬ: гистограммы =====================
  function plotL() {
    const padL = 8, padR = 8, padT = 14, padB = 30;
    return { x0: padL, x1: W - padR, y0: padT, y1: H - padB };
  }
  const sx = (s) => { const p = plotL(); return p.x0 + s * (p.x1 - p.x0); };

  function renderHist() {
    ctx.clearRect(0, 0, W, H);
    if (!data) return;
    const p = plotL();
    const baseY = p.y1, topY = p.y0;
    const bw = (p.x1 - p.x0) / hist.nbins;
    const scale = (cnt) => (cnt / hist.maxCount) * (baseY - topY);
    const tx = sx(t);

    // ось score снизу
    ctx.strokeStyle = AXIS; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(p.x0, baseY + .5); ctx.lineTo(p.x1, baseY + .5); ctx.stroke();
    ctx.fillStyle = FAINT; ctx.font = "11px -apple-system, system-ui, sans-serif";
    ctx.textAlign = "center";
    for (let g = 0; g <= 1.0001; g += 0.25) {
      const gx = sx(g);
      ctx.strokeStyle = GRID; ctx.beginPath(); ctx.moveTo(gx, topY); ctx.lineTo(gx, baseY); ctx.stroke();
      ctx.fillStyle = FAINT; ctx.fillText(g.toFixed(2), gx, baseY + 16);
    }
    ctx.textAlign = "left";
    ctx.fillText("score →", p.x0 + 2, topY + 11);

    // столбцы: левая половина бара — класс 0, правая — класс 1 (для читаемости).
    // Заливка зависит от стороны относительно порога (верный/ошибочный прогноз).
    for (let b = 0; b < hist.nbins; b++) {
      const x = p.x0 + b * bw;
      const sMid = (b + 0.5) / hist.nbins;
      const predPos = sMid >= t;
      // класс 0
      const h0 = scale(hist.c0[b]);
      if (h0 > 0) {
        // верно если предсказан 0 (sMid < t), иначе ошибка (FP)
        ctx.fillStyle = predPos ? hexA(COL_ERR, .85) : hexA(COL0, .80);
        ctx.fillRect(x + 0.6, baseY - h0, bw / 2 - 0.8, h0);
      }
      // класс 1
      const h1 = scale(hist.c1[b]);
      if (h1 > 0) {
        // верно если предсказан 1 (sMid >= t), иначе ошибка (FN)
        ctx.fillStyle = predPos ? hexA(COL1, .80) : hexA(COL_ERR, .85);
        ctx.fillRect(x + bw / 2 + 0.2, baseY - h1, bw / 2 - 0.8, h1);
      }
    }

    // тонкие контурные «силуэты» классов поверх — чтобы распределения читались
    silhouette(hist.c0, COL0, p, baseY, topY, scale);
    silhouette(hist.c1, COL1, p, baseY, topY, scale);

    // линия порога
    ctx.strokeStyle = INK; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(tx, topY - 2); ctx.lineTo(tx, baseY); ctx.stroke();
    // ручка-захват
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.moveTo(tx, topY - 2); ctx.lineTo(tx - 5, topY - 10); ctx.lineTo(tx + 5, topY - 10); ctx.closePath();
    ctx.fill();
    // подпись порога
    ctx.fillStyle = INK; ctx.font = "600 11.5px -apple-system, system-ui, sans-serif";
    const label = "t = " + t.toFixed(2);
    ctx.textAlign = tx > W - 60 ? "right" : "left";
    ctx.fillText(label, ctx.textAlign === "right" ? tx - 7 : tx + 7, topY + 9);
    ctx.textAlign = "left";

    // подписи зон «← класс 0 / класс 1 →»
    ctx.fillStyle = hexA(COL0, .65); ctx.font = "11px -apple-system, system-ui, sans-serif";
    ctx.fillText("предсказан 0", p.x0 + 4, baseY - 4);
    ctx.fillStyle = hexA(COL1, .75); ctx.textAlign = "right";
    ctx.fillText("предсказан 1", p.x1 - 4, baseY - 4); ctx.textAlign = "left";
  }

  function silhouette(counts, col, p, baseY, topY, scale) {
    const bw = (p.x1 - p.x0) / counts.length;
    ctx.strokeStyle = hexA(col, .9); ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let b = 0; b < counts.length; b++) {
      const x = p.x0 + (b + 0.5) * bw;
      const y = baseY - scale(counts[b]);
      if (b === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // ===================== ПРАВАЯ ПАНЕЛЬ: ROC / PR + матрица =====================
  function plotR() {
    // квадратная область графика слева, матрица ошибок — справа от неё.
    // Резервируем колонку под матрицу (~150px), чтобы она помещалась и на узких
    // экранах; если ширины совсем мало — матрицу рисуем компактнее/скрываем.
    const padT = 14, padB = 34, padL = 38;
    const avail = RH - padT - padB;
    const reserve = RW > 520 ? 168 : RW * 0.34;     // ширина под матрицу + зазор
    const byW = Math.max(120, RW - padL - reserve);
    const size = Math.min(avail, byW);
    return { x0: padL, y0: padT, size, x1: padL + size, y1: padT + size, padB };
  }

  function renderRoc() {
    rctx.clearRect(0, 0, RW, RH);
    if (!data) return;
    const isPR = curveSel.value === "pr";
    const p = plotR();
    const X0 = p.x0, Y1 = p.y1, S = p.size;
    // оси: x∈[0,1] слева-направо, y∈[0,1] снизу-вверх
    const px = (vx) => X0 + vx * S;
    const py = (vy) => Y1 - vy * S;

    // сетка
    rctx.strokeStyle = GRID; rctx.lineWidth = 1;
    for (let g = 0; g <= 1.0001; g += 0.25) {
      rctx.beginPath(); rctx.moveTo(px(g), py(0)); rctx.lineTo(px(g), py(1)); rctx.stroke();
      rctx.beginPath(); rctx.moveTo(px(0), py(g)); rctx.lineTo(px(1), py(g)); rctx.stroke();
    }
    // оси
    rctx.strokeStyle = AXIS; rctx.lineWidth = 1.2;
    rctx.beginPath(); rctx.moveTo(px(0), py(0)); rctx.lineTo(px(1), py(0)); rctx.stroke();
    rctx.beginPath(); rctx.moveTo(px(0), py(0)); rctx.lineTo(px(0), py(1)); rctx.stroke();
    // подписи осей
    rctx.fillStyle = FAINT; rctx.font = "11px -apple-system, system-ui, sans-serif";
    rctx.textAlign = "center";
    rctx.fillText("0", px(0), py(0) + 15);
    rctx.fillText("1", px(1), py(0) + 15);
    rctx.fillText(isPR ? "Recall" : "FPR (1 − specificity)", px(0.5), py(0) + 28);
    rctx.save();
    rctx.translate(X0 - 26, py(0.5)); rctx.rotate(-Math.PI / 2);
    rctx.fillText(isPR ? "Precision" : "TPR (recall)", 0, 0);
    rctx.restore();
    rctx.textAlign = "left";

    if (isPR) {
      // базовая линия PR = доля положительных
      const base = data.nPos / (data.nPos + data.nNeg);
      rctx.strokeStyle = hexA(INK, .25); rctx.lineWidth = 1; rctx.setLineDash([5, 4]);
      rctx.beginPath(); rctx.moveTo(px(0), py(base)); rctx.lineTo(px(1), py(base)); rctx.stroke();
      rctx.setLineDash([]);
      // PR-кривая: по recall возрастанию
      const prPts = roc.pts.slice().sort((a, b) => a.recall - b.recall);
      rctx.strokeStyle = COL0; rctx.lineWidth = 2.2;
      rctx.beginPath();
      let started = false;
      for (const pt of prPts) {
        if (pt.tp + pt.fp === 0) continue;
        const X = px(pt.recall), Yp = py(pt.precision);
        if (!started) { rctx.moveTo(X, Yp); started = true; } else rctx.lineTo(X, Yp);
      }
      rctx.stroke();
    } else {
      // диагональ случайного классификатора
      rctx.strokeStyle = hexA(INK, .22); rctx.lineWidth = 1; rctx.setLineDash([5, 4]);
      rctx.beginPath(); rctx.moveTo(px(0), py(0)); rctx.lineTo(px(1), py(1)); rctx.stroke();
      rctx.setLineDash([]);
      // заливка под ROC (AUC)
      rctx.fillStyle = hexA(COL0, .10);
      rctx.beginPath(); rctx.moveTo(px(0), py(0));
      for (const pt of roc.pts) rctx.lineTo(px(pt.fpr), py(pt.tpr));
      rctx.lineTo(px(1), py(0)); rctx.closePath(); rctx.fill();
      // линия ROC
      rctx.strokeStyle = COL0; rctx.lineWidth = 2.2;
      rctx.beginPath();
      roc.pts.forEach((pt, i) => { const X = px(pt.fpr), Yp = py(pt.tpr); i === 0 ? rctx.moveTo(X, Yp) : rctx.lineTo(X, Yp); });
      rctx.stroke();
    }

    // текущая точка (по текущему порогу t)
    const cur = currentMetrics().m;
    const cx = isPR ? px(cur.recall) : px(cur.fpr);
    const cy = isPR ? py(cur.precision) : py(cur.tpr);
    rctx.fillStyle = "#fff"; rctx.strokeStyle = COL1; rctx.lineWidth = 2.5;
    rctx.beginPath(); rctx.arc(cx, cy, 5.5, 0, Math.PI * 2); rctx.fill(); rctx.stroke();

    // AUC-бейдж только для ROC
    if (!isPR) {
      rctx.fillStyle = INK; rctx.font = "600 12px -apple-system, system-ui, sans-serif";
      rctx.fillText("AUC = " + roc.auc.toFixed(3), px(0.30), py(0.16));
    }

    // ---------- матрица ошибок справа ----------
    renderConfusion(p);
  }

  function renderConfusion(p) {
    const { cm } = currentMetrics();
    const mx0 = p.x1 + 34;
    const mw = RW - mx0 - 14;
    if (mw < 90) return;                       // мало места — пропустить
    const cell = Math.min(mw / 2, 56);
    const my0 = p.y0 + 26;
    const grid = cell * 2;

    rctx.fillStyle = INK; rctx.font = "600 12px -apple-system, system-ui, sans-serif";
    rctx.textAlign = "left";
    rctx.fillText("Матрица ошибок", mx0, p.y0 + 8);
    rctx.fillStyle = FAINT; rctx.font = "10px -apple-system, system-ui, sans-serif";
    rctx.textAlign = "center";
    rctx.fillText("предсказание →", mx0 + grid / 2, p.y0 + 21);

    const cells = [
      { r: 0, c: 0, v: cm.TP, name: "TP", ok: true },
      { r: 0, c: 1, v: cm.FN, name: "FN", ok: false },
      { r: 1, c: 0, v: cm.FP, name: "FP", ok: false },
      { r: 1, c: 1, v: cm.TN, name: "TN", ok: true },
    ];
    for (const c of cells) {
      const x = mx0 + c.c * cell, y = my0 + c.r * cell;
      rctx.fillStyle = c.ok ? hexA(COL_OK, .16) : hexA(COL_ERR, .18);
      rctx.fillRect(x, y, cell - 2, cell - 2);
      rctx.strokeStyle = c.ok ? hexA(COL_OK, .55) : hexA(COL_ERR, .6);
      rctx.lineWidth = 1.2; rctx.strokeRect(x + .5, y + .5, cell - 3, cell - 3);
      rctx.fillStyle = INK; rctx.font = "700 16px -apple-system, system-ui, sans-serif";
      rctx.textAlign = "center"; rctx.textBaseline = "middle";
      rctx.fillText(String(c.v), x + (cell - 2) / 2, y + (cell - 2) / 2 - 5);
      rctx.fillStyle = c.ok ? "#0f9d58" : "#b45309"; rctx.font = "600 10px -apple-system, system-ui, sans-serif";
      rctx.fillText(c.name, x + (cell - 2) / 2, y + (cell - 2) / 2 + 11);
    }
    rctx.textBaseline = "alphabetic";

    // подписи строк (факт): класс 1 / класс 0
    rctx.save();
    rctx.translate(mx0 - 8, my0 + cell);
    rctx.rotate(-Math.PI / 2);
    rctx.fillStyle = FAINT; rctx.font = "10px -apple-system, system-ui, sans-serif";
    rctx.textAlign = "center"; rctx.fillText("факт →", 0, 0);
    rctx.restore();

    rctx.fillStyle = hexA(COL1, .85); rctx.font = "10px -apple-system, system-ui, sans-serif";
    rctx.textAlign = "right"; rctx.fillText("1", mx0 - 2, my0 + cell * 0.5 + 3);
    rctx.fillStyle = hexA(COL0, .85);
    rctx.fillText("0", mx0 - 2, my0 + cell * 1.5 + 3);
    rctx.textAlign = "center"; rctx.fillStyle = FAINT;
    rctx.fillText("1", mx0 + cell * 0.5, my0 + grid + 13);
    rctx.fillText("0", mx0 + cell * 1.5, my0 + grid + 13);

    // подпись текущей точки под матрицей
    const m = currentMetrics().m;
    rctx.fillStyle = FAINT; rctx.font = "10.5px -apple-system, system-ui, sans-serif";
    rctx.textAlign = "left";
    const ly = my0 + grid + 30;
    if (ly < RH - 8) {
      rctx.fillText("TPR=" + m.tpr.toFixed(2) + "  FPR=" + m.fpr.toFixed(2), mx0, ly);
      if (ly + 14 < RH - 2) rctx.fillText("prec=" + m.precision.toFixed(2) + "  rec=" + m.recall.toFixed(2), mx0, ly + 14);
    }
  }

  // ---------- helpers ----------
  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  function render() { renderHist(); renderRoc(); }

  // ---------- проигрывание: порог едет от 1 к 0 ----------
  function play() {
    if (t <= 0.0005) t = 1;            // повторный запуск после завершения
    playing = true; acc = 0; updatePlayBtn();
  }
  function pause() { playing = false; updatePlayBtn(); }
  function togglePlay() { playing ? pause() : play(); }
  function updatePlayBtn() {
    playBtn.innerHTML = playing
      ? '<svg width="13" height="13" viewBox="0 0 12 12"><rect x="2" y="1.5" width="3" height="9" rx="1" fill="currentColor"/><rect x="7" y="1.5" width="3" height="9" rx="1" fill="currentColor"/></svg> Пауза'
      : '<svg width="13" height="13" viewBox="0 0 12 12"><path d="M3 1.5l7 4.5-7 4.5z" fill="currentColor"/></svg> Запуск';
  }
  function setThreshold(v, fromUser) {
    t = Math.max(0, Math.min(1, v));
    thrRange.value = t.toFixed(3);
    thrVal.textContent = t.toFixed(2);
    if (fromUser) pause();
    updateStats();
  }
  function stepThreshold() {
    pause();
    setThreshold(t - 0.05);
  }

  function loop(ts) {
    requestAnimationFrame(loop);
    if (!lastT) lastT = ts;
    const dt = ts - lastT; lastT = ts;
    if (playing) {
      acc += dt;
      const interval = 22;                 // мс на шаг порога
      while (acc >= interval && playing) {
        t -= 0.006;
        acc -= interval;
        if (t <= 0) { t = 0; pause(); break; }
      }
      thrRange.value = t.toFixed(3);
      thrVal.textContent = t.toFixed(2);
      updateStats();
    }
    render();
  }

  // ---------- ввод ----------
  function syncLabels() {
    thrVal.textContent = (+thrRange.value).toFixed(2);
    sepVal.textContent = (+sepRange.value).toFixed(2);
    balVal.textContent = (+balRange.value).toFixed(2);
    cntVal.textContent = cntRange.value;
  }

  thrRange.addEventListener("input", () => setThreshold(+thrRange.value, true));
  sepRange.addEventListener("input", () => { syncLabels(); rebuild(); });
  balRange.addEventListener("input", () => { syncLabels(); rebuild(); });
  cntRange.addEventListener("input", () => { syncLabels(); rebuild(); });
  curveSel.addEventListener("change", () => {
    curveLabel.textContent = curveSel.value === "pr"
      ? "Precision–Recall · точка — текущий порог · пунктир — доля положительных"
      : "ROC-кривая · точка — текущий порог · диагональ — случайный классификатор";
    render();
  });
  playBtn.addEventListener("click", togglePlay);
  stepBtn.addEventListener("click", stepThreshold);
  resetBtn.addEventListener("click", () => { setThreshold(0.5, true); });
  regenBtn.addEventListener("click", () => { seed = (seed * 1103515245 + 12345) >>> 0; regenData(); });

  // перетаскивание порога мышью по левому canvas
  function pointerToThreshold(clientX) {
    const rect = canvas.getBoundingClientRect();
    const p = plotL();
    const v = (clientX - rect.left - p.x0) / (p.x1 - p.x0);
    return Math.max(0, Math.min(1, v));
  }
  canvas.addEventListener("mousedown", (e) => { dragging = true; pause(); setThreshold(pointerToThreshold(e.clientX), true); });
  window.addEventListener("mousemove", (e) => { if (dragging) setThreshold(pointerToThreshold(e.clientX), true); });
  window.addEventListener("mouseup", () => { dragging = false; });
  // тач
  canvas.addEventListener("touchstart", (e) => { if (e.touches[0]) { dragging = true; pause(); setThreshold(pointerToThreshold(e.touches[0].clientX), true); } }, { passive: true });
  canvas.addEventListener("touchmove", (e) => { if (dragging && e.touches[0]) setThreshold(pointerToThreshold(e.touches[0].clientX), true); }, { passive: true });
  window.addEventListener("touchend", () => { dragging = false; });

  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "SELECT" || e.target.tagName === "INPUT") return;
    if (e.code === "Space") { e.preventDefault(); togglePlay(); }
    else if (e.code === "ArrowRight") { stepThreshold(); }
    else if (e.code === "ArrowLeft") { pause(); setThreshold(t + 0.05); }
    else if (e.key === "r" || e.key === "R" || e.key === "к" || e.key === "К") setThreshold(0.5, true);
    else if (e.key === "n" || e.key === "N" || e.key === "т" || e.key === "Т") { seed = (seed * 1103515245 + 12345) >>> 0; regenData(); }
  });
  window.addEventListener("resize", resize);

  syncLabels();
  updatePlayBtn();
  resize();
  regenData();
  requestAnimationFrame(loop);
})();
