/* Ядерный SVM через Pegasos (стохастический субградиентный спуск).
   Решающая функция f(x) = Σ_i α_i y_i K(x_i, x).
   Метки y ∈ {−1, +1}; датасет даёт {0,1} → маппинг 0 → −1.

   Pegasos (Shalev-Shwartz et al.) в ядерной формулировке держит счётчики
   β_i (целые), накопленные за t шагов; эффективный коэффициент
   α_i = β_i / (λ · t), где λ = 1/(C·ℓ) — сила регуляризации (мягкий отступ).
   На каждом шаге берётся случайный объект i, считается отступ
   M = y_i · f_t(x_i); если M < 1 — точка «толкает» границу: β_i += 1.

   Шаг визуализации = одна эпоха (ℓ субградиентных обновлений), чтобы
   граница менялась заметно. До сходимости обучаем при смене параметров. */
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

  function KernelSVM(X, y01, opts) {
    opts = opts || {};
    this.X = X;                              // [{x,y}] в [0,1]
    this.n = X.length;
    // метки в {−1,+1}
    this.y = new Float64Array(this.n);
    for (let i = 0; i < this.n; i++) this.y[i] = y01[i] === 0 ? -1 : 1;

    this.kernel = opts.kernel || "rbf";      // 'linear' | 'rbf'
    this.gamma = opts.gamma != null ? opts.gamma : 20;
    this.C = opts.C != null ? opts.C : 1;
    this.B0 = 1;                             // константа смещения (bias-признак)
    // λ = 1/(C·ℓ): больше C → меньше λ → слабее регуляризация → уже отступ
    this.lambda = 1 / (Math.max(1e-6, this.C) * Math.max(1, this.n));

    this.beta = new Float64Array(this.n);    // целочисленные счётчики Pegasos
    this.t = 0;                              // число субградиентных шагов
    this.epoch = 0;
    this.rand = rng(opts.seed || 1);

    // кэш матрицы Грама — ядро от параметров, пересчёт при rebuild
    this._gram = this._buildGram();
    this.done = false;
    this.maxEpochs = opts.maxEpochs || 60;
  }

  KernelSVM.prototype._kernelRaw = function (xi, xj) {
    // B0 — добавочная константа к ядру: эквивалент аугментации вектора
    // признаков постоянной компонентой, что даёт модели смещение b
    // (предсказание f(x) = Σ αᵢyᵢK(xᵢ,x) + b из конспекта).
    if (this.kernel === "linear") {
      // координаты центрируем в 0, чтобы смещение училось естественно
      return (xi.x - 0.5) * (xj.x - 0.5) + (xi.y - 0.5) * (xj.y - 0.5) + this.B0;
    }
    // RBF: exp(−γ‖xi−xj‖²) + смещение
    const dx = xi.x - xj.x, dy = xi.y - xj.y;
    return Math.exp(-this.gamma * (dx * dx + dy * dy)) + this.B0;
  };

  KernelSVM.prototype._buildGram = function () {
    const n = this.n, X = this.X;
    const G = new Float64Array(n * n);
    for (let i = 0; i < n; i++) {
      G[i * n + i] = this._kernelRaw(X[i], X[i]);
      for (let j = i + 1; j < n; j++) {
        const k = this._kernelRaw(X[i], X[j]);
        G[i * n + j] = k; G[j * n + i] = k;
      }
    }
    return G;
  };

  // f_t(x_idx) по матрице Грама: эффективные α_i = β_i / (λ·t)
  KernelSVM.prototype._fGram = function (idx) {
    if (this.t === 0) return 0;
    const n = this.n, G = this._gram, scale = 1 / (this.lambda * this.t);
    let s = 0;
    for (let j = 0; j < n; j++) {
      const b = this.beta[j];
      if (b !== 0) s += b * this.y[j] * G[j * n + idx];
    }
    return s * scale;
  };

  // f(p) для произвольной точки плоскости (для heatmap/контуров)
  KernelSVM.prototype.f = function (px, py) {
    if (this.t === 0) return 0;
    const n = this.n, X = this.X, scale = 1 / (this.lambda * this.t);
    const q = { x: px, y: py };
    let s = 0;
    for (let j = 0; j < n; j++) {
      const b = this.beta[j];
      if (b !== 0) s += b * this.y[j] * this._kernelRaw(X[j], q);
    }
    return s * scale;
  };

  // одна эпоха = ℓ субградиентных шагов Pegasos
  KernelSVM.prototype.step = function () {
    if (this.done) return;
    const n = this.n;
    for (let s = 0; s < n; s++) {
      this.t++;
      const i = Math.floor(this.rand() * n);
      const M = this.y[i] * this._fGram(i);   // отступ M = y·f(x)
      if (M < 1) this.beta[i] += 1;            // точка внутри отступа / ошибка
    }
    this.epoch++;
    if (this.epoch >= this.maxEpochs) this.done = true;
  };

  // эффективные α_i (для подсветки опорных векторов и статистики)
  KernelSVM.prototype.alpha = function (i) {
    if (this.t === 0) return 0;
    return (this.beta[i] * this.y[i]) / (this.lambda * this.t);
  };

  // |α_i| > 0 → точка участвует в решении (опорный вектор Pegasos)
  KernelSVM.prototype.isSupport = function (i) {
    return this.beta[i] > 0;
  };

  KernelSVM.prototype.predict = function (px, py) {
    return this.f(px, py) >= 0 ? 1 : 0;       // знак f → класс {0,1}
  };

  // статистика: опорных векторов, train-accuracy, ширина отступа (linear)
  KernelSVM.prototype.stats = function () {
    const n = this.n;
    let sv = 0, correct = 0;
    for (let i = 0; i < n; i++) {
      if (this.beta[i] > 0) sv++;
      const fi = this._fGram(i);
      if ((fi >= 0 ? 1 : -1) === this.y[i]) correct++;
    }
    let marginWidth = null;
    if (this.kernel === "linear" && this.t > 0) {
      // w = Σ α_i y_i x_i; ширина полосы = 2/‖w‖
      // координаты центрированы (как в ядре), смещение b — в B0
      let wx = 0, wy = 0;
      const scale = 1 / (this.lambda * this.t);
      for (let j = 0; j < n; j++) {
        const c = this.beta[j] * this.y[j] * scale;
        if (c !== 0) { wx += c * (this.X[j].x - 0.5); wy += c * (this.X[j].y - 0.5); }
      }
      const wnorm = Math.sqrt(wx * wx + wy * wy);
      marginWidth = wnorm > 1e-9 ? 2 / wnorm : null;
    }
    return {
      sv,
      acc: n ? correct / n : 0,
      epoch: this.epoch,
      marginWidth,
      done: this.done,
    };
  };

  window.KernelSVM = KernelSVM;
})();
