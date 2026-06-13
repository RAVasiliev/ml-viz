/* UI и отрисовка градиентного спуска: рельеф L(x,y) (heatmap + изолинии) +
   траектория спуска. Логика и градиенты — в gd.js. */
(function () {
  "use strict";

  const ACCENT = "#4f46e5";   // траектория
  const CUR = "#ef4444";      // текущая точка
  const MIN = "#10b981";      // минимум функции
  const $ = (id) => document.getElementById(id);

  const canvas = $("canvas"), ctx = canvas.getContext("2d");

  const funcSel = $("func"), funcNote = $("funcNote");
  const lrRange = $("lr"), lrVal = $("lrVal");
  const methodSel = $("method");
  const betaCtrl = $("betaCtrl"), betaRange = $("beta"), betaVal = $("betaVal");
  const speedRange = $("speed"), speedVal = $("speedVal");
  const playBtn = $("play"), stepBtn = $("step"), resetBtn = $("reset"), regenBtn = $("regen");
  const progressBar = $("progressBar");
  const methTag = $("methTag"), formulaEl = $("formula");

  let fn = null;            // текущая функция потерь (объект из GD.funcs)
  let gd = null;            // текущий степпер
  let start = null;         // стартовая точка в координатах функции {u,v}
  let bestL = Infinity;     // минимальное L вдоль пути
  let playing = false, acc = 0, lastT = 0, seed = 7;
  let W = 0, H = 0;
  const PAD = 16;

  // ---- кэш рельефа: поле + сетка значений L (для heatmap и изолиний) ----
  let fieldCanvas = null;   // offscreen с залитым heatmap'ом
  let grid = null;          // {N, vals, lmin, lmax} — значения L на сетке поля
  const GRIDN = 160;        // разрешение сетки значений (для изолиний)
  const HEATN = 200;        // разрешение heatmap (пиксели offscreen)

  // ---- формулы для подписи ----
  const FORMULA = {
    bowl: "L = x² + 4y²",
    rosen: "L = (1−x)² + 100(y−x²)²",
    saddle: "L = x² − y² + 0.3y⁴",
    twowells: "L = (x²−1)² + 0.5y² + 0.35x",
  };

  GD.list.forEach((f) => {
    const o = document.createElement("option");
    o.value = f.id; o.textContent = f.name; funcSel.appendChild(o);
  });
  funcSel.value = "rosen";

  /* ---------- геометрия поля (как в эталоне: квадрат min(W,H)) ---------- */
  function plot() {
    const size = Math.min(W, H) - 2 * PAD;
    return { size, ox: (W - size) / 2, oy: (H - size) / 2 };
  }
  // нормированные [0,1] -> пиксели поля
  const toPX = (nx) => { const p = plot(); return p.ox + nx * p.size; };
  const toPY = (ny) => { const p = plot(); return p.oy + ny * p.size; };

  /* ---- маппинг координат ФУНКЦИИ (u,v) <-> нормированные поля (nx,ny).
     Ось v переворачивается: большое v рисуем сверху, чтобы «вниз = меньше v».
     Берём ny так, что v=vmax -> ny=0 (верх), v=vmin -> ny=1 (низ). ---- */
  function uvToNorm(u, v) {
    const d = fn.domain;
    const nx = (u - d.umin) / (d.umax - d.umin);
    const ny = (d.vmax - v) / (d.vmax - d.vmin);
    return { nx, ny };
  }
  function normToUV(nx, ny) {
    const d = fn.domain;
    const u = d.umin + nx * (d.umax - d.umin);
    const v = d.vmax - ny * (d.vmax - d.vmin);
    return { u, v };
  }
  // координаты функции -> пиксели
  function uvToPX(u, v) { const n = uvToNorm(u, v); return [toPX(n.nx), toPY(n.ny)]; }

  function sizeCanvas(cv, c) {
    const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(r.width * dpr);
    cv.height = Math.round(r.height * dpr);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: r.width, h: r.height };
  }
  function resize() {
    const a = sizeCanvas(canvas, ctx); W = a.w; H = a.h;
    buildField();
    render();
  }

  /* ----------------- learning rate: логарифмическая шкала -----------------
     Ползунок 0..100 -> η в [lrMin, lrMax] логарифмически. Диапазон зависит от
     функции (у Розенброка нужен очень малый η). По умолчанию ставим так,
     чтобы fn.lr0 попадал примерно в середину. */
  function lrRangeFor() {
    // широкий диапазон вокруг рекомендованного lr0 (×/÷ ~60)
    const lo = fn.lr0 / 60, hi = fn.lr0 * 14;
    return { lo, hi };
  }
  function sliderToLR() {
    const { lo, hi } = lrRangeFor();
    const t = +lrRange.value / 100;
    return lo * Math.pow(hi / lo, t);
  }
  function lrToSlider(lr) {
    const { lo, hi } = lrRangeFor();
    const t = Math.log(lr / lo) / Math.log(hi / lo);
    return Math.max(0, Math.min(100, Math.round(t * 100)));
  }
  function fmtLR(lr) {
    if (lr >= 0.01) return lr.toFixed(lr >= 1 ? 2 : 3);
    return lr.toExponential(1);
  }

  /* ------------------------- построение рельефа ------------------------- */
  function buildField() {
    if (!fn || W <= 0 || H <= 0) return;
    const p = plot();
    if (p.size <= 0) return;

    // 1) сетка значений L по нормированному полю (для изолиний и нормировки)
    const N = GRIDN;
    const vals = new Float64Array((N + 1) * (N + 1));
    let lmin = Infinity, lmax = -Infinity;
    for (let j = 0; j <= N; j++) {
      const ny = j / N;
      for (let i = 0; i <= N; i++) {
        const nx = i / N;
        const uv = normToUV(nx, ny);
        const L = fn.L(uv.u, uv.v);
        vals[j * (N + 1) + i] = L;
        if (L < lmin) lmin = L;
        if (L > lmax) lmax = L;
      }
    }
    grid = { N, vals, lmin, lmax };

    // 2) heatmap на offscreen-канвасе размером HEATN×HEATN
    const M = HEATN;
    if (!fieldCanvas) fieldCanvas = document.createElement("canvas");
    fieldCanvas.width = M; fieldCanvas.height = M;
    const fctx = fieldCanvas.getContext("2d");
    const img = fctx.createImageData(M, M);
    const dat = img.data;
    // логарифмическое сжатие динамики (у Розенброка огромный разброс L)
    const lo = lmin, span = Math.max(1e-9, lmax - lmin);
    for (let j = 0; j < M; j++) {
      const ny = j / (M - 1);
      for (let i = 0; i < M; i++) {
        const nx = i / (M - 1);
        const uv = normToUV(nx, ny);
        let L = fn.L(uv.u, uv.v);
        let t = (L - lo) / span;            // 0..1
        t = Math.log1p(9 * Math.max(0, Math.min(1, t))) / Math.log(10); // лог-сжатие
        const c = heatColor(t);
        const k = (j * M + i) * 4;
        dat[k] = c[0]; dat[k + 1] = c[1]; dat[k + 2] = c[2]; dat[k + 3] = 255;
      }
    }
    fctx.putImageData(img, 0, 0);
  }

  // палитра рельефа: тёмно-фиолетовый (низко=минимум) → светлый → тёплый (высоко).
  // Низкие L — насыщенный индиго #4f46e5; высокие — приглушённый янтарь.
  function heatColor(t) {
    t = Math.max(0, Math.min(1, t));
    // три опорные точки: индиго -> бледно-голубой -> янтарь
    const stops = [
      [0.00, [49, 46, 129]],    // #312e81 глубокий индиго (дно)
      [0.45, [199, 210, 254]],  // #c7d2fe светлый
      [0.72, [254, 243, 199]],  // #fef3c7 кремовый
      [1.00, [245, 158, 11]],   // #f59e0b янтарь (вершины)
    ];
    for (let s = 0; s < stops.length - 1; s++) {
      const a = stops[s], b = stops[s + 1];
      if (t >= a[0] && t <= b[0]) {
        const f = (t - a[0]) / (b[0] - a[0] || 1);
        return [
          Math.round(a[1][0] + f * (b[1][0] - a[1][0])),
          Math.round(a[1][1] + f * (b[1][1] - a[1][1])),
          Math.round(a[1][2] + f * (b[1][2] - a[1][2])),
        ];
      }
    }
    return stops[stops.length - 1][1];
  }

  /* ------------------------------ степпер ------------------------------ */
  function rebuild() {
    fn = GD.funcs[funcSel.value];
    if (!start) start = { u: fn.start.u, v: fn.start.v };
    gd = new GD.Stepper(fn, {
      lr: sliderToLR(),
      method: methodSel.value,
      beta: betaFromSlider(),
      start: { u: start.u, v: start.v },
    });
    bestL = gd.L;
    pause();
    updateStats();
    render();
  }

  function betaFromSlider() { return +betaRange.value / 100; }

  function doStep() {
    if (!gd || gd.done) return;
    gd.next();
    if (gd.L < bestL) bestL = gd.L;
    updateStats();
  }
  function stepsPerSec() { const t = (+speedRange.value - 1) / 99; return Math.round(1 + 90 * t * t); }

  function play() {
    if (!gd || gd.done) rebuild();
    playing = true; acc = 0; updatePlayBtn();
  }
  function pause() { playing = false; updatePlayBtn(); }
  function togglePlay() { playing ? pause() : play(); }
  function updatePlayBtn() {
    playBtn.innerHTML = playing
      ? '<svg width="13" height="13" viewBox="0 0 12 12"><rect x="2" y="1.5" width="3" height="9" rx="1" fill="currentColor"/><rect x="7" y="1.5" width="3" height="9" rx="1" fill="currentColor"/></svg> Пауза'
      : '<svg width="13" height="13" viewBox="0 0 12 12"><path d="M3 1.5l7 4.5-7 4.5z" fill="currentColor"/></svg> Запуск';
  }

  function fmtNum(x) {
    if (!isFinite(x)) return "∞";
    const a = Math.abs(x);
    if (a === 0) return "0";
    if (a >= 1000 || a < 0.001) return x.toExponential(1);
    if (a >= 10) return x.toFixed(1);
    return x.toFixed(3);
  }

  function updateStats() {
    if (!gd) return;
    const s = gd.stats();
    $("statStep").textContent = s.step;
    $("statL").textContent = fmtNum(s.L);
    $("statGrad").textContent = fmtNum(s.gnorm);
    $("statBest").textContent = fmtNum(bestL);

    // прогресс: грубо — насколько L приблизилось ко дну (по сетке)
    let prog = 0;
    if (grid) {
      const span = Math.max(1e-9, grid.lmax - grid.lmin);
      const t = (s.L - grid.lmin) / span;
      prog = Math.max(0, Math.min(1, 1 - t)) * 100;
    }
    progressBar.style.width = prog + "%";

    // бейдж состояния
    methTag.className = "meth-tag " +
      (s.diverged ? "diverged" : s.converged ? "converged" : s.step > 0 ? "running" : "idle");
    methTag.textContent = s.diverged ? "расходимость" :
      s.converged ? "сошёлся" :
      s.step > 0 ? (playing ? "идёт спуск…" : "пауза") : "старт задан";
    stepBtn.disabled = s.done;
  }

  /* ------------------------------ отрисовка ------------------------------ */
  function render() {
    ctx.clearRect(0, 0, W, H);
    if (!fn) return;
    const p = plot();
    if (p.size <= 0) return;

    // 1) heatmap рельефа (растягиваем offscreen на квадрат поля)
    if (fieldCanvas) {
      ctx.save();
      // мягкое скругление углов поля
      roundRectPath(ctx, p.ox, p.oy, p.size, p.size, 8);
      ctx.clip();
      ctx.imageSmoothingEnabled = true;
      ctx.globalAlpha = 0.92;
      ctx.drawImage(fieldCanvas, p.ox, p.oy, p.size, p.size);
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // 2) изолинии (контуры равного L)
    drawContours(p);

    // рамка поля
    ctx.strokeStyle = "rgba(20,23,28,.10)"; ctx.lineWidth = 1;
    roundRectPath(ctx, p.ox + .5, p.oy + .5, p.size - 1, p.size - 1, 8);
    ctx.stroke();

    // 3) минимумы функции
    for (const m of fn.minima) {
      const [mx, my] = uvToPX(m.u, m.v);
      if (!inField(mx, my, p)) continue;
      // звёздочка-крестик
      ctx.strokeStyle = MIN; ctx.lineWidth = 2.4; ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(mx - 6, my); ctx.lineTo(mx + 6, my);
      ctx.moveTo(mx, my - 6); ctx.lineTo(mx, my + 6);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(mx, my, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = MIN; ctx.fill();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.4; ctx.stroke();
    }

    // 4) траектория спуска
    if (gd && gd.path.length > 0) {
      // линия пути
      ctx.lineWidth = 2; ctx.strokeStyle = "rgba(79,70,229,.85)";
      ctx.lineJoin = "round";
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < gd.path.length; i++) {
        const [x, y] = uvToPX(gd.path[i].u, gd.path[i].v);
        const cx = Math.max(p.ox - 40, Math.min(p.ox + p.size + 40, x));
        const cy = Math.max(p.oy - 40, Math.min(p.oy + p.size + 40, y));
        if (!started) { ctx.moveTo(cx, cy); started = true; } else ctx.lineTo(cx, cy);
      }
      ctx.stroke();

      // точки пути (промежуточные — мелкие)
      for (let i = 0; i < gd.path.length; i++) {
        const [x, y] = uvToPX(gd.path[i].u, gd.path[i].v);
        if (!inField(x, y, p)) continue;
        const isLast = i === gd.path.length - 1;
        const isFirst = i === 0;
        if (isLast) continue; // текущую рисуем отдельно крупнее
        ctx.beginPath();
        ctx.arc(x, y, isFirst ? 3.4 : 2.0, 0, Math.PI * 2);
        ctx.fillStyle = isFirst ? "#fff" : "rgba(79,70,229,.9)";
        ctx.fill();
        if (isFirst) { ctx.lineWidth = 2; ctx.strokeStyle = ACCENT; ctx.stroke(); }
      }

      // текущая точка — крупная, красная, с гало
      const last = gd.path[gd.path.length - 1];
      const [lx, ly] = uvToPX(last.u, last.v);
      const cx = Math.max(p.ox + 2, Math.min(p.ox + p.size - 2, lx));
      const cy = Math.max(p.oy + 2, Math.min(p.oy + p.size - 2, ly));
      ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(239,68,68,.18)"; ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cy, 4.6, 0, Math.PI * 2);
      ctx.fillStyle = CUR; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = "#fff"; ctx.stroke();

      // стрелка антиградиента из текущей точки (направление шага)
      if (!gd.done && inField(lx, ly, p)) drawGradArrow(last, cx, cy, p);
    }
  }

  // стрелка −∇L (направление следующего шага), нормированной длины
  function drawGradArrow(last, cx, cy, p) {
    const g = fn.grad(last.u, last.v);
    const gn = Math.hypot(g[0], g[1]);
    if (gn < 1e-9) return;
    // направление в координатах функции -> в нормированные (учитываем переворот v)
    const d = fn.domain;
    let dx = -g[0] / (d.umax - d.umin);
    let dy = g[1] / (d.vmax - d.vmin); // v переворачивается, потому знак +
    const dl = Math.hypot(dx, dy);
    if (dl < 1e-12) return;
    const len = 26;
    const ex = cx + (dx / dl) * len, ey = cy + (dy / dl) * len;
    ctx.strokeStyle = "rgba(20,23,28,.55)"; ctx.lineWidth = 1.6; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ex, ey); ctx.stroke();
    // наконечник
    const ang = Math.atan2(ey - cy, ex - cx);
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - 6 * Math.cos(ang - 0.5), ey - 6 * Math.sin(ang - 0.5));
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - 6 * Math.cos(ang + 0.5), ey - 6 * Math.sin(ang + 0.5));
    ctx.stroke();
  }

  // Изолинии методом marching squares по сетке grid.vals.
  function drawContours(p) {
    if (!grid) return;
    const N = grid.N, vals = grid.vals;
    const lo = grid.lmin, hi = grid.lmax;
    // уровни — логарифмически распределены (густо у дна)
    const LEVELS = 12;
    const levels = [];
    for (let i = 1; i <= LEVELS; i++) {
      const t = i / (LEVELS + 1);
      const tt = Math.pow(t, 2.0); // сгущаем у дна
      levels.push(lo + tt * (hi - lo));
    }
    ctx.save();
    roundRectPath(ctx, p.ox, p.oy, p.size, p.size, 8);
    ctx.clip();
    ctx.lineWidth = 1;
    const cell = p.size / N;
    for (let li = 0; li < levels.length; li++) {
      const lev = levels[li];
      // контуры ближе ко дну — темнее/заметнее
      const a = 0.10 + 0.16 * (1 - li / levels.length);
      ctx.strokeStyle = `rgba(20,23,28,${a.toFixed(3)})`;
      ctx.beginPath();
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const x0 = p.ox + i * cell, y0 = p.oy + j * cell;
          const v00 = vals[j * (N + 1) + i];
          const v10 = vals[j * (N + 1) + i + 1];
          const v01 = vals[(j + 1) * (N + 1) + i];
          const v11 = vals[(j + 1) * (N + 1) + i + 1];
          marchCell(ctx, lev, x0, y0, cell, v00, v10, v11, v01);
        }
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // один квадрат marching squares: углы по часовой с (0,0)=top-left
  // v00 tl, v10 tr, v11 br, v01 bl
  function marchCell(c, lev, x, y, s, v00, v10, v11, v01) {
    const tl = v00 > lev, tr = v10 > lev, br = v11 > lev, bl = v01 > lev;
    let idx = (tl ? 8 : 0) | (tr ? 4 : 0) | (br ? 2 : 0) | (bl ? 1 : 0);
    if (idx === 0 || idx === 15) return;
    // интерполяция точки на ребре между значениями a (в начале) и b (в конце)
    const ip = (a, b) => (lev - a) / (b - a);
    // точки на 4 рёбрах
    const top = () => [x + s * ip(v00, v10), y];
    const right = () => [x + s, y + s * ip(v10, v11)];
    const bottom = () => [x + s * ip(v01, v11), y + s];
    const left = () => [x, y + s * ip(v00, v01)];
    let segs = [];
    switch (idx) {
      case 1: segs = [[left(), bottom()]]; break;
      case 2: segs = [[bottom(), right()]]; break;
      case 3: segs = [[left(), right()]]; break;
      case 4: segs = [[top(), right()]]; break;
      case 5: segs = [[left(), top()], [bottom(), right()]]; break;
      case 6: segs = [[top(), bottom()]]; break;
      case 7: segs = [[left(), top()]]; break;
      case 8: segs = [[left(), top()]]; break;
      case 9: segs = [[top(), bottom()]]; break;
      case 10: segs = [[left(), bottom()], [top(), right()]]; break;
      case 11: segs = [[top(), right()]]; break;
      case 12: segs = [[left(), right()]]; break;
      case 13: segs = [[bottom(), right()]]; break;
      case 14: segs = [[left(), bottom()]]; break;
    }
    for (const sg of segs) {
      c.moveTo(sg[0][0], sg[0][1]);
      c.lineTo(sg[1][0], sg[1][1]);
    }
  }

  function inField(x, y, p) {
    return x >= p.ox - 1 && x <= p.ox + p.size + 1 && y >= p.oy - 1 && y <= p.oy + p.size + 1;
  }
  function roundRectPath(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  /* -------------------------------- цикл -------------------------------- */
  function loop(t) {
    requestAnimationFrame(loop);
    if (!lastT) lastT = t;
    const dt = t - lastT; lastT = t;
    if (playing && gd && !gd.done) {
      acc += dt;
      const interval = 1000 / stepsPerSec();
      let guard = 0;
      while (acc >= interval && !gd.done && guard < 200) {
        gd.next();
        if (gd.L < bestL) bestL = gd.L;
        acc -= interval; guard++;
      }
      updateStats();
      if (gd.done) pause();
    }
    render();
  }

  /* ------------------------------ контролы ------------------------------ */
  function syncFuncUI() {
    funcNote.textContent = fn.note;
    formulaEl.textContent = FORMULA[fn.id] || "";
  }
  function syncLabels() {
    lrVal.textContent = fmtLR(sliderToLR());
    betaVal.textContent = betaFromSlider().toFixed(2);
    speedVal.textContent = speedRange.value;
  }

  // смена функции: новая стартовая точка по умолчанию + пересчёт диапазона lr
  function onFuncChange() {
    fn = GD.funcs[funcSel.value];
    start = { u: fn.start.u, v: fn.start.v };
    lrRange.value = lrToSlider(fn.lr0); // ставим рекомендованный lr
    syncFuncUI();
    syncLabels();
    buildField();
    rebuild();
  }

  function newStart() {
    seed = (seed * 1103515245 + 12345) >>> 0;
    start = GD.startFromSeed(fn, seed);
    rebuild();
  }

  funcSel.addEventListener("change", onFuncChange);
  lrRange.addEventListener("input", () => { syncLabels(); rebuild(); });
  methodSel.addEventListener("change", () => {
    betaCtrl.style.display = methodSel.value === "momentum" ? "" : "none";
    rebuild();
  });
  betaRange.addEventListener("input", () => { syncLabels(); rebuild(); });
  speedRange.addEventListener("input", syncLabels);
  playBtn.addEventListener("click", togglePlay);
  stepBtn.addEventListener("click", () => { pause(); doStep(); });
  resetBtn.addEventListener("click", rebuild);
  regenBtn.addEventListener("click", newStart);

  // клик по полю — задать стартовую точку
  canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const p = plot();
    if (p.size <= 0) return;
    const nx = (e.clientX - rect.left - p.ox) / p.size;
    const ny = (e.clientY - rect.top - p.oy) / p.size;
    if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return;
    start = normToUV(nx, ny);
    rebuild();
  });

  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "SELECT" || e.target.tagName === "INPUT") return;
    if (e.code === "Space") { e.preventDefault(); togglePlay(); }
    else if (e.code === "ArrowRight") { pause(); doStep(); }
    else if (e.key === "r" || e.key === "R" || e.key === "к" || e.key === "К") rebuild();
    else if (e.key === "n" || e.key === "N" || e.key === "т" || e.key === "Т") newStart();
  });
  window.addEventListener("resize", resize);

  // ---- старт ----
  fn = GD.funcs[funcSel.value];
  start = { u: fn.start.u, v: fn.start.v };
  betaCtrl.style.display = methodSel.value === "momentum" ? "" : "none";
  lrRange.value = lrToSlider(fn.lr0);
  syncFuncUI();
  syncLabels();
  resize();      // строит поле и рендерит
  rebuild();
  requestAnimationFrame(loop);
})();
