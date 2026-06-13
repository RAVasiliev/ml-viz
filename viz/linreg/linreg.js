/* Линейная регрессия 1D: генерация данных, OLS замкнутой формулой,
   градиентный спуск (степпер) и точные метрики регрессии недели 1.
   Все координаты для отрисовки нормированы в [0,1] (см. app.js — туда уходят
   именно сырые x,y; нормировка по экстремумам выборки делается на отрисовке). */
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

  /* ---------- Генерация выборки (x,y) ----------
     Истинная модель: y = A*x + B + шум, x ∈ [0,1].
     Режимы:
       linear    — чистая прямая + гауссов шум;
       outlier   — то же, но одна точка — сильный выброс по y;
       nonlinear — лёгкая квадратичная кривизна (прямая её не ловит идеально). */
  const TRUE_A = 1.7;
  const TRUE_B = 0.6;

  function generate(mode, n, noise, seed) {
    const r = rng(seed);
    const pts = [];
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) / n + gauss(r, 0, 0.012);      // почти равномерно по x, чуть дрожит
      const xc = Math.max(0, Math.min(1, x));
      let y = TRUE_A * xc + TRUE_B + gauss(r, 0, noise);
      if (mode === "nonlinear") y += 1.1 * (xc - 0.5) * (xc - 0.5) - 0.09; // лёгкая кривизна
      pts.push({ x: xc, y: y });
    }
    if (mode === "outlier" && pts.length) {
      // один сильный выброс — высоко вверх, ближе к краю по x
      const j = Math.floor(n * 0.78);
      const k = Math.min(j, pts.length - 1);
      pts[k] = { x: pts[k].x, y: TRUE_A * pts[k].x + TRUE_B + 2.6 };
    }
    return {
      points: pts,
      mode: mode,
      // истинная линия известна только для linear / outlier (для nonlinear она неполна)
      trueLine: (mode === "nonlinear") ? null : { a: TRUE_A, b: TRUE_B },
    };
  }

  /* ---------- Замкнутые формулы подгонки ---------- */
  // OLS (минимум MSE): a,b через ковариацию/дисперсию.
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

  // Минимум MAE при фиксированном наклоне: оптимальный сдвиг — медиана остатков.
  // Наклон ищем грубым координатным спуском по медиане (устойчив к выбросам).
  function median(arr) {
    if (!arr.length) return 0;
    const s = arr.slice().sort((p, q) => p - q);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function maeFor(pts, a, b) {
    let s = 0; for (const p of pts) s += Math.abs(p.y - (a * p.x + b)); return s / (pts.length || 1);
  }
  function fitLAD(pts) {
    if (pts.length < 2) return fitOLS(pts);
    let { a } = fitOLS(pts);                 // старт от OLS-наклона
    let b = median(pts.map((p) => p.y - a * p.x));
    let bestLoss = maeFor(pts, a, b);
    let stepA = 0.8;
    for (let iter = 0; iter < 60; iter++) {
      let improved = false;
      for (const da of [stepA, -stepA]) {
        const aa = a + da;
        const bb = median(pts.map((p) => p.y - aa * p.x));
        const loss = maeFor(pts, aa, bb);
        if (loss < bestLoss - 1e-9) { a = aa; b = bb; bestLoss = loss; improved = true; break; }
      }
      if (!improved) stepA *= 0.5;
      if (stepA < 1e-4) break;
    }
    return { a, b };
  }

  /* ---------- Метрики регрессии (ТОЧНО по конспекту недели 1) ----------
     yᵢ — истина, ŷᵢ — предсказание модели, n — число объектов, ȳ — среднее таргета. */
  function metrics(pts, a, b) {
    const n = pts.length;
    if (!n) return { mse: 0, mae: 0, rmse: 0, r2: 0, mape: 0 };
    let my = 0; for (const p of pts) my += p.y; my /= n;        // ȳ
    let sse = 0, sae = 0, ssTot = 0, mapeSum = 0, mapeCnt = 0;
    for (const p of pts) {
      const yhat = a * p.x + b;
      const e = p.y - yhat;
      sse += e * e;                                            // Σ(yᵢ-ŷᵢ)²
      sae += Math.abs(e);                                      // Σ|yᵢ-ŷᵢ|
      ssTot += (p.y - my) * (p.y - my);                        // Σ(yᵢ-ȳ)²
      if (Math.abs(p.y) > 1e-9) { mapeSum += Math.abs(e / p.y); mapeCnt++; } // MAPE не определена при yᵢ=0
    }
    const mse = sse / n;                                       // MSE = (1/n)Σ(yᵢ-ŷᵢ)²
    const mae = sae / n;                                       // MAE = (1/n)Σ|yᵢ-ŷᵢ|
    const rmse = Math.sqrt(mse);                              // RMSE = √MSE
    const r2 = ssTot > 1e-12 ? 1 - sse / ssTot : 1;          // R² = 1 - SSE/SST
    const mape = mapeCnt ? (100 * mapeSum / mapeCnt) : 0;     // MAPE = (100%/n)Σ|(yᵢ-ŷᵢ)/yᵢ|
    return { mse, mae, rmse, r2, mape };
  }

  /* ---------- Степпер градиентного спуска ----------
     На каждом step() — одна итерация GD по выбранному лоссу (MSE или MAE).
     Признак x не масштабируем (он уже в [0,1]); таргет y используем как есть. */
  function LinRegGD(pts, opts) {
    opts = opts || {};
    this.pts = pts;
    this.loss = opts.loss || "mse";       // 'mse' | 'mae'
    this.lr = opts.lr || 0.3;             // learning rate
    this.a = 0;
    this.b = 0;
    this.iter = 0;
    this.maxIter = opts.maxIter || 400;
    this.done = false;
    // целевая (оптимальная) линия для текущего лосса — для индикатора сходимости
    this.target = (this.loss === "mae") ? fitLAD(pts) : fitOLS(pts);
  }
  LinRegGD.prototype.step = function () {
    if (this.done) return;
    const n = this.pts.length;
    if (n < 2) { this.done = true; return; }
    let ga = 0, gb = 0;
    for (const p of this.pts) {
      const yhat = this.a * p.x + this.b;
      const e = yhat - p.y;                         // ŷ - y
      if (this.loss === "mse") {
        // ∂MSE/∂a = (2/n)Σ(ŷ-y)x ; ∂MSE/∂b = (2/n)Σ(ŷ-y)
        ga += 2 * e * p.x; gb += 2 * e;
      } else {
        // субградиент MAE: sign(ŷ-y)
        const s = e > 0 ? 1 : (e < 0 ? -1 : 0);
        ga += s * p.x; gb += s;
      }
    }
    ga /= n; gb /= n;
    this.a -= this.lr * ga;
    this.b -= this.lr * gb;
    this.iter++;
    // сходимость: близко к оптимуму или исчерпали итерации
    const da = this.a - this.target.a, db = this.b - this.target.b;
    if (this.iter >= this.maxIter || (da * da + db * db) < 1e-7) this.done = true;
  };
  LinRegGD.prototype.line = function () { return { a: this.a, b: this.b }; };

  window.LinReg = {
    generate,
    fitOLS,
    fitLAD,
    metrics,
    GD: LinRegGD,
    trueParams: { a: TRUE_A, b: TRUE_B },
    list: [
      { id: "linear",    name: "Линейная" },
      { id: "outlier",   name: "С выбросом" },
      { id: "nonlinear", name: "Нелинейная" },
    ],
  };
})();
