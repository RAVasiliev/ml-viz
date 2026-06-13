/* Общее ядро решающих деревьев (CART) — для Decision Tree и Random Forest.
   Терминология по курсу (Неделя 6): осевые разбиения, критерии информативности
   Джини / энтропия, нормированный функционал качества Q(R,j,t). */
(function () {
  const GINI = "gini", ENTROPY = "entropy";

  function counts(indices, y, nClasses) {
    const c = new Array(nClasses).fill(0);
    for (const i of indices) c[y[i]]++;
    return c;
  }
  // мера неопределённости региона H(R)
  function impurity(c, criterion) {
    let tot = 0; for (const k of c) tot += k;
    if (tot === 0) return 0;
    if (criterion === ENTROPY) {
      let e = 0; for (const k of c) { if (k > 0) { const p = k / tot; e -= p * Math.log2(p); } }
      return e;
    }
    let g = 1; for (const k of c) { const p = k / tot; g -= p * p; } // Джини
    return g;
  }
  function majority(c) { let bi = 0, bv = -1; for (let k = 0; k < c.length; k++) if (c[k] > bv) { bv = c[k]; bi = k; } return bi; }

  /* Лучшее осевое разбиение региона. opts: {nClasses, criterion, minSamples, maxFeatures, rng}.
     Возвращает {feature, threshold, gain, leftIdx, rightIdx} или null. */
  function bestSplit(indices, X, y, opts) {
    const nC = opts.nClasses, crit = opts.criterion, minLeaf = opts.minSamples || 1;
    const N = indices.length;
    const parent = counts(indices, y, nC);
    const parentImp = impurity(parent, crit);

    let feats = [0, 1];
    if (opts.maxFeatures && opts.maxFeatures < 2) feats = (opts.rng() < 0.5) ? [0] : [1]; // random subspace (для леса)

    let best = null;
    for (const f of feats) {
      const sorted = indices.slice().sort((a, b) => (f === 0 ? X[a].x - X[b].x : X[a].y - X[b].y));
      const left = new Array(nC).fill(0);
      for (let s = 0; s < sorted.length - 1; s++) {
        left[y[sorted[s]]]++;
        const va = f === 0 ? X[sorted[s]].x : X[sorted[s]].y;
        const vb = f === 0 ? X[sorted[s + 1]].x : X[sorted[s + 1]].y;
        if (va === vb) continue;
        const nl = s + 1, nr = N - nl;
        if (nl < minLeaf || nr < minLeaf) continue;
        const right = parent.map((c, k) => c - left[k]);
        const imp = (nl / N) * impurity(left, crit) + (nr / N) * impurity(right, crit);
        const gain = parentImp - imp;
        if (!best || gain > best.gain) best = { feature: f, threshold: (va + vb) / 2, gain: gain };
      }
    }
    if (!best || best.gain <= 1e-9) return null;
    const leftIdx = [], rightIdx = [];
    for (const i of indices) { const v = best.feature === 0 ? X[i].x : X[i].y; (v < best.threshold ? leftIdx : rightIdx).push(i); }
    best.leftIdx = leftIdx; best.rightIdx = rightIdx;
    return best;
  }

  // Полное построение дерева (для Random Forest). Возвращает корень {leaf, prediction, feature, threshold, left, right}.
  function buildTree(X, y, opts) {
    const idx = opts.indices || X.map((_, i) => i);
    function rec(indices, depth) {
      const c = counts(indices, y, opts.nClasses);
      const node = { leaf: true, prediction: majority(c), counts: c, depth: depth, n: indices.length };
      if (depth >= opts.maxDepth || indices.length < 2 * (opts.minSamples || 1) || impurity(c, opts.criterion) <= 1e-9) return node;
      const sp = bestSplit(indices, X, y, opts);
      if (!sp) return node;
      node.leaf = false; node.feature = sp.feature; node.threshold = sp.threshold;
      node.left = rec(sp.leftIdx, depth + 1);
      node.right = rec(sp.rightIdx, depth + 1);
      return node;
    }
    return rec(idx, 0);
  }

  function predict(node, px, py) {
    while (!node.leaf) { const v = node.feature === 0 ? px : py; node = (v < node.threshold) ? node.left : node.right; }
    return node.prediction;
  }

  window.TreeCore = { GINI, ENTROPY, counts, impurity, majority, bestSplit, buildTree, predict };
})();
