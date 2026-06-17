/* Random Forest (Неделя 7): ансамбль деревьев на bootstrap-выборках со
   случайным подмножеством признаков на сплите (max_features). addTree() добавляет
   одно дерево; голоса по сетке аккумулируются для гладкой границы решений.
   Дополнительно ведём OOB-голоса (объекты вне bootstrap) и историю train/OOB
   точности по числу деревьев — для кривой выхода на плато. */
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
    const n = X.length;
    this.trees = [];
    this.votes = new Int32Array(this.G * this.G * this.nC);   // голоса деревьев по ячейкам сетки (для фона)
    this.ptVotes = new Int32Array(n * this.nC);               // голоса ансамбля на обучающих точках (train-acc)
    this.oobVotes = new Int32Array(n * this.nC);              // голоса ТОЛЬКО тех деревьев, где точка была OOB
    this.oobCount = new Int32Array(n);                        // в скольких деревьях точка оказалась вне bootstrap
    this.accHist = [];   // train-accuracy после k деревьев
    this.oobHist = [];   // OOB-accuracy после k деревьев (по точкам с oobCount>0)
    this.lastTree = null;
    this.lastOOBfrac = 0; // доля OOB в последнем дереве (≈0.368)
    this.rng = mulberry32(opts.seed || 1);
    this.done = false;
  }

  Forest.prototype.addTree = function () {
    if (this.trees.length >= this.opts.nTrees) { this.done = true; return false; }
    const n = this.X.length, nC = this.nC, G = this.G;
    const idx = new Array(n);
    const inBag = new Uint8Array(n);
    for (let i = 0; i < n; i++) { const k = (this.rng() * n) | 0; idx[i] = k; inBag[k] = 1; }
    let oob = 0; for (let i = 0; i < n; i++) if (!inBag[i]) oob++;
    this.lastOOBfrac = oob / n;

    const tree = TreeCore.buildTree(this.X, this.y, {
      nClasses: nC, criterion: this.opts.criterion,
      maxDepth: this.opts.maxDepth, minSamples: this.opts.minSamples,
      maxFeatures: this.opts.maxFeatures, rng: this.rng, indices: idx,
    });
    this.trees.push(tree);
    this.lastTree = tree;

    // голоса по сетке (фон) — предсказание этого дерева в центре каждой ячейки
    for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
      const cls = TreeCore.predict(tree, (gx + 0.5) / G, (gy + 0.5) / G);
      this.votes[(gy * G + gx) * nC + cls]++;
    }
    // голоса на обучающих точках: в ансамбль — всегда; в OOB — только если точка вне bootstrap
    for (let i = 0; i < n; i++) {
      const cls = TreeCore.predict(tree, this.X[i].x, this.X[i].y);
      this.ptVotes[i * nC + cls]++;
      if (!inBag[i]) { this.oobVotes[i * nC + cls]++; this.oobCount[i]++; }
    }
    this.accHist.push(this._accFrom(this.ptVotes, false));
    this.oobHist.push(this._accFrom(this.oobVotes, true));

    if (this.trees.length >= this.opts.nTrees) this.done = true;
    return true;
  };

  // точность по накопленным голосам; oob=true — считаем только по точкам с oobCount>0
  Forest.prototype._accFrom = function (votes, oob) {
    const n = this.X.length, nC = this.nC;
    let ok = 0, tot = 0;
    for (let i = 0; i < n; i++) {
      if (oob && this.oobCount[i] === 0) continue;
      const base = i * nC;
      let bi = 0, bv = -1;
      for (let k = 0; k < nC; k++) { const v = votes[base + k]; if (v > bv) { bv = v; bi = k; } }
      if (bv <= 0) continue;
      tot++; if (bi === this.y[i]) ok++;
    }
    return tot ? ok / tot : NaN;
  };

  // класс и уверенность (доля голосов) ячейки сетки — для фона
  Forest.prototype.cell = function (gx, gy) {
    const nC = this.nC, base = (gy * this.G + gx) * nC;
    let bi = 0, bv = -1, tot = 0;
    for (let k = 0; k < nC; k++) { const v = this.votes[base + k]; tot += v; if (v > bv) { bv = v; bi = k; } }
    return { cls: bi, conf: tot ? bv / tot : 0 };
  };

  Forest.prototype.accuracy = function () {
    if (!this.trees.length) return 0;
    const a = this._accFrom(this.ptVotes, false);
    return isFinite(a) ? a : 0;
  };
  Forest.prototype.oobAccuracy = function () {
    const a = this._accFrom(this.oobVotes, true);
    return isFinite(a) ? a : NaN;
  };

  Forest.prototype.stats = function () {
    return {
      trees: this.trees.length, target: this.opts.nTrees,
      acc: this.accuracy(), oob: this.oobAccuracy(),
      oobFrac: this.lastOOBfrac, done: this.done,
    };
  };

  window.ForestStepper = Forest;
})();
