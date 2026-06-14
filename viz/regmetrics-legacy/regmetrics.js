/* Метрики регрессии (неделя 1): генерация облака точек вокруг прямой с одним
   управляемым «выбросом», подгонка двух линий (OLS — минимум MSE; робастная —
   минимум MAE) и ТОЧНЫЙ расчёт метрик MAE / MSE / RMSE / R² / MAPE по конспекту.

   Нотация курса: yᵢ — истинное значение, ŷᵢ — предсказание, n — число объектов,
   ȳ — среднее таргета. Данные хранятся в «сырых» координатах (x ∈ [0,1], y ∈ ℝ),
   нормировка под canvas делается в app.js. */
(function () {
  "use strict";

  /* ---------- ГПСЧ mulberry32 + Box–Muller (по образцу assets/js/datasets.js) ---------- */
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(r, mean, sd) {
    let u = 0, v = 0;
    while (u === 0) u = r();
    while (v === 0) v = r();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /* ---------- Истинная модель y = A·x + B + шум, x ∈ [0,1] ----------
     Держим таргет заведомо положительным (B≈1.4): тогда MAPE определена (yᵢ≠0)
     и не «взрывается» из-за деления на околонулевые y — выброс показываем
     контролируемо через величину outlierY. */
  const TRUE_A = 1.6;
  const TRUE_B = 1.4;

  /* Базовая выборка БЕЗ выброса. Последняя точка — «носитель» выброса:
     её индекс возвращаем отдельно, чтобы app.js двигал именно её. */
  function generate(n, noise, seed) {
    const r = rng(seed);
    const pts = [];
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) / n + gauss(r, 0, 0.010);
      const xc = Math.max(0.02, Math.min(0.98, x));
      const y = TRUE_A * xc + TRUE_B + gauss(r, 0, noise);
      pts.push({ x: xc, y: y });
    }
    // индекс точки-выброса — примерно по центру по x, чтобы её было видно
    const oi = Math.min(pts.length - 1, Math.max(0, Math.round(n * 0.5)));
    return { points: pts, outlierIndex: oi, trueLine: { a: TRUE_A, b: TRUE_B } };
  }

  /* ---------- Подгонка: OLS (минимум MSE) ----------
     a,b через ковариацию/дисперсию — это и есть оптимум по MSE, он же бейзлайн
     «через среднее» по обоим осям. */
  function fitOLS(pts) {
    const n = pts.length;
    if (n < 2) return { a: 0, b: n ? pts[0].y : 0 };
    let sx = 0, sy = 0;
    for (const p of pts) { sx += p.x; sy += p.y; }
    const mx = sx / n, my = sy / n;
    let sxx = 0, sxy = 0;
    for (const p of pts) { const dx = p.x - mx; sxx += dx * dx; sxy += dx * (p.y - my); }
    const a = sxx > 1e-12 ? sxy / sxx : 0;
    const b = my - a * mx;
    return { a, b };
  }

  /* ---------- Подгонка: робастная по MAE (LAD) ----------
     При фиксированном наклоне оптимальный сдвиг по MAE — медиана остатков.
     Наклон ищем координатным спуском по медиане: устойчиво к выбросам. */
  function median(arr) {
    if (!arr.length) return 0;
    const s = arr.slice().sort((p, q) => p - q);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function maeFor(pts, a, b) {
    let s = 0; for (const p of pts) s += Math.abs(p.y - (a * p.x + b));
    return s / (pts.length || 1);
  }
  function fitLAD(pts) {
    if (pts.length < 2) return fitOLS(pts);
    let { a } = fitOLS(pts);                       // старт от OLS-наклона
    let b = median(pts.map((p) => p.y - a * p.x));
    let bestLoss = maeFor(pts, a, b);
    let stepA = 1.0;
    for (let iter = 0; iter < 80; iter++) {
      let improved = false;
      for (const da of [stepA, -stepA]) {
        const aa = a + da;
        const bb = median(pts.map((p) => p.y - aa * p.x));
        const loss = maeFor(pts, aa, bb);
        if (loss < bestLoss - 1e-10) { a = aa; b = bb; bestLoss = loss; improved = true; break; }
      }
      if (!improved) stepA *= 0.5;
      if (stepA < 1e-5) break;
    }
    return { a, b };
  }

  /* ---------- Метрики регрессии (ТОЧНО по формулам конспекта недели 1) ----------
       MAE  = (1/n) Σ |yᵢ − ŷᵢ|
       MSE  = (1/n) Σ (yᵢ − ŷᵢ)²
       RMSE = √MSE
       R²   = 1 − Σ(yᵢ−ŷᵢ)² / Σ(yᵢ−ȳ)²
       MAPE = (100%/n) Σ |(yᵢ − ŷᵢ)/yᵢ|   (не определена при yᵢ=0)
     Возвращаем также по-точечные остатки e и абсолютные ошибки для отрисовки. */
  function metrics(pts, line) {
    const a = line.a, b = line.b, n = pts.length;
    if (!n) return { mse: 0, mae: 0, rmse: 0, r2: 0, mape: 0, sse: 0, sst: 0, ybar: 0 };
    let my = 0; for (const p of pts) my += p.y; my /= n;          // ȳ
    let sse = 0, sae = 0, sst = 0, mapeSum = 0, mapeCnt = 0;
    for (const p of pts) {
      const yhat = a * p.x + b;
      const e = p.y - yhat;                                       // yᵢ − ŷᵢ
      sse += e * e;                                               // Σ(yᵢ−ŷᵢ)²
      sae += Math.abs(e);                                         // Σ|yᵢ−ŷᵢ|
      sst += (p.y - my) * (p.y - my);                             // Σ(yᵢ−ȳ)²
      if (Math.abs(p.y) > 1e-9) { mapeSum += Math.abs(e / p.y); mapeCnt++; }
    }
    const mse = sse / n;
    const mae = sae / n;
    const rmse = Math.sqrt(mse);
    const r2 = sst > 1e-12 ? 1 - sse / sst : 1;
    const mape = mapeCnt ? (100 * mapeSum / mapeCnt) : 0;
    return { mse, mae, rmse, r2, mape, sse, sst, ybar: my };
  }

  window.RegMetrics = {
    rng, gauss, generate, fitOLS, fitLAD, metrics,
    trueParams: { a: TRUE_A, b: TRUE_B },
  };
})();
