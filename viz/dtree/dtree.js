/* Пошаговое построение решающего дерева (CART) с регионами (боксами),
   чтобы рисовать осевую границу решений по мере роста дерева.
   Один step() обрабатывает один узел из очереди: делает лист или разбивает. */
(function () {
  function DTree(X, y, opts) {
    this.X = X; this.y = y; this.opts = opts;
    this.nodes = [];
    const root = this._mk(X.map((_, i) => i), 0, { x0: 0, y0: 0, x1: 1, y1: 1 });
    this.queue = [root];
    this.done = false;
  }

  DTree.prototype._mk = function (indices, depth, box) {
    const c = TreeCore.counts(indices, this.y, this.opts.nClasses);
    const id = this.nodes.length;
    this.nodes.push({
      id: id, indices: indices, depth: depth, box: box,
      counts: c, prediction: TreeCore.majority(c),
      impurity: TreeCore.impurity(c, this.opts.criterion),
      feature: null, threshold: null, left: -1, right: -1,
    });
    return id;
  };

  DTree.prototype.step = function () {
    if (!this.queue.length) { this.done = true; return { done: true }; }
    const id = this.queue.shift();
    const node = this.nodes[id];
    // стоп-критерии: глубина, мин. размер, чистый узел
    if (node.depth >= this.opts.maxDepth ||
        node.indices.length < 2 * this.opts.minSamples ||
        node.impurity <= 1e-9) {
      return { type: "leaf", id: id };
    }
    const sp = TreeCore.bestSplit(node.indices, this.X, this.y, this.opts);
    if (!sp) return { type: "leaf", id: id };

    node.feature = sp.feature; node.threshold = sp.threshold;
    const b = node.box;
    let lb, rb;
    if (sp.feature === 0) { lb = { x0: b.x0, y0: b.y0, x1: sp.threshold, y1: b.y1 }; rb = { x0: sp.threshold, y0: b.y0, x1: b.x1, y1: b.y1 }; }
    else { lb = { x0: b.x0, y0: b.y0, x1: b.x1, y1: sp.threshold }; rb = { x0: b.x0, y0: sp.threshold, x1: b.x1, y1: b.y1 }; }
    node.left = this._mk(sp.leftIdx, node.depth + 1, lb);
    node.right = this._mk(sp.rightIdx, node.depth + 1, rb);
    this.queue.push(node.left, node.right);
    return { type: "split", id: id, feature: sp.feature, threshold: sp.threshold, gain: sp.gain };
  };

  // регионы = узлы без детей (текущая разбивка плоскости)
  DTree.prototype.regions = function () { return this.nodes.filter((n) => n.left < 0 && n.right < 0); };

  DTree.prototype.predict = function (px, py) {
    let n = this.nodes[0];
    while (n.left >= 0) { const v = n.feature === 0 ? px : py; n = this.nodes[v < n.threshold ? n.left : n.right]; }
    return n.prediction;
  };

  DTree.prototype.accuracy = function () {
    let ok = 0; for (let i = 0; i < this.X.length; i++) if (this.predict(this.X[i].x, this.X[i].y) === this.y[i]) ok++;
    return ok / this.X.length;
  };

  DTree.prototype.stats = function () {
    let maxd = 0; const leaves = this.regions().length;
    for (const n of this.nodes) if (n.depth > maxd) maxd = n.depth;
    return { nodes: this.nodes.length, leaves: leaves, depth: maxd, acc: this.accuracy(), done: this.done, pending: this.queue.length };
  };

  window.DTreeStepper = DTree;
})();
