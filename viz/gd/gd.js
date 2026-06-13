/* Градиентный спуск на 2D-функции потерь L(x,y).
   Здесь — сами функции, их аналитические градиенты (выведены вручную),
   маппинг координат функции в нормированное поле [0,1]^2 и «степпер» спуска
   (обычный и momentum). Отрисовка и UI — в app.js.

   Соглашение по координатам поля: поле — квадрат [0,1]x[0,1], y растёт ВНИЗ
   (как на canvas). Координаты функции (u,v) лежат в прямоугольнике
   [umin,umax]x[vmin,vmax] своём для каждой функции; маппинг линейный, причём
   ось v переворачивается, чтобы «низ функции» рисовался внизу поля. */
(function () {
  "use strict";

  // ---- ГПСЧ mulberry32 + Box–Muller (по образцу assets/js/datasets.js) ----
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

  /* ---------------------------------------------------------------------------
     Каждая функция описывается объектом:
       L(u,v)      — значение потерь;
       grad(u,v)   → [dL/du, dL/dv] — АНАЛИТИЧЕСКИЙ градиент (выведен вручную);
       domain      → {umin,umax,vmin,vmax} — окно координат функции;
       minima      → массив точек глобальных/локальных минимумов (для метки);
       start       → удобная стартовая точка по умолчанию (в коорд. функции);
       lr0         → разумный стартовый learning rate (для подсказки).
  --------------------------------------------------------------------------- */

  // 1) «Чаша» — выпуклая квадратичная (анизотропная, чтобы был «овраг»).
  //    L = a*u^2 + b*v^2,  ∇L = [2a*u, 2b*v].
  const bowl = (function () {
    const a = 1, b = 4;
    return {
      id: "bowl",
      name: "Чаша (квадратичная)",
      L: (u, v) => a * u * u + b * v * v,
      grad: (u, v) => [2 * a * u, 2 * b * v],
      domain: { umin: -2.6, umax: 2.6, vmin: -2.6, vmax: 2.6 },
      minima: [{ u: 0, v: 0 }],
      start: { u: -2.1, v: 2.0 },
      lr0: 0.08,
      note: "Выпуклая: один минимум, спуск всегда сходится при умеренном lr.",
    };
  })();

  // 2) Розенброк («банан») — узкий изогнутый овраг.
  //    L = (1-u)^2 + 100*(v - u^2)^2.
  //    dL/du = -2(1-u) + 100*2(v-u^2)*(-2u) = -2(1-u) - 400u(v-u^2)
  //    dL/dv = 100*2(v-u^2) = 200(v-u^2)
  //    Минимум в (1,1).
  const rosen = {
    id: "rosen",
    name: "Розенброк (банан)",
    L: (u, v) => {
      const t = v - u * u, s = 1 - u;
      return s * s + 100 * t * t;
    },
    grad: (u, v) => {
      const t = v - u * u;
      return [-2 * (1 - u) - 400 * u * t, 200 * t];
    },
    domain: { umin: -1.7, umax: 1.7, vmin: -0.7, vmax: 2.7 },
    minima: [{ u: 1, v: 1 }],
    start: { u: -1.2, v: 1.0 },
    lr0: 0.0018,
    note: "Узкий овраг: малый lr ползёт по дну, momentum проходит быстрее.",
  };

  // 3) «Седло» — седловая точка в (0,0): минимум по u, максимум по v.
  //    L = u^2 - v^2 (+ мягкая чаша, чтобы поле не уходило в -inf по краям).
  //    Берём L = u^2 - v^2 + 0.15*(u^2+v^2)^2 / 1 ... — но для наглядности
  //    оставим чистое седло с лёгким «бортиком» по v, чтобы был настоящий
  //    минимум-ловушка по краям и видна расходимость по оси v.
  //    L = u^2 - v^2 + 0.3*v^4.
  //    dL/du = 2u
  //    dL/dv = -2v + 1.2*v^3
  const saddle = {
    id: "saddle",
    name: "Седло",
    L: (u, v) => u * u - v * v + 0.3 * v * v * v * v,
    grad: (u, v) => [2 * u, -2 * v + 1.2 * v * v * v],
    domain: { umin: -2.2, umax: 2.2, vmin: -2.4, vmax: 2.4 },
    // два настоящих минимума по краям оврага: v = ±sqrt(2/1.2)=±1.291, u=0
    minima: [{ u: 0, v: Math.sqrt(2 / 1.2) }, { u: 0, v: -Math.sqrt(2 / 1.2) }],
    start: { u: 1.6, v: 0.04 },
    lr0: 0.05,
    note: "В (0,0) — седло. Стартуя у оси v=0, спуск долго «висит», потом скатывается.",
  };

  // 4) «Две ямы» — двуямный потенциал: два минимума разной глубины.
  //    L = (u^2 - 1)^2 + 0.5*v^2  — по u два минимума в ±1, по v — чаша.
  //    Сместим один минимум глубже: добавим наклон 0.35*u.
  //    L = (u^2-1)^2 + 0.5*v^2 + 0.35*u
  //    dL/du = 2(u^2-1)*2u + 0.35 = 4u(u^2-1) + 0.35
  //    dL/dv = v
  const twowells = {
    id: "twowells",
    name: "Две ямы",
    L: (u, v) => {
      const q = u * u - 1;
      return q * q + 0.5 * v * v + 0.35 * u;
    },
    grad: (u, v) => [4 * u * (u * u - 1) + 0.35, v],
    domain: { umin: -1.9, umax: 1.9, vmin: -2.1, vmax: 2.1 },
    // глобальный минимум близко к u=-1, локальный близко к u=+1
    minima: [{ u: -1.04, v: 0 }, { u: 0.96, v: 0 }],
    start: { u: 0.2, v: 1.6 },
    lr0: 0.05,
    note: "Два минимума: куда придёшь — зависит от старта. Глобальный — левый.",
  };

  const FUNCS = { bowl, rosen, saddle, twowells };
  const FUNC_LIST = [
    { id: "bowl", name: bowl.name },
    { id: "rosen", name: rosen.name },
    { id: "saddle", name: saddle.name },
    { id: "twowells", name: twowells.name },
  ];

  /* --------------------- Степпер градиентного спуска ---------------------
     Работает в координатах функции (u,v). Хранит траекторию точек,
     значения L и нормы градиента на каждом шаге. Поддерживает методы
     "vanilla" и "momentum" (скорость с коэффициентом beta).

     Правило обновления:
       vanilla:  θ ← θ − lr·∇L(θ)
       momentum: m ← β·m + ∇L(θ);  θ ← θ − lr·m
  ------------------------------------------------------------------------ */
  function GDStepper(fn, opts) {
    this.fn = fn;
    this.lr = opts.lr;
    this.method = opts.method || "vanilla"; // "vanilla" | "momentum"
    this.beta = opts.beta != null ? opts.beta : 0.9;
    this.maxNorm = 1e6;   // порог расходимости
    this.tol = 1e-7;      // порог сходимости по норме градиента

    const s = opts.start;
    this.u = s.u; this.v = s.v;
    this.mu = 0; this.mv = 0;          // импульс
    this.step = 0;
    this.done = false;
    this.diverged = false;

    const g0 = fn.grad(this.u, this.v);
    this.path = [{ u: this.u, v: this.v }];
    this.L = fn.L(this.u, this.v);
    this.gnorm = Math.hypot(g0[0], g0[1]);
    this.converged = false;
  }

  GDStepper.prototype.next = function () {
    if (this.done) return;
    const fn = this.fn;
    let g = fn.grad(this.u, this.v);
    let gx = g[0], gy = g[1];

    let du, dv;
    if (this.method === "momentum") {
      this.mu = this.beta * this.mu + gx;
      this.mv = this.beta * this.mv + gy;
      du = -this.lr * this.mu;
      dv = -this.lr * this.mv;
    } else {
      du = -this.lr * gx;
      dv = -this.lr * gy;
    }

    let nu = this.u + du, nv = this.v + dv;

    // расходимость: улетели за разумные пределы / NaN
    if (!isFinite(nu) || !isFinite(nv) ||
        Math.abs(nu) > this.maxNorm || Math.abs(nv) > this.maxNorm) {
      this.diverged = true; this.done = true;
      return;
    }

    this.u = nu; this.v = nv;
    this.step++;
    this.path.push({ u: nu, v: nv });

    const gn = fn.grad(nu, nv);
    this.gnorm = Math.hypot(gn[0], gn[1]);
    this.L = fn.L(nu, nv);

    // сходимость: градиент почти нулевой
    if (this.gnorm < this.tol) { this.converged = true; this.done = true; }
  };

  GDStepper.prototype.stats = function () {
    return {
      step: this.step,
      L: this.L,
      gnorm: this.gnorm,
      done: this.done,
      diverged: this.diverged,
      converged: this.converged,
    };
  };

  // Точечные данные «фоном» (опционально) — лёгкое облако, привязанное к seed,
  // чтобы кнопка «Данные» меняла стартовую точку детерминированно.
  function startFromSeed(fn, seed) {
    const r = rng(seed);
    const d = fn.domain;
    // равномерно по полю, но не у самого минимума и не в углах
    const u = d.umin + (0.12 + 0.76 * r()) * (d.umax - d.umin);
    const v = d.vmin + (0.12 + 0.76 * r()) * (d.vmax - d.vmin);
    return { u, v };
  }

  window.GD = {
    funcs: FUNCS,
    list: FUNC_LIST,
    Stepper: GDStepper,
    rng: rng,
    gauss: gauss,
    startFromSeed: startFromSeed,
  };
})();
