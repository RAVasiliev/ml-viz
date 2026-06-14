/* Логистическая регрессия, обучение полным градиентным спуском по лог-лоссу.
   Модель  p(x) = σ(w·(x−c)),  σ(z)=1/(1+e^{−z}). Признаки центрированы в среднем
   данных c — поэтому всего ДВА веса (w1, w2) и нет отдельного bias: граница
   проходит через центроид. Это даёт честную 2D-поверхность лог-лосса L(w1,w2),
   по которой видно спуск. Минимизируется кросс-энтропия + L2·λ.
   Один step() = одна итерация полного градиентного спуска по всей выборке. */
(function () {
  "use strict";

  function sigma(z) {
    if (z >= 0) { const e = Math.exp(-z); return 1 / (1 + e); }
    const e = Math.exp(z); return e / (1 + e);
  }

  function LogReg(points, labels, opts) {
    opts = opts || {};
    this.lr = opts.lr != null ? opts.lr : 0.5;
    this.lambda = opts.lambda != null ? opts.lambda : 0.04;
    this.maxIter = opts.maxIter != null ? opts.maxIter : 600;
    this.n = points.length;

    let cx = 0, cy = 0;
    for (const p of points) { cx += p.x; cy += p.y; }
    cx /= this.n || 1; cy /= this.n || 1;
    this.cx = cx; this.cy = cy;

    this.Phi = new Array(this.n);
    this.y = new Float64Array(this.n);
    for (let i = 0; i < this.n; i++) {
      this.Phi[i] = [points[i].x - cx, points[i].y - cy];
      this.y[i] = labels[i] > 0 ? 1 : 0;
    }
    this.reset();
  }

  LogReg.prototype.reset = function () {
    this.w = [0, 0];                 // старт из «незнания»
    this.iter = 0;
    this.done = false;
    this.loss = this.lossW(0, 0);
    this.history = [this.loss];      // лог-лосс по итерациям
    this.wHist = [[0, 0]];           // траектория весов (для поверхности)
  };

  // p(x) = σ(w·(x−c)) для нормированной точки
  LogReg.prototype.proba = function (px, py) {
    return sigma(this.w[0] * (px - this.cx) + this.w[1] * (py - this.cy));
  };

  // средний лог-лосс + L2 для ПРОИЗВОЛЬНЫХ весов (используется и для heatmap-поверхности)
  LogReg.prototype.lossW = function (a, b) {
    const n = this.n; if (n === 0) return 0;
    let s = 0;
    for (let i = 0; i < n; i++) {
      const z = a * this.Phi[i][0] + b * this.Phi[i][1];
      const p = sigma(z), yi = this.y[i];
      const pc = Math.min(1 - 1e-12, Math.max(1e-12, p));
      s += -(yi * Math.log(pc) + (1 - yi) * Math.log(1 - pc));
    }
    return s / n + 0.5 * this.lambda * (a * a + b * b);
  };

  LogReg.prototype.step = function () {
    if (this.done) return;
    const n = this.n; if (n === 0) { this.done = true; return; }
    let g0 = 0, g1 = 0;
    for (let i = 0; i < n; i++) {
      const phi = this.Phi[i];
      const p = sigma(this.w[0] * phi[0] + this.w[1] * phi[1]);
      const e = p - this.y[i];
      g0 += e * phi[0]; g1 += e * phi[1];
    }
    g0 = g0 / n + this.lambda * this.w[0];
    g1 = g1 / n + this.lambda * this.w[1];
    this.w[0] -= this.lr * g0;
    this.w[1] -= this.lr * g1;

    this.iter++;
    this.loss = this.lossW(this.w[0], this.w[1]);
    this.history.push(this.loss);
    this.wHist.push([this.w[0], this.w[1]]);
    if (this.history.length > 6000) { this.history.shift(); this.wHist.shift(); }

    if (this.iter >= this.maxIter) this.done = true;
    else if (this.history.length > 2 && Math.abs(this.history[this.history.length - 2] - this.loss) < 1e-8) this.done = true;
  };

  LogReg.prototype.accuracy = function () {
    const n = this.n; if (n === 0) return 0;
    let ok = 0;
    for (let i = 0; i < n; i++) {
      const p = sigma(this.w[0] * this.Phi[i][0] + this.w[1] * this.Phi[i][1]);
      if ((p >= 0.5 ? 1 : 0) === this.y[i]) ok++;
    }
    return ok / n;
  };
  LogReg.prototype.wnorm = function () { return Math.hypot(this.w[0], this.w[1]); };
  LogReg.prototype.stats = function () {
    return { iter: this.iter, loss: this.loss, acc: this.accuracy(), done: this.done, wnorm: this.wnorm() };
  };

  window.LogRegStepper = LogReg;
  window.LogRegStepper.sigma = sigma;
})();
