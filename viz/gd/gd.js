/* Градиентный спуск на 2D-функции потерь L(u,v).
   Функции с аналитическими градиентами (выведены вручную), маппинг координат
   функции в нормированное поле и «степпер» (vanilla / momentum, + батч-режимы
   для функции на данных — full / mini / sgd). Отрисовка и UI — в app.js / gd3d.js.

   Поле — квадрат [0,1]^2, y растёт вниз. Координаты функции (u,v) в
   [umin,umax]x[vmin,vmax]; маппинг линейный, ось v переворачивается. */
(function () {
  "use strict";

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

  /* Каждая функция: L(u,v); grad(u,v)→[dL/du,dL/dv]; domain; minima[]; start;
     lr0 (рекоменд. шаг); note; formula. Для функции на данных — isData,
     X,Y,n, gradBatch(u,v,idx). */

  // 1) «Чаша» — анизотропная квадратичная.
  const bowl = {
    id: "bowl", name: "Чаша (квадратичная)",
    L: (u, v) => u * u + 4 * v * v,
    grad: (u, v) => [2 * u, 8 * v],
    domain: { umin: -2.6, umax: 2.6, vmin: -2.6, vmax: 2.6 },
    minima: [{ u: 0, v: 0 }], start: { u: -2.1, v: 2.0 }, lr0: 0.08,
    formula: "L = x² + 4y²",
    note: "Выпуклая: один минимум, спуск всегда сходится при умеренном η.",
  };

  // 2) «Овраг» — сильно вытянутая квадратичная: классический зигзаг.
  const ravine = {
    id: "ravine", name: "Овраг (плохо обусловленный)",
    L: (u, v) => 0.08 * u * u + 6 * v * v,
    grad: (u, v) => [0.16 * u, 12 * v],
    domain: { umin: -2.7, umax: 2.7, vmin: -2.2, vmax: 2.2 },
    minima: [{ u: 0, v: 0 }], start: { u: -2.3, v: 1.9 }, lr0: 0.13,
    formula: "L = 0.08x² + 6y²",
    note: "Кривизна по осям различается в 75 раз → vanilla зигзагует поперёк оврага, momentum гасит колебания.",
  };

  // 3) Розенброк («банан») — узкий изогнутый овраг.
  const rosen = {
    id: "rosen", name: "Розенброк (банан)",
    L: (u, v) => { const t = v - u * u, s = 1 - u; return s * s + 100 * t * t; },
    grad: (u, v) => { const t = v - u * u; return [-2 * (1 - u) - 400 * u * t, 200 * t]; },
    domain: { umin: -1.7, umax: 1.7, vmin: -0.7, vmax: 2.7 },
    minima: [{ u: 1, v: 1 }], start: { u: -1.2, v: 1.0 }, lr0: 0.0018,
    formula: "L = (1−x)² + 100(y−x²)²",
    note: "Узкий овраг: малый η ползёт по дну, momentum проходит быстрее.",
  };

  // 4) «Седло».
  const saddle = {
    id: "saddle", name: "Седло",
    L: (u, v) => u * u - v * v + 0.3 * v * v * v * v,
    grad: (u, v) => [2 * u, -2 * v + 1.2 * v * v * v],
    domain: { umin: -2.2, umax: 2.2, vmin: -2.4, vmax: 2.4 },
    minima: [{ u: 0, v: Math.sqrt(2 / 1.2) }, { u: 0, v: -Math.sqrt(2 / 1.2) }],
    start: { u: 1.6, v: 0.04 }, lr0: 0.05,
    formula: "L = x² − y² + 0.3y⁴",
    note: "В (0,0) — седло. Стартуя у оси y=0, спуск долго «висит», потом скатывается.",
  };

  // 5) «Две ямы».
  const twowells = {
    id: "twowells", name: "Две ямы",
    L: (u, v) => { const q = u * u - 1; return q * q + 0.5 * v * v + 0.35 * u; },
    grad: (u, v) => [4 * u * (u * u - 1) + 0.35, v],
    domain: { umin: -1.9, umax: 1.9, vmin: -2.1, vmax: 2.1 },
    minima: [{ u: -1.04, v: 0 }, { u: 0.96, v: 0 }], start: { u: 0.2, v: 1.6 }, lr0: 0.05,
    formula: "L = (x²−1)² + 0.5y² + 0.35x",
    note: "Два минимума: куда придёшь — зависит от старта. Глобальный — левый.",
  };

  // 6) Химмельблау — четыре одинаковых минимума.
  //    L = (x²+y−11)² + (x+y²−7)²
  //    dL/dx = 4x(x²+y−11) + 2(x+y²−7)
  //    dL/dy = 2(x²+y−11) + 4y(x+y²−7)
  const himmelblau = {
    id: "himmelblau", name: "Химмельблау (4 минимума)",
    L: (u, v) => { const a = u * u + v - 11, b = u + v * v - 7; return a * a + b * b; },
    grad: (u, v) => {
      const a = u * u + v - 11, b = u + v * v - 7;
      return [4 * u * a + 2 * b, 2 * a + 4 * v * b];
    },
    domain: { umin: -5, umax: 5, vmin: -5, vmax: 5 },
    minima: [{ u: 3, v: 2 }, { u: -2.805118, v: 3.131312 }, { u: -3.779310, v: -3.283186 }, { u: 3.584428, v: -1.848126 }],
    start: { u: 0, v: 0 }, lr0: 0.006,
    formula: "L = (x²+y−11)² + (x+y²−7)²",
    note: "Четыре равных минимума. Куда сойдёшься — решает стартовая точка.",
  };

  // 7) Растригин — много локальных минимумов (egg-carton).
  //    L = 20 + x²+y² − 10(cos2πx + cos2πy)
  //    dL/dx = 2x + 20π·sin(2πx);  dL/dy = 2y + 20π·sin(2πy)
  const TWO_PI = 2 * Math.PI;
  const rastrigin = {
    id: "rastrigin", name: "Растригин (локальные минимумы)",
    L: (u, v) => 20 + u * u + v * v - 10 * (Math.cos(TWO_PI * u) + Math.cos(TWO_PI * v)),
    grad: (u, v) => [2 * u + 20 * Math.PI * Math.sin(TWO_PI * u), 2 * v + 20 * Math.PI * Math.sin(TWO_PI * v)],
    domain: { umin: -3.4, umax: 3.4, vmin: -3.4, vmax: 3.4 },
    minima: [{ u: 0, v: 0 }], start: { u: 2.35, v: -1.7 }, lr0: 0.004,
    formula: "L = 20 + x²+y² − 10(cos2πx + cos2πy)",
    note: "Решётка локальных минимумов. Обычный GD застревает в ближайшей ямке — добавь шум (SGD), и спуск может выбраться к (0,0).",
  };

  // 8) Стыблинский–Танг — четыре квартичные ямы разной глубины.
  //    L = ½ Σ (xᵢ⁴ − 16xᵢ² + 5xᵢ);  dL/dx = 2x³ − 16x + 2.5
  const styblinski = {
    id: "styblinski", name: "Стыблинский–Танг",
    L: (u, v) => 0.5 * ((u * u * u * u - 16 * u * u + 5 * u) + (v * v * v * v - 16 * v * v + 5 * v)),
    grad: (u, v) => [2 * u * u * u - 16 * u + 2.5, 2 * v * v * v - 16 * v + 2.5],
    domain: { umin: -5, umax: 5, vmin: -5, vmax: 5 },
    minima: [{ u: -2.903534, v: -2.903534 }, { u: -2.903534, v: 2.7468 }, { u: 2.7468, v: -2.903534 }, { u: 2.7468, v: 2.7468 }],
    start: { u: 0, v: 0 }, lr0: 0.012,
    formula: "L = ½·Σ(xᵢ⁴ − 16xᵢ² + 5xᵢ)",
    note: "Четыре ямы разной глубины. Из седла в центре спуск скатывается в одну; глубочайшая — в (−2.9, −2.9).",
  };

  // 9) Экли — почти плоское поле с ямками и резкой воронкой в (0,0).
  const E = Math.E;
  const ackley = {
    id: "ackley", name: "Экли (Ackley)",
    L: (u, v) => {
      const r = Math.sqrt(0.5 * (u * u + v * v));
      return -20 * Math.exp(-0.2 * r) - Math.exp(0.5 * (Math.cos(TWO_PI * u) + Math.cos(TWO_PI * v))) + 20 + E;
    },
    grad: (u, v) => {
      const r = Math.sqrt(0.5 * (u * u + v * v));
      const e1 = Math.exp(-0.2 * r), e2 = Math.exp(0.5 * (Math.cos(TWO_PI * u) + Math.cos(TWO_PI * v)));
      const f1u = r < 1e-9 ? 0 : 2 * u * e1 / r, f1v = r < 1e-9 ? 0 : 2 * v * e1 / r;
      return [f1u + Math.PI * Math.sin(TWO_PI * u) * e2, f1v + Math.PI * Math.sin(TWO_PI * v) * e2];
    },
    domain: { umin: -4.5, umax: 4.5, vmin: -4.5, vmax: 4.5 },
    minima: [{ u: 0, v: 0 }], start: { u: 1.9, v: -1.7 }, lr0: 0.08,
    formula: "L = −20·e^(−0.2√(½(x²+y²))) − e^(½(cos2πx+cos2πy)) + 20 + e",
    note: "Ровное «поле» с мелкими ямками и узкой воронкой в центре. Полный GD вязнет в ближайшей ямке — шум (SGD) помогает доползти к (0,0).",
  };

  // 10) Волнистый овраг — извилистое дно, по которому спуск долго скользит.
  const wavy = {
    id: "wavy", name: "Волнистый овраг",
    L: (u, v) => { const r = v - 0.6 * Math.sin(1.5 * u); return 2 * r * r + 0.05 * u * u; },
    grad: (u, v) => { const r = v - 0.6 * Math.sin(1.5 * u); return [-3.6 * r * Math.cos(1.5 * u) + 0.1 * u, 4 * r]; },
    domain: { umin: -5, umax: 5, vmin: -3, vmax: 3 },
    minima: [{ u: 0, v: 0 }], start: { u: -4.3, v: 2.4 }, lr0: 0.06,
    formula: "L = 2·(y − 0.6·sin 1.5x)² + 0.05x²",
    note: "Спуск быстро падает в извилистое дно и долго течёт по нему к центру — хорошо видно, как градиент скользит вдоль оврага.",
  };

  // 11) Линейная регрессия на ДАННЫХ — поверхность MSE в пространстве (w,b).
  //    Здесь работают батч-режимы: full / mini / sgd.
  const linreg = (function () {
    const A = 1.3, B = 0.5, N = 40;
    const r = rng(20240611);
    const X = new Float64Array(N), Y = new Float64Array(N);
    for (let i = 0; i < N; i++) { const x = -1.6 + 3.2 * r(); X[i] = x; Y[i] = A * x + B + gauss(r, 0, 0.32); }
    // L(w,b) = 1/N Σ (w·x+b − y)²
    const L = (w, b) => { let s = 0; for (let i = 0; i < N; i++) { const e = w * X[i] + b - Y[i]; s += e * e; } return s / N; };
    const grad = (w, b) => { let gw = 0, gb = 0; for (let i = 0; i < N; i++) { const e = w * X[i] + b - Y[i]; gw += e * X[i]; gb += e; } return [2 * gw / N, 2 * gb / N]; };
    const gradBatch = (w, b, idx) => {
      let gw = 0, gb = 0; const m = idx.length;
      for (const i of idx) { const e = w * X[i] + b - Y[i]; gw += e * X[i]; gb += e; }
      return [2 * gw / m, 2 * gb / m];
    };
    // OLS-оптимум (нормальные уравнения)
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let i = 0; i < N; i++) { sx += X[i]; sy += Y[i]; sxx += X[i] * X[i]; sxy += X[i] * Y[i]; }
    const wOpt = (N * sxy - sx * sy) / (N * sxx - sx * sx);
    const bOpt = (sy - wOpt * sx) / N;
    return {
      id: "linreg", name: "Линейная регрессия (MSE по данным)",
      isData: true, X, Y, n: N, trueA: A, trueB: B,
      L, grad, gradBatch,
      domain: { umin: wOpt - 2.6, umax: wOpt + 2.6, vmin: bOpt - 2.2, vmax: bOpt + 2.2 },
      minima: [{ u: wOpt, v: bOpt }],
      start: { u: wOpt - 2.1, v: bOpt + 1.7 }, lr0: 0.18,
      formula: "L(w,b) = (1/n)Σ(w·xᵢ+b−yᵢ)²",
      note: "Поверхность потерь в пространстве параметров (w — наклон, b — сдвиг). Включи SGD/мини-батч — путь зашумится: градиент по части данных.",
    };
  })();

  // 12) Случайный рельеф — сумма гауссовых ям и холмов (процедурный ландшафт).
  //     L = ½·b·(x²+y²) + Σ aₖ·exp(−‖p−cₖ‖²/2sₖ²);  градиент аналитический.
  //     Каждый seed → новая карта. Глобальный минимум ищем по сетке + уточняем GD.
  function makeTerrain(seed, bumps) {
    const r = rng((seed >>> 0) || 1);
    const dom = { umin: -3, umax: 3, vmin: -3, vmax: 3 };
    const K = Math.max(3, bumps || 8);
    const comps = [];
    for (let k = 0; k < K; k++) {
      const cx = -2.4 + 4.8 * r(), cy = -2.4 + 4.8 * r();
      const s = 0.42 + 0.95 * r();
      const sign = r() < 0.62 ? -1 : 1;            // чаще ямы, чем холмы
      const a = sign * (0.6 + 1.9 * r());
      comps.push({ cx, cy, s2: s * s, a });
    }
    const b = 0.08;                                 // мягкая глобальная чаша (ограничивает рельеф)
    const L = (u, v) => {
      let s = 0.5 * b * (u * u + v * v);
      for (const c of comps) { const dx = u - c.cx, dy = v - c.cy; s += c.a * Math.exp(-(dx * dx + dy * dy) / (2 * c.s2)); }
      return s;
    };
    const grad = (u, v) => {
      let gu = b * u, gv = b * v;
      for (const c of comps) { const dx = u - c.cx, dy = v - c.cy; const e = c.a * Math.exp(-(dx * dx + dy * dy) / (2 * c.s2)); gu += e * (-dx / c.s2); gv += e * (-dy / c.s2); }
      return [gu, gv];
    };
    // глобальный минимум: грубый поиск по сетке + уточнение градиентным спуском
    let best = { u: 0, v: 0, L: Infinity }, M = 90;
    for (let j = 0; j <= M; j++) { const v = dom.vmin + (j / M) * (dom.vmax - dom.vmin); for (let i = 0; i <= M; i++) { const u = dom.umin + (i / M) * (dom.umax - dom.umin); const val = L(u, v); if (val < best.L) best = { u, v, L: val }; } }
    let mu = best.u, mv = best.v;
    for (let t = 0; t < 80; t++) { const g = grad(mu, mv); mu -= 0.02 * g[0]; mv -= 0.02 * g[1]; }
    // старт — из самого «высокого» из углов/краёв, чтобы спуск был зрелищным
    let st = { u: -2.4, v: 2.4, L: -Infinity };
    for (const c of [[-2.4, 2.4], [2.4, 2.4], [-2.4, -2.4], [2.4, -2.4], [0, 2.6], [2.6, 0], [-2.6, 0], [0, -2.6]]) {
      const val = L(c[0], c[1]); if (val > st.L) st = { u: c[0], v: c[1], L: val };
    }
    return {
      id: "terrain", name: "Случайный рельеф", isTerrain: true, seed: seed, bumps: K,
      L, grad, domain: dom,
      minima: [{ u: mu, v: mv }],
      start: { u: st.u, v: st.v }, lr0: 0.06,
      formula: "L = ½·0.08(x²+y²) + Σ aₖ·e^(−‖p−cₖ‖²/2sₖ²)",
      note: "Сгенерированный рельеф из случайных ям и холмов. Жми «Новый рельеф» — каждый раз новая карта: ищи, куда сойдётся спуск и поможет ли шум выбраться к глобальному минимуму.",
    };
  }

  const FUNCS = { bowl, ravine, wavy, rosen, saddle, twowells, himmelblau, rastrigin, styblinski, ackley, terrain: makeTerrain(1, 9), linreg };
  const FUNC_LIST = Object.keys(FUNCS).map((k) => ({ id: k, name: FUNCS[k].name }));

  /* --------------------- Степпер ---------------------
     vanilla:  θ ← θ − η·g;   momentum: m ← β·m + g; θ ← θ − η·m
     g — градиент: для функции на данных в режиме mini/sgd берётся по случайной
     подвыборке (шумный); полный градиент считается отдельно для статистики. */
  function GDStepper(fn, opts) {
    this.fn = fn;
    this.lr = opts.lr;
    this.method = opts.method || "vanilla";
    this.beta = opts.beta != null ? opts.beta : 0.9;
    this.batchMode = opts.batchMode || "full"; // full|mini|sgd — работает на любой функции
    this.batchSize = opts.batchSize || (fn.n || 8);
    this.noiseFrac = opts.noiseFrac != null ? opts.noiseFrac : 0.03; // доля домена на шаг шума (SGD, m=1)
    this.rng = rng(opts.seed || 999);
    this.lastBatch = null;
    this.maxNorm = 1e6; this.tol = 1e-7;

    const s = opts.start;
    this.u = s.u; this.v = s.v;
    this.mu = 0; this.mv = 0;
    this.step = 0; this.done = false; this.diverged = false; this.converged = false;

    const g0 = fn.grad(this.u, this.v);
    this.path = [{ u: this.u, v: this.v }];
    this.L = fn.L(this.u, this.v);
    this.gnorm = Math.hypot(g0[0], g0[1]);
  }

  GDStepper.prototype._stepGrad = function (u, v) {
    const fn = this.fn;
    if (fn.isData && this.batchMode !== "full") {
      const n = fn.n;
      let m = this.batchMode === "sgd" ? 1 : Math.max(1, Math.min(n, this.batchSize));
      let idx;
      if (m >= n) { idx = []; for (let i = 0; i < n; i++) idx.push(i); }
      else {
        const used = new Set(); idx = [];
        while (idx.length < m) { const k = (this.rng() * n) | 0; if (!used.has(k)) { used.add(k); idx.push(k); } }
      }
      this.lastBatch = idx;
      return fn.gradBatch(u, v, idx);
    }
    // аналитическая функция без данных: имитируем шум стохастического градиента.
    // Шум привязан к домену и η → стабилен на любой функции; меньше батч m — больше шум.
    if (this.batchMode !== "full") {
      const m = this.batchMode === "sgd" ? 1 : Math.max(1, this.batchSize);
      const g = fn.grad(u, v), d = fn.domain;
      const su = this.noiseFrac * (d.umax - d.umin) / this.lr / Math.sqrt(m);
      const sv = this.noiseFrac * (d.vmax - d.vmin) / this.lr / Math.sqrt(m);
      this.lastBatch = null;
      return [g[0] + gauss(this.rng, 0, su), g[1] + gauss(this.rng, 0, sv)];
    }
    this.lastBatch = null;
    return fn.grad(u, v);
  };

  GDStepper.prototype.next = function () {
    if (this.done) return;
    const fn = this.fn;
    const g = this._stepGrad(this.u, this.v);
    let du, dv;
    if (this.method === "momentum") {
      this.mu = this.beta * this.mu + g[0];
      this.mv = this.beta * this.mv + g[1];
      du = -this.lr * this.mu; dv = -this.lr * this.mv;
    } else { du = -this.lr * g[0]; dv = -this.lr * g[1]; }

    const nu = this.u + du, nv = this.v + dv;
    if (!isFinite(nu) || !isFinite(nv) || Math.abs(nu) > this.maxNorm || Math.abs(nv) > this.maxNorm) {
      this.diverged = true; this.done = true; return;
    }
    this.u = nu; this.v = nv; this.step++;
    this.path.push({ u: nu, v: nv });
    if (this.path.length > 1200) this.path.shift(); // ограничиваем для долгого SGD

    const gf = fn.grad(nu, nv);               // полный градиент — для статистики/сходимости
    this.gnorm = Math.hypot(gf[0], gf[1]);
    this.L = fn.L(nu, nv);
    // сходимость объявляем только в полном батче (SGD честно «дрожит» у минимума)
    if (this.batchMode === "full" && this.gnorm < this.tol) { this.converged = true; this.done = true; }
  };

  GDStepper.prototype.stats = function () {
    return { step: this.step, L: this.L, gnorm: this.gnorm, done: this.done, diverged: this.diverged, converged: this.converged };
  };

  function startFromSeed(fn, seed) {
    const r = rng(seed), d = fn.domain;
    const u = d.umin + (0.12 + 0.76 * r()) * (d.umax - d.umin);
    const v = d.vmin + (0.12 + 0.76 * r()) * (d.vmax - d.vmin);
    return { u, v };
  }

  window.GD = { funcs: FUNCS, list: FUNC_LIST, Stepper: GDStepper, rng, gauss, startFromSeed, makeTerrain };
})();
