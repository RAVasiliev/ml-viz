/* Логистическая регрессия: обучение полным градиентным спуском по лог-лоссу.
   Модель  p(x) = σ(w·φ(x) + b),  σ(z) = 1/(1+e^{-z}).
   Минимизируется кросс-энтропия (= −лог-правдоподобие) с L2-регуляризацией.
   Один step() = одна итерация полного градиентного спуска по всей выборке.

   Метки приходят как {0,1}; внутри обучаем p=P(y=1|x). φ(x) — расширение
   признаков: degree 1 → (x, y); degree 2 → (x, y, x², xy, y²). Bias b отдельно
   и НЕ штрафуется L2. */
(function () {
  "use strict";

  function sigma(z) {
    // численно устойчивая сигмоида
    if (z >= 0) { const e = Math.exp(-z); return 1 / (1 + e); }
    const e = Math.exp(z); return e / (1 + e);
  }

  // φ(x): возвращает массив признаков фиксированной длины d по точке (px,py).
  function featurize(px, py, degree) {
    if (degree === 2) return [px, py, px * px, px * py, py * py];
    return [px, py];
  }

  function LogRegStepper(points, labels, opts) {
    opts = opts || {};
    this.lr = opts.lr != null ? opts.lr : 0.5;          // learning rate η
    this.lambda = opts.lambda != null ? opts.lambda : 0; // L2 λ
    this.degree = opts.degree === 2 ? 2 : 1;
    this.maxIter = opts.maxIter != null ? opts.maxIter : 400;

    this.n = points.length;
    this.degreeDim = this.degree === 2 ? 5 : 2;

    // признаки и метки {0,1}
    this.Phi = new Array(this.n);
    this.y = new Float64Array(this.n);
    for (let i = 0; i < this.n; i++) {
      const p = points[i];
      this.Phi[i] = featurize(p.x, p.y, this.degree);
      this.y[i] = labels[i] > 0 ? 1 : 0;
    }

    this.reset();
  }

  LogRegStepper.prototype.reset = function () {
    this.w = new Float64Array(this.degreeDim);  // нули — старт из «незнания»
    this.b = 0;
    this.iter = 0;
    this.done = false;
    this.loss = this._logLoss();
    this.history = [this.loss];                 // лог-лосс по итерациям
  };

  // z = w·φ(x) + b
  LogRegStepper.prototype._z = function (phi) {
    let z = this.b;
    const w = this.w;
    for (let k = 0; k < w.length; k++) z += w[k] * phi[k];
    return z;
  };

  // p(x) = σ(z) для нормированной точки (px,py)
  LogRegStepper.prototype.proba = function (px, py) {
    return sigma(this._z(featurize(px, py, this.degree)));
  };

  // средний лог-лосс (кросс-энтропия) + L2-член на веса (без bias)
  LogRegStepper.prototype._logLoss = function () {
    const n = this.n; if (n === 0) return 0;
    let s = 0;
    for (let i = 0; i < n; i++) {
      const p = sigma(this._z(this.Phi[i]));
      const yi = this.y[i];
      // −[y·log p + (1−y)·log(1−p)] с защитой от log(0)
      const pc = Math.min(1 - 1e-12, Math.max(1e-12, p));
      s += -(yi * Math.log(pc) + (1 - yi) * Math.log(1 - pc));
    }
    let reg = 0;
    if (this.lambda > 0) { for (let k = 0; k < this.w.length; k++) reg += this.w[k] * this.w[k]; }
    return s / n + 0.5 * this.lambda * reg;
  };

  // одна итерация полного градиентного спуска
  LogRegStepper.prototype.step = function () {
    if (this.done) return;
    const n = this.n;
    if (n === 0) { this.done = true; return; }

    const d = this.w.length;
    const gw = new Float64Array(d);
    let gb = 0;
    // ∂L/∂w = 1/n Σ (p_i − y_i)·φ_i ;  ∂L/∂b = 1/n Σ (p_i − y_i)
    for (let i = 0; i < n; i++) {
      const phi = this.Phi[i];
      const p = sigma(this._z(phi));
      const e = p - this.y[i];
      for (let k = 0; k < d; k++) gw[k] += e * phi[k];
      gb += e;
    }
    const lr = this.lr;
    for (let k = 0; k < d; k++) {
      gw[k] = gw[k] / n + this.lambda * this.w[k]; // L2-градиент (bias не штрафуем)
      this.w[k] -= lr * gw[k];
    }
    this.b -= lr * (gb / n);

    this.iter++;
    this.loss = this._logLoss();
    this.history.push(this.loss);
    if (this.history.length > 4000) this.history.shift();
    if (this.iter >= this.maxIter) this.done = true;
  };

  // доля верных при пороге 0.5
  LogRegStepper.prototype.accuracy = function () {
    const n = this.n; if (n === 0) return 0;
    let ok = 0;
    for (let i = 0; i < n; i++) {
      const p = sigma(this._z(this.Phi[i]));
      const pred = p >= 0.5 ? 1 : 0;
      if (pred === this.y[i]) ok++;
    }
    return ok / n;
  };

  LogRegStepper.prototype.stats = function () {
    return {
      iter: this.iter,
      loss: this.loss,
      acc: this.accuracy(),
      done: this.done,
    };
  };

  window.LogRegStepper = LogRegStepper;
  window.LogRegStepper.sigma = sigma;
})();
