/* Градиентный бустинг для 1D-регрессии (неделя 8).
   Своя реализация:
   - генератор данных (mulberry32 + Box–Muller) с нелинейной зависимостью y(x);
   - маленькое регрессионное дерево по одному признаку x (сплиты по порогу,
     критерий — падение взвешенной дисперсии = уменьшение MSE, лист = среднее остатков);
   - «степпер» бустинга: F0 = const(mean y); на шаге считаем остатки
     r_i = y_i − F(x_i) (для MSE антиградиент = остаток), фитим дерево по остаткам,
     F(x) ← F(x) + eta · tree(x).
   Всё в координатах x ∈ [0,1]; y — в собственном масштабе (не [0,1]). */
(function () {
  "use strict";

  /* ---------- ГПСЧ и шум ---------- */
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

  /* ---------- истинные функции y(x) ---------- */
  // Все возвращают значение примерно в [0,1] — потом добавляется шум.
  const TARGETS = {
    sine(x) { return 0.5 + 0.38 * Math.sin(2 * Math.PI * x); },
    steps(x) {
      // кусочно-постоянная «лестница» — наглядно для ступенчатого ансамбля
      if (x < 0.25) return 0.22;
      if (x < 0.5) return 0.72;
      if (x < 0.72) return 0.40;
      return 0.84;
    },
    sawtooth(x) {
      // пила: три наклонных рампы с резкими обрывами
      return 0.15 + 0.7 * ((x * 3) % 1);
    },
    bump(x) {
      // локальный всплеск на плоском фоне — бустинг «нацеливается» на один регион
      return 0.2 + 0.66 * Math.exp(-Math.pow((x - 0.55) / 0.085, 2));
    },
    sigmoid(x) {
      // гладкая, но резкая ступень (логистическая)
      return 0.16 + 0.68 / (1 + Math.exp(-16 * (x - 0.45)));
    },
    doublebump(x) {
      // две горки разной ширины
      return 0.18 + 0.5 * Math.exp(-Math.pow((x - 0.3) / 0.08, 2)) + 0.56 * Math.exp(-Math.pow((x - 0.74) / 0.06, 2));
    },
    wave(x) {
      // затухающая синусоида + наклон
      return 0.5 + 0.30 * Math.sin(3.4 * Math.PI * x) * (1 - 0.5 * x) + 0.12 * x;
    },
  };

  function generate(targetId, n, noise, seed) {
    const r = rng(seed);
    const f = TARGETS[targetId] || TARGETS.sine;
    const xs = new Float64Array(n), ys = new Float64Array(n), ytrue = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const x = r();
      xs[i] = x;
      ytrue[i] = f(x);
      ys[i] = f(x) + gauss(r, 0, noise);
    }
    // сортировка по x — удобно для рисования кривой и сплитов
    const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => xs[a] - xs[b]);
    const X = new Float64Array(n), Y = new Float64Array(n), T = new Float64Array(n);
    for (let k = 0; k < n; k++) { X[k] = xs[idx[k]]; Y[k] = ys[idx[k]]; T[k] = ytrue[idx[k]]; }
    return { x: X, y: Y, ytrue: T, target: targetId, fn: f };
  }

  /* ---------- маленькое 1D регрессионное дерево по остаткам ----------
     Жадно строит бинарное дерево глубины maxDepth, сплит по порогу x ≤ A,
     критерий — максимальное падение суммарной квадратичной ошибки (SSE),
     что эквивалентно уменьшению MSE/взвешенной дисперсии. Лист = среднее target. */
  function buildTree(x, target, maxDepth, minLeaf) {
    const n = x.length;
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => x[a] - x[b]);

    function leaf(idxs) {
      let s = 0;
      for (const i of idxs) s += target[i];
      return { leaf: true, value: idxs.length ? s / idxs.length : 0, n: idxs.length };
    }

    // лучший сплит по индексам (idxs отсортированы по x): возвращает {thr, left, right, gain}
    function bestSplit(idxs) {
      const m = idxs.length;
      if (m < 2 * minLeaf) return null;
      let total = 0, totalSq = 0;
      for (const i of idxs) { total += target[i]; totalSq += target[i] * target[i]; }
      const sseAll = totalSq - (total * total) / m;
      let bestGain = 1e-12, bestK = -1;
      let sumL = 0, cntL = 0;
      // префиксные суммы слева направо; сплит между k и k+1
      for (let k = 0; k < m - 1; k++) {
        const i = idxs[k];
        sumL += target[i]; cntL++;
        const cntR = m - cntL;
        if (cntL < minLeaf || cntR < minLeaf) continue;
        // не делим равные x — порог должен реально разделять
        if (x[idxs[k]] === x[idxs[k + 1]]) continue;
        const sumR = total - sumL;
        const sseL = -(sumL * sumL) / cntL; // постоянная totalSq_L опускается симметрично
        const sseR = -(sumR * sumR) / cntR;
        // gain = SSE_до − SSE_после; SSE = Σy² − (Σy)²/n, член Σy² общий → сравниваем − (Σy)²/n части
        const gain = (-(total * total) / m) - (sseL + sseR);
        if (gain > bestGain) { bestGain = gain; bestK = k; }
      }
      if (bestK < 0) return null;
      const thr = (x[idxs[bestK]] + x[idxs[bestK + 1]]) / 2;
      const left = [], right = [];
      for (const i of idxs) (x[i] <= thr ? left : right).push(i);
      return { thr, left, right };
    }

    let nodes = 0;
    function grow(idxs, depth) {
      nodes++;
      if (depth >= maxDepth || idxs.length < 2 * minLeaf) return leaf(idxs);
      const s = bestSplit(idxs);
      if (!s) return leaf(idxs);
      return {
        leaf: false, thr: s.thr,
        left: grow(s.left, depth + 1),
        right: grow(s.right, depth + 1),
      };
    }

    const root = grow(order.slice(), 0);
    return { root, nodes };
  }

  function treePredict(node, xq) {
    while (!node.leaf) node = (xq <= node.thr) ? node.left : node.right;
    return node.value;
  }

  /* ---------- «степпер» бустинга ---------- */
  function BoostStepper(data, opts) {
    this.x = data.x;
    this.y = data.y;
    this.n = this.x.length;
    this.eta = opts.eta;
    this.maxDepth = opts.maxDepth;
    this.minLeaf = opts.minLeaf || 1;
    this.target = opts.target || 0;     // целевое число деревьев (для прогресса)

    // F0 = const(mean y) — начальное приближение
    let s = 0;
    for (let i = 0; i < this.n; i++) s += this.y[i];
    this.F0 = this.n ? s / this.n : 0;

    this.F = new Float64Array(this.n).fill(this.F0); // текущие предсказания ансамбля на обучении
    this.trees = [];           // список деревьев (структура + value в листьях)
    this.lastResid = null;     // остатки, по которым фитилось последнее дерево
    this.lastTree = null;      // последнее дерево
    this.mseHistory = [this._mse()]; // train-MSE: индекс 0 — до деревьев (только F0)

    // отложенная (тестовая) выборка — не участвует в обучении, нужна для честной ошибки
    this.xt = opts.xt || null;
    this.yt = opts.yt || null;
    this.nt = this.xt ? this.xt.length : 0;
    this.Ft = this.nt ? new Float64Array(this.nt).fill(this.F0) : null;
    this.mseTestHistory = this.nt ? [this._mseTest()] : [];

    this.done = false;
  }

  BoostStepper.prototype._mseTest = function () {
    if (!this.nt) return NaN;
    let s = 0;
    for (let i = 0; i < this.nt; i++) { const e = this.yt[i] - this.Ft[i]; s += e * e; }
    return s / this.nt;
  };

  BoostStepper.prototype._mse = function () {
    let s = 0;
    for (let i = 0; i < this.n; i++) { const e = this.y[i] - this.F[i]; s += e * e; }
    return this.n ? s / this.n : 0;
  };

  // добавить одно дерево
  BoostStepper.prototype.step = function () {
    if (this.done) return;
    // остатки = антиградиент MSE: r_i = y_i − F(x_i)
    const resid = new Float64Array(this.n);
    for (let i = 0; i < this.n; i++) resid[i] = this.y[i] - this.F[i];
    // фитим неглубокое дерево по остаткам
    const t = buildTree(this.x, resid, this.maxDepth, this.minLeaf);
    // обновляем ансамбль: F ← F + eta · tree(x)
    for (let i = 0; i < this.n; i++) this.F[i] += this.eta * treePredict(t.root, this.x[i]);
    // то же на тестовой выборке (для честной ошибки)
    if (this.nt) { for (let i = 0; i < this.nt; i++) this.Ft[i] += this.eta * treePredict(t.root, this.xt[i]); }
    this.trees.push(t.root);
    this.lastResid = resid;
    this.lastTree = t.root;
    this.mseHistory.push(this._mse());
    if (this.nt) this.mseTestHistory.push(this._mseTest());
    if (this.target > 0 && this.trees.length >= this.target) this.done = true;
  };

  // предсказание ансамбля в точке x: F0 + eta·Σ tree_k(x)
  BoostStepper.prototype.predict = function (xq) {
    let v = this.F0;
    for (const root of this.trees) v += this.eta * treePredict(root, xq);
    return v;
  };

  // предсказание ПОСЛЕДНЕГО дерева (без eta) — ступеньки по остаткам
  BoostStepper.prototype.predictLastTree = function (xq) {
    return this.lastTree ? treePredict(this.lastTree, xq) : 0;
  };

  BoostStepper.prototype.stats = function () {
    const h = this.mseHistory, ht = this.mseTestHistory;
    return {
      nTrees: this.trees.length,
      mse: h[h.length - 1],
      mseTest: this.nt ? ht[ht.length - 1] : NaN,
      done: this.done,
    };
  };

  window.Boosting = {
    generate,
    BoostStepper,
    targets: [
      { id: "sine", name: "Синус" },
      { id: "sawtooth", name: "Пила" },
      { id: "steps", name: "Ступеньки" },
      { id: "bump", name: "Всплеск" },
      { id: "sigmoid", name: "Сигмоида" },
      { id: "doublebump", name: "Две горки" },
      { id: "wave", name: "Волна с затуханием" },
    ],
  };
})();
