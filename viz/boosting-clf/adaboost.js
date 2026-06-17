/* AdaBoost для 2D-классификации (бустинг перевзвешиванием, неделя 8).
   Слабый ученик — решающий пень (одно осевое условие x_j ≤ t с полярностью).
   На каждом шаге:
     • обучаем пень, минимизируя ВЗВЕШЕННУЮ ошибку err по текущим весам w_i;
     • вес ученика α = ½·ln((1−err)/err);
     • перевзвешиваем объекты w_i ← w_i·exp(−α·y_i·h(x_i)) и нормируем
       (ошибочные тяжелеют, верно классифицированные легчают);
     • итог H(x) = sign(Σ α_m h_m(x)) — взвешенное голосование пней.
   Метки внутри: y ∈ {−1,+1} (класс 0 → −1, класс 1 → +1). */
(function () {
  "use strict";

  function mulberry32(seed) {
    let a = (seed >>> 0) || 1;
    return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  const feat = (p, f) => (f === 0 ? p.x : p.y);
  // предсказание пня: ±1
  function stumpPredict(s, px, py) {
    const v = (s.feat === 0 ? px : py);
    return (v <= s.thr ? -1 : 1) * s.pol;
  }

  // лучший пень по взвешенной ошибке (перебор признака, порога и полярности)
  function fitStump(X, y, w) {
    const n = X.length;
    let totalW = 0; for (let i = 0; i < n; i++) totalW += w[i];
    let best = { err: Infinity, feat: 0, thr: 0, pol: 1 };
    for (let f = 0; f < 2; f++) {
      const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => feat(X[a], f) - feat(X[b], f));
      // пороги: ниже всех, между соседними, выше всех
      for (let k = -1; k < n; k++) {
        let thr;
        if (k < 0) thr = feat(X[order[0]], f) - 0.02;
        else if (k < n - 1) { const a = feat(X[order[k]], f), b = feat(X[order[k + 1]], f); if (a === b) continue; thr = (a + b) / 2; }
        else thr = feat(X[order[n - 1]], f) + 0.02;
        // взвешенная ошибка для полярности +1 (предсказываем +1 при v>thr)
        let errP = 0;
        for (let i = 0; i < n; i++) { const pred = (feat(X[i], f) <= thr ? -1 : 1); if (pred !== y[i]) errP += w[i]; }
        errP /= totalW;
        if (errP < best.err) best = { err: errP, feat: f, thr, pol: 1 };
        const errN = 1 - errP; // противоположная полярность
        if (errN < best.err) best = { err: errN, feat: f, thr, pol: -1 };
      }
    }
    return best;
  }

  function AdaBoost(X, y, opts) {
    this.X = X; this.y = y; this.n = X.length;     // y ∈ {−1,+1}
    this.Xt = opts.Xt || null; this.yt = opts.yt || null;
    this.nt = this.Xt ? this.Xt.length : 0;
    this.target = opts.target || 30;
    this.rng = mulberry32(opts.seed || 1);
    this.G = opts.grid || 64;

    this.w = new Array(this.n).fill(1 / this.n);    // веса объектов (для размера точек)
    this.stumps = [];                               // {feat,thr,pol,alpha,err}
    this.lastStump = null;
    this.totalAlpha = 0;
    this.margin = new Float64Array(this.G * this.G); // Σ α·h по сетке (для границы ансамбля)
    this.Ftr = new Float64Array(this.n);             // Σ α·h на train (для ошибки)
    this.Fte = this.nt ? new Float64Array(this.nt) : null;
    this.errTrainHist = [0.5];                       // индекс 0 — до пней (случайно)
    this.errTestHist = this.nt ? [0.5] : [];
    this.done = false;
  }

  AdaBoost.prototype._errTrain = function () {
    let bad = 0; for (let i = 0; i < this.n; i++) { const s = this.Ftr[i]; const pred = s >= 0 ? 1 : -1; if (pred !== this.y[i]) bad++; }
    return bad / this.n;
  };
  AdaBoost.prototype._errTest = function () {
    if (!this.nt) return NaN;
    let bad = 0; for (let i = 0; i < this.nt; i++) { const s = this.Fte[i]; const pred = s >= 0 ? 1 : -1; if (pred !== this.yt[i]) bad++; }
    return bad / this.nt;
  };

  AdaBoost.prototype.step = function () {
    if (this.done) return;
    const s = fitStump(this.X, this.y, this.w);
    const err = Math.min(0.5 - 1e-9, Math.max(1e-6, s.err));   // err ≤ 0.5 (полярность гарантирует)
    const alpha = 0.5 * Math.log((1 - err) / err);
    s.alpha = alpha; s.err = err;
    this.stumps.push(s); this.lastStump = s; this.totalAlpha += Math.abs(alpha);

    // перевзвешивание объектов
    let Z = 0;
    for (let i = 0; i < this.n; i++) { const h = stumpPredict(s, this.X[i].x, this.X[i].y); this.w[i] *= Math.exp(-alpha * this.y[i] * h); Z += this.w[i]; }
    for (let i = 0; i < this.n; i++) this.w[i] /= Z;

    // накапливаем маржу: сетка + train + test
    const G = this.G;
    for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) this.margin[gy * G + gx] += alpha * stumpPredict(s, (gx + 0.5) / G, (gy + 0.5) / G);
    for (let i = 0; i < this.n; i++) this.Ftr[i] += alpha * stumpPredict(s, this.X[i].x, this.X[i].y);
    if (this.nt) for (let i = 0; i < this.nt; i++) this.Fte[i] += alpha * stumpPredict(s, this.Xt[i].x, this.Xt[i].y);

    this.errTrainHist.push(this._errTrain());
    if (this.nt) this.errTestHist.push(this._errTest());
    if (this.stumps.length >= this.target) this.done = true;
  };

  // класс (0/1) и уверенность ячейки сетки — для фоновой границы ансамбля
  AdaBoost.prototype.cell = function (gx, gy) {
    const m = this.margin[gy * this.G + gx];
    return { cls: m >= 0 ? 1 : 0, conf: this.totalAlpha ? Math.min(1, Math.abs(m) / this.totalAlpha) : 0 };
  };
  // предсказание последнего пня в точке (для полуплоскости панели слабого ученика): класс 0/1
  AdaBoost.prototype.stumpClass = function (px, py) { return this.lastStump ? (stumpPredict(this.lastStump, px, py) >= 0 ? 1 : 0) : 0; };

  AdaBoost.prototype.stats = function () {
    const h = this.errTrainHist, ht = this.errTestHist;
    return {
      nStumps: this.stumps.length, target: this.target,
      errTrain: h[h.length - 1], errTest: this.nt ? ht[ht.length - 1] : NaN,
      lastAlpha: this.lastStump ? this.lastStump.alpha : NaN,
      lastErr: this.lastStump ? this.lastStump.err : NaN,
      done: this.done,
    };
  };

  window.AdaBoost = { AdaBoost, stumpPredict };
})();
