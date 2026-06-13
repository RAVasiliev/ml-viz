/* Random Forest (Неделя 7): ансамбль деревьев на bootstrap-выборках со
   случайным подмножеством признаков на сплите (max_features). step() добавляет
   одно дерево; голоса по сетке аккумулируются для гладкой границы решений. */
(function () {
  function mulberry32(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function Forest(X, y, opts) {
    this.X = X; this.y = y; this.opts = opts;     // {nTrees, maxDepth, minSamples, criterion, maxFeatures, nClasses, seed, grid}
    this.G = opts.grid || 60;
    this.nC = opts.nClasses;
    this.trees = [];
    this.votes = new Int32Array(this.G * this.G * this.nC); // голоса деревьев по ячейкам
    this.lastTree = null;
    this.rng = mulberry32(opts.seed || 1);
    this.done = false;
  }

  Forest.prototype.addTree = function () {
    if (this.trees.length >= this.opts.nTrees) { this.done = true; return false; }
    const n = this.X.length;
    const idx = new Array(n);
    for (let i = 0; i < n; i++) idx[i] = (this.rng() * n) | 0; // bootstrap (с возвращением)
    const tree = TreeCore.buildTree(this.X, this.y, {
      nClasses: this.nC, criterion: this.opts.criterion,
      maxDepth: this.opts.maxDepth, minSamples: this.opts.minSamples,
      maxFeatures: this.opts.maxFeatures, rng: this.rng, indices: idx,
    });
    this.trees.push(tree);
    this.lastTree = tree;
    // аккумулируем голоса по сетке
    const G = this.G, nC = this.nC;
    for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
      const cls = TreeCore.predict(tree, (gx + 0.5) / G, (gy + 0.5) / G);
      this.votes[(gy * G + gx) * nC + cls]++;
    }
    if (this.trees.length >= this.opts.nTrees) this.done = true;
    return true;
  };

  // класс и уверенность (доля голосов) ячейки сетки
  Forest.prototype.cell = function (gx, gy) {
    const nC = this.nC, base = (gy * this.G + gx) * nC;
    let bi = 0, bv = -1, tot = 0;
    for (let k = 0; k < nC; k++) { const v = this.votes[base + k]; tot += v; if (v > bv) { bv = v; bi = k; } }
    return { cls: bi, conf: tot ? bv / tot : 0 };
  };

  // голосование всего ансамбля в точке (для accuracy)
  Forest.prototype.predict = function (px, py) {
    const c = new Array(this.nC).fill(0);
    for (const t of this.trees) c[TreeCore.predict(t, px, py)]++;
    return TreeCore.majority(c);
  };
  Forest.prototype.accuracy = function () {
    if (!this.trees.length) return 0;
    let ok = 0; for (let i = 0; i < this.X.length; i++) if (this.predict(this.X[i].x, this.X[i].y) === this.y[i]) ok++;
    return ok / this.X.length;
  };

  Forest.prototype.stats = function () {
    return { trees: this.trees.length, target: this.opts.nTrees, acc: this.accuracy(), done: this.done };
  };

  window.ForestStepper = Forest;
})();
