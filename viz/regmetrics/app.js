/* UI и отрисовка «Метрик регрессии»: облако точек вокруг прямой с одним
   управляемым выбросом, линии OLS (min MSE) и робастная (min MAE), остатки,
   и бар-чарт метрик MAE/MSE/RMSE/R²/MAPE (точные формулы недели 1).
   Выброс можно тащить мышью или ползунками; «Запуск» гонит его снизу вверх. */
(function () {
  "use strict";

  const ACCENT = "#4f46e5";   // OLS / точки
  const RED = "#ef4444";      // остатки
  const GREEN = "#10b981";    // линия MAE
  const AMBER = "#f59e0b";    // выброс
  const FAINT = "#8a93a3";

  const $ = (id) => document.getElementById(id);
  const canvas = $("canvas"), ctx = canvas.getContext("2d");
  const barCv = $("bars"), bctx = barCv.getContext("2d");

  const pointsRange = $("points"), pointsVal = $("pointsVal");
  const noiseRange = $("noise"), noiseVal = $("noiseVal");
  const outYRange = $("outY"), outYVal = $("outYVal");
  const outXRange = $("outX"), outXVal = $("outXVal");
  const maeToggle = $("maeToggle");
  const playBtn = $("play"), stepBtn = $("step"), resetBtn = $("reset"), regenBtn = $("regen");

  const PAD = 18;
  let W = 0, H = 0, BW = 0, BH = 0;
  let seed = 7;
  let base = null;          // базовая выборка без выброса {points, outlierIndex, trueLine}
  let pts = [];             // текущая выборка (с применённым выбросом)
  let oi = 0;               // индекс точки-выброса
  let playing = false, lastT = 0;
  let dragging = false;

  // экранная рамка по данным: x ∈ [0,1] фиксирован, y — динамический (под выброс)
  let view = { ymin: 0, ymax: 1 };

  /* ---------- геометрия canvas (DPR + квадрат) ---------- */
  function plot() { const size = Math.min(W, H) - 2 * PAD; return { size, ox: (W - size) / 2, oy: (H - size) / 2 }; }
  const toPX = (x) => { const p = plot(); return p.ox + x * p.size; };
  const toPY = (y) => {
    const p = plot();
    const t = (y - view.ymin) / (view.ymax - view.ymin || 1);
    return p.oy + (1 - t) * p.size;     // y растёт вверх
  };
  const fromPX = (px) => { const p = plot(); return (px - p.ox) / (p.size || 1); };
  const fromPY = (py) => { const p = plot(); const t = 1 - (py - p.oy) / (p.size || 1); return view.ymin + t * (view.ymax - view.ymin); };

  function sizeCanvas(cv, c) {
    const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    c.setTransform(dpr, 0, 0, dpr, 0, 0); return { w: r.width, h: r.height };
  }
  function resize() {
    const a = sizeCanvas(canvas, ctx); W = a.w; H = a.h;
    const b = sizeCanvas(barCv, bctx); BW = b.w; BH = b.h;
    render();
  }

  /* ---------- данные ---------- */
  function regenData() {
    base = window.RegMetrics.generate(+pointsRange.value, +noiseRange.value / 100, seed);
    oi = base.outlierIndex;
    pause();
    applyOutlier();
  }

  // строим текущую выборку: копия базовой + позиция выброса из ползунков outX/outY
  function applyOutlier() {
    if (!base) return;
    pts = base.points.map((p) => ({ x: p.x, y: p.y }));
    const ox = +outXRange.value / 100;
    const dy = +outYRange.value / 10;                 // сдвиг по y от истинной линии, в единицах таргета
    const tp = base.trueLine;
    oi = Math.min(pts.length - 1, Math.max(0, oi));
    if (pts.length) pts[oi] = { x: ox, y: tp.a * ox + tp.b + dy };
    autoView();
    render();
    updateStats();
  }

  // подбираем вертикальный масштаб под все точки и истинную линию, с небольшим запасом
  function autoView() {
    let lo = Infinity, hi = -Infinity;
    for (const p of pts) { if (p.y < lo) lo = p.y; if (p.y > hi) hi = p.y; }
    const tp = base.trueLine;
    for (const x of [0, 1]) { const y = tp.a * x + tp.b; if (y < lo) lo = y; if (y > hi) hi = y; }
    if (!isFinite(lo) || !isFinite(hi)) { lo = 0; hi = 1; }
    if (hi - lo < 1e-6) { hi += 0.5; lo -= 0.5; }
    const pad = (hi - lo) * 0.10;
    view.ymin = lo - pad; view.ymax = hi + pad;
  }

  /* ---------- метрики и линии ---------- */
  function compute() {
    const ols = window.RegMetrics.fitOLS(pts);
    const lad = window.RegMetrics.fitLAD(pts);
    const m = window.RegMetrics.metrics(pts, ols);     // метрики считаем относительно OLS-предсказания
    return { ols, lad, m };
  }
  // метрики «эталонной» (базовой, без выброса) выборки — для нормировки баров
  function baselineMetrics() {
    const bp = base.points;
    const ols = window.RegMetrics.fitOLS(bp);
    return window.RegMetrics.metrics(bp, ols);
  }

  /* ---------- отрисовка поля ---------- */
  function lineY(line, x) { return line.a * x + line.b; }

  function render() {
    ctx.clearRect(0, 0, W, H);
    if (!pts.length) { renderBars(null, null); return; }
    const { ols, lad, m } = compute();

    // остатки от OLS (вертикальные отрезки точка → линия)
    ctx.lineWidth = 1.4; ctx.strokeStyle = "rgba(239,68,68,.40)";
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const yhat = lineY(ols, p.x);
      ctx.beginPath();
      ctx.moveTo(toPX(p.x), toPY(p.y));
      ctx.lineTo(toPX(p.x), toPY(yhat));
      ctx.stroke();
    }

    // истинная линия (серый пунктир)
    drawLine(base.trueLine, FAINT, 2, [5, 4]);
    // робастная линия по MAE (зелёный пунктир) — опционально
    if (maeToggle.value === "on") drawLine(lad, GREEN, 2.4, [6, 4]);
    // OLS — минимум MSE (сплошной акцент)
    drawLine(ols, ACCENT, 3, null);

    // точки выборки
    for (let i = 0; i < pts.length; i++) {
      if (i === oi) continue;
      const p = pts[i];
      ctx.beginPath(); ctx.arc(toPX(p.x), toPY(p.y), 3.8, 0, Math.PI * 2);
      ctx.fillStyle = ACCENT; ctx.fill();
    }
    // выброс — крупная оранжевая точка с гало
    if (pts[oi]) {
      const px = toPX(pts[oi].x), py = toPY(pts[oi].y);
      ctx.beginPath(); ctx.arc(px, py, 9, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(245,158,11,.22)"; ctx.fill();
      ctx.beginPath(); ctx.arc(px, py, 5.2, 0, Math.PI * 2);
      ctx.fillStyle = AMBER; ctx.fill();
      ctx.lineWidth = 1.6; ctx.strokeStyle = "#fff"; ctx.stroke();
    }

    renderBars(m, baselineMetrics());
  }

  function drawLine(line, color, width, dash) {
    // рисуем по краям видимой области x ∈ [0,1], отсекая по рамке canvas не требуется
    ctx.save();
    ctx.lineWidth = width; ctx.strokeStyle = color;
    ctx.setLineDash(dash || []);
    ctx.beginPath();
    ctx.moveTo(toPX(0), toPY(lineY(line, 0)));
    ctx.lineTo(toPX(1), toPY(lineY(line, 1)));
    ctx.stroke();
    ctx.restore();
  }

  /* ---------- бар-чарт метрик ----------
     Высоту бара берём как отношение метрики к её базовому значению (без выброса),
     обрезая по разумному потолку — так наглядно, что MSE/RMSE взлетают, а MAE нет.
     Под каждым баром — подпись и абсолютное число. R²/MAPE рисуем своими шкалами. */
  function renderBars(m, m0) {
    bctx.clearRect(0, 0, BW, BH);
    if (!m) return;

    const items = [
      { key: "MAE", val: m.mae, ratio: ratio(m.mae, m0.mae), color: GREEN },
      { key: "MSE", val: m.mse, ratio: ratio(m.mse, m0.mse), color: ACCENT },
      { key: "RMSE", val: m.rmse, ratio: ratio(m.rmse, m0.rmse), color: ACCENT },
      { key: "R²", val: m.r2, ratio: r2Bar(m.r2), color: "#0ea5e9", fmt: (v) => v.toFixed(3) },
      { key: "MAPE", val: m.mape, ratio: ratio(m.mape, m0.mape), color: AMBER, fmt: (v) => v.toFixed(1) + "%" },
    ];

    const padL = 12, padR = 12, padTop = 14, padBot = 30;
    const innerW = BW - padL - padR;
    const innerH = BH - padTop - padBot;
    const slot = innerW / items.length;
    const bw = Math.min(46, slot * 0.56);
    const baseY = BH - padBot;

    // пунктир «×1» — уровень базовой метрики (для масштабных баров)
    const oneY = baseY - clamp01(1 / MAXR) * innerH;
    bctx.strokeStyle = "rgba(20,23,28,.14)"; bctx.lineWidth = 1; bctx.setLineDash([4, 4]);
    bctx.beginPath(); bctx.moveTo(padL, oneY); bctx.lineTo(BW - padR, oneY); bctx.stroke();
    bctx.setLineDash([]);
    bctx.fillStyle = "rgba(20,23,28,.32)"; bctx.font = "10px " + monoFont();
    bctx.textAlign = "left"; bctx.fillText("×1", BW - padR - 16, oneY - 3);

    bctx.textAlign = "center";
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const cx = padL + slot * (i + 0.5);
      const h = clamp01(it.ratio) * innerH;
      const y = baseY - h;
      // бар
      roundRect(bctx, cx - bw / 2, y, bw, h, 4);
      bctx.fillStyle = it.color; bctx.fill();
      // значение сверху
      bctx.fillStyle = "#14171c"; bctx.font = "600 11.5px " + monoFont();
      const txt = it.fmt ? it.fmt(it.val) : fmtNum(it.val);
      bctx.fillText(txt, cx, Math.max(y - 5, padTop + 8));
      // подпись метрики
      bctx.fillStyle = "#5b6472"; bctx.font = "11px " + uiFont();
      bctx.fillText(it.key, cx, BH - 11);
    }
  }

  const MAXR = 6;   // потолок отношения для баров (6× от базовой метрики)
  function ratio(v, v0) { if (!(v0 > 1e-9)) return v > 1e-9 ? MAXR : 0; return v / v0; }
  function clamp01(x) { return Math.max(0, Math.min(1, x / MAXR)); }
  // R²: рисуем «заполненность» от 0 (низ) до 1 (верх), отрицательный R² — пустой бар
  function r2Bar(r2) { return Math.max(0, Math.min(1, r2)) * MAXR; }

  function roundRect(c, x, y, w, h, r) {
    if (h < 0.5) { c.beginPath(); c.rect(x, y, w, 0.5); return; }
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.arcTo(x + w, y, x + w, y + r, r);
    c.lineTo(x + w, y + h); c.lineTo(x, y + h); c.lineTo(x, y + r); c.arcTo(x, y, x + r, y, r);
    c.closePath();
  }
  function monoFont() { return 'ui-monospace, "SF Mono", Menlo, Consolas, monospace'; }
  function uiFont() { return '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'; }
  function fmtNum(v) {
    const a = Math.abs(v);
    if (a >= 100) return v.toFixed(0);
    if (a >= 10) return v.toFixed(1);
    if (a >= 1) return v.toFixed(2);
    return v.toFixed(3);
  }

  /* ---------- статистика-плитки ---------- */
  function updateStats() {
    if (!pts.length) return;
    const { ols, m } = compute();
    $("statMAE").textContent = fmtNum(m.mae);
    $("statMSE").textContent = fmtNum(m.mse);
    $("statRMSE").textContent = fmtNum(m.rmse);
    $("statR2").textContent = m.r2.toFixed(3);
    $("statMAPE").textContent = m.mape.toFixed(1) + "%";
    // абсолютная ошибка самого выброса от OLS-линии: |yᵢ − ŷᵢ|
    const p = pts[oi];
    const err = p ? Math.abs(p.y - (ols.a * p.x + ols.b)) : 0;
    $("statErr").textContent = fmtNum(err);
  }

  /* ---------- авто-проводка выброса (play) ---------- */
  function play() {
    // если выброс уже у потолка — начнём снизу
    if (+outYRange.value >= +outYRange.max) outYRange.value = +outYRange.min;
    playing = true; updatePlayBtn();
  }
  function pause() { playing = false; updatePlayBtn(); }
  function togglePlay() { playing ? pause() : play(); }
  function updatePlayBtn() {
    playBtn.innerHTML = playing
      ? '<svg width="13" height="13" viewBox="0 0 12 12"><rect x="2" y="1.5" width="3" height="9" rx="1" fill="currentColor"/><rect x="7" y="1.5" width="3" height="9" rx="1" fill="currentColor"/></svg> Пауза'
      : '<svg width="13" height="13" viewBox="0 0 12 12"><path d="M3 1.5l7 4.5-7 4.5z" fill="currentColor"/></svg> Запуск';
  }
  function stepOutlier() {
    const next = Math.min(+outYRange.max, +outYRange.value + 2);
    outYRange.value = next; syncLabels(); applyOutlier();
  }

  function loop(t) {
    requestAnimationFrame(loop);
    if (!lastT) lastT = t;
    const dt = t - lastT; lastT = t;
    if (playing) {
      const speed = 22;                       // единиц ползунка в секунду
      let v = +outYRange.value + speed * (dt / 1000);
      if (v >= +outYRange.max) { v = +outYRange.max; pause(); }
      outYRange.value = v; syncLabels(); applyOutlier();
    }
  }

  /* ---------- перетаскивание выброса мышью ---------- */
  function hitOutlier(px, py) {
    if (!pts[oi]) return false;
    const dx = px - toPX(pts[oi].x), dy = py - toPY(pts[oi].y);
    return dx * dx + dy * dy <= 13 * 13;
  }
  function pointerPos(e) {
    const r = canvas.getBoundingClientRect();
    return { px: e.clientX - r.left, py: e.clientY - r.top };
  }
  canvas.addEventListener("pointerdown", (e) => {
    const { px, py } = pointerPos(e);
    if (hitOutlier(px, py)) {
      dragging = true; pause();
      canvas.setPointerCapture(e.pointerId);
      moveOutlierTo(px, py);
    }
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const { px, py } = pointerPos(e);
    moveOutlierTo(px, py);
  });
  function endDrag(e) { if (dragging) { dragging = false; try { canvas.releasePointerCapture(e.pointerId); } catch (_) {} } }
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  // перевод позиции курсора → ползунки outX/outY (через сдвиг от истинной линии)
  function moveOutlierTo(px, py) {
    const x = Math.max(0.02, Math.min(0.98, fromPX(px)));
    const y = fromPY(py);
    const tp = base.trueLine;
    const dy = y - (tp.a * x + tp.b);
    outXRange.value = Math.round(x * 100);
    // ограничиваем dy диапазоном ползунка, но даём перетащить шире за счёт авто-вью
    let dySlider = Math.round(dy * 10);
    dySlider = Math.max(+outYRange.min, Math.min(+outYRange.max, dySlider));
    outYRange.value = dySlider;
    syncLabels(); applyOutlier();
  }

  /* ---------- лейблы и сброс ---------- */
  function syncLabels() {
    pointsVal.textContent = pointsRange.value;
    noiseVal.textContent = (+noiseRange.value / 100).toFixed(2);
    const dy = +outYRange.value / 10;
    outYVal.textContent = (dy >= 0 ? "+" : "") + dy.toFixed(1);
    outXVal.textContent = (+outXRange.value / 100).toFixed(2);
  }
  function resetOutlier() {
    pause();
    outYRange.value = 0; outXRange.value = 50;
    syncLabels(); applyOutlier();
  }

  /* ---------- события ---------- */
  pointsRange.addEventListener("input", () => { syncLabels(); regenData(); });
  noiseRange.addEventListener("input", () => { syncLabels(); regenData(); });
  outYRange.addEventListener("input", () => { pause(); syncLabels(); applyOutlier(); });
  outXRange.addEventListener("input", () => { pause(); syncLabels(); applyOutlier(); });
  maeToggle.addEventListener("change", render);
  playBtn.addEventListener("click", togglePlay);
  stepBtn.addEventListener("click", () => { pause(); stepOutlier(); });
  resetBtn.addEventListener("click", resetOutlier);
  regenBtn.addEventListener("click", () => { seed = (seed * 1103515245 + 12345) >>> 0; regenData(); });

  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "SELECT" || e.target.tagName === "INPUT") return;
    if (e.code === "Space") { e.preventDefault(); togglePlay(); }
    else if (e.code === "ArrowRight") { pause(); stepOutlier(); }
    else if (e.key === "r" || e.key === "R" || e.key === "к" || e.key === "К") resetOutlier();
    else if (e.key === "n" || e.key === "N" || e.key === "т" || e.key === "Т") { seed = (seed * 1103515245 + 12345) >>> 0; regenData(); }
  });
  window.addEventListener("resize", resize);

  updatePlayBtn();
  syncLabels();
  resize();
  regenData();
  requestAnimationFrame(loop);
})();
