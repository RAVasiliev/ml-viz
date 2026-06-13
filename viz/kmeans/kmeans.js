/* Пошаговый K-Means.
   Один шаг step() = одна полуфаза: либо «assign» (распределить точки по
   ближайшим центроидам), либо «update» (сдвинуть центроиды в центры масс).
   Так на экране видно чередование двух фаз и сходимость. */
(function () {
  function dist2(a, b) { const dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; }

  function KMeans(points, k, initMethod) {
    this.points = points;
    this.n = points.length;
    this.k = k;
    this.assign = new Array(this.n).fill(-1);
    this.phase = "assign";   // что выполнит следующий step()
    this.iter = 0;
    this.converged = false;
    this.moved = 0;          // суммарное смещение центроидов на последнем update
    this.inertia = 0;        // сумма квадратов расстояний до своего центроида
    this.centroids =
      initMethod === "kpp" ? this._initPP() :
      initMethod === "farthest" ? this._initFarthest() :
      this._initRandom();
  }

  // Случайные стартовые центроиды — k различных точек данных.
  KMeans.prototype._initRandom = function () {
    const idx = new Set();
    while (idx.size < Math.min(this.k, this.n)) idx.add((Math.random() * this.n) | 0);
    return [...idx].map((i) => ({ x: this.points[i].x, y: this.points[i].y }));
  };

  // farthest-first (maximin, алгоритм Гонзалеса): детерминированно —
  // каждый следующий центр это точка, максимально удалённая от ближайшего центра.
  KMeans.prototype._initFarthest = function () {
    const c = [{ ...this.points[(Math.random() * this.n) | 0] }];
    while (c.length < Math.min(this.k, this.n)) {
      let bi = 0, bd = -1;
      for (let i = 0; i < this.n; i++) {
        let nearest = Infinity;
        for (const cc of c) { const dd = dist2(this.points[i], cc); if (dd < nearest) nearest = dd; }
        if (nearest > bd) { bd = nearest; bi = i; }
      }
      c.push({ ...this.points[bi] });
    }
    return c;
  };

  // k-means++ : первый центр случаен, далее — с вероятностью ∝ D².
  KMeans.prototype._initPP = function () {
    const c = [{ ...this.points[(Math.random() * this.n) | 0] }];
    while (c.length < Math.min(this.k, this.n)) {
      const d = this.points.map((p) => Math.min(...c.map((cc) => dist2(p, cc))));
      const sum = d.reduce((s, x) => s + x, 0);
      let r = Math.random() * sum, pick = 0;
      for (let i = 0; i < this.n; i++) { r -= d[i]; if (r <= 0) { pick = i; break; } }
      c.push({ ...this.points[pick] });
    }
    return c;
  };

  KMeans.prototype.step = function () {
    if (this.converged) return { done: true };
    if (this.phase === "assign") {
      let inertia = 0;
      for (let i = 0; i < this.n; i++) {
        let best = 0, bd = Infinity;
        for (let c = 0; c < this.k; c++) {
          const dd = dist2(this.points[i], this.centroids[c]);
          if (dd < bd) { bd = dd; best = c; }
        }
        this.assign[i] = best;
        inertia += bd;
      }
      this.inertia = inertia;
      this.phase = "update";
      return { type: "assign", inertia };
    }
    // update
    const sums = Array.from({ length: this.k }, () => ({ x: 0, y: 0, n: 0 }));
    for (let i = 0; i < this.n; i++) {
      const c = this.assign[i];
      sums[c].x += this.points[i].x; sums[c].y += this.points[i].y; sums[c].n++;
    }
    let moved = 0;
    for (let c = 0; c < this.k; c++) {
      let nx, ny;
      if (sums[c].n === 0) { // пустой кластер — пересеиваем в случайную точку
        const p = this.points[(Math.random() * this.n) | 0];
        nx = p.x; ny = p.y;
      } else {
        nx = sums[c].x / sums[c].n; ny = sums[c].y / sums[c].n;
      }
      moved += Math.hypot(nx - this.centroids[c].x, ny - this.centroids[c].y);
      this.centroids[c] = { x: nx, y: ny };
    }
    this.moved = moved;
    this.iter++;
    this.phase = "assign";
    if (moved < 1e-4) this.converged = true;
    return { type: "update", moved };
  };

  KMeans.prototype.stats = function () {
    const sizes = new Array(this.k).fill(0);
    for (let i = 0; i < this.n; i++) if (this.assign[i] >= 0) sizes[this.assign[i]]++;
    return {
      iter: this.iter, inertia: this.inertia, moved: this.moved,
      converged: this.converged, phase: this.phase, sizes,
    };
  };

  window.KMeansStepper = KMeans;
})();
