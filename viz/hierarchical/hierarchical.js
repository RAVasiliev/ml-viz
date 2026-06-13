/* Пошаговая агломеративная иерархическая кластеризация.
   Старт: каждая точка — свой кластер. Шаг step() сливает два ближайших
   кластера. Дерево слияний строится ВСЕГДА до единого корня (1 кластер).
   «Срез на K» — параметр отрисовки, а не остановки (см. app.js).
   Расстояние между кластерами пересчитывается по Ланса–Уильямсу
   (single / complete / average). */
(function () {
  function Hierarchical(points, linkage) {
    this.points = points;
    this.n = points.length;
    this.linkage = linkage || "average";

    this.active = [];          // id активных кластеров
    this.size = new Array(this.n).fill(1);
    this.cx = points.map((p) => p.x);
    this.cy = points.map((p) => p.y);
    this.members = points.map((_, i) => [i]);
    this.clusterOf = points.map((_, i) => i);
    this.edges = [];           // {x1,y1,x2,y2,level} — линии слияний на поле

    // дерево слияний для дендрограммы
    this.nextNode = this.n;                  // id следующего внутреннего узла
    this.nodeOf = points.map((_, i) => i);   // активный кластер id -> текущий узел дерева
    this.children = new Array(2 * this.n);   // children[node] = [a, b]
    this.height = new Float64Array(2 * this.n); // высота узла = порог слияния (листья = 0)
    this.merges = [];          // [{node, level}] в порядке слияний

    this.D = [];
    for (let i = 0; i < this.n; i++) {
      this.D[i] = new Float64Array(this.n);
      this.active.push(i);
    }
    const ward = this.linkage === "ward";
    for (let i = 0; i < this.n; i++) {
      for (let j = i + 1; j < this.n; j++) {
        const dx = points[i].x - points[j].x, dy = points[i].y - points[j].y;
        let d = Math.hypot(dx, dy);
        if (ward) d = d * d;          // метод Уорда работает на квадратах расстояний
        this.D[i][j] = d; this.D[j][i] = d;
      }
    }
    this.done = this.active.length <= 1;
  }

  Hierarchical.prototype.step = function () {
    if (this.done || this.active.length <= 1) { this.done = true; return { done: true }; }

    // ближайшая пара активных кластеров
    let bi = -1, bj = -1, best = Infinity;
    const A = this.active;
    for (let a = 0; a < A.length; a++) {
      const i = A[a];
      for (let b = a + 1; b < A.length; b++) {
        const j = A[b];
        const d = this.D[i][j];
        if (d < best) { best = d; bi = i; bj = j; }
      }
    }

    // линия слияния на поле — между текущими центрами кластеров
    this.edges.push({ x1: this.cx[bi], y1: this.cy[bi], x2: this.cx[bj], y2: this.cy[bj], level: best });

    // новый узел дендрограммы
    const node = this.nextNode++;
    this.children[node] = [this.nodeOf[bi], this.nodeOf[bj]];
    this.height[node] = best;
    this.nodeOf[bi] = node;
    this.merges.push({ node: node, level: best });

    // обновление расстояний (Ланс–Уильямс)
    const si = this.size[bi], sj = this.size[bj], link = this.linkage;
    for (const k of A) {
      if (k === bi || k === bj) continue;
      const dik = this.D[bi][k], djk = this.D[bj][k];
      let nd;
      if (link === "single") nd = Math.min(dik, djk);
      else if (link === "complete") nd = Math.max(dik, djk);
      else if (link === "ward") {
        const sk = this.size[k], denom = si + sj + sk; // Ланс–Уильямс для Уорда
        nd = ((si + sk) * dik + (sj + sk) * djk - sk * best) / denom;
      } else nd = (si * dik + sj * djk) / (si + sj); // average (UPGMA)
      this.D[bi][k] = nd; this.D[k][bi] = nd;
    }

    // новый центр масс и состав
    this.cx[bi] = (this.cx[bi] * si + this.cx[bj] * sj) / (si + sj);
    this.cy[bi] = (this.cy[bi] * si + this.cy[bj] * sj) / (si + sj);
    this.size[bi] = si + sj;
    for (const m of this.members[bj]) { this.members[bi].push(m); this.clusterOf[m] = bi; }
    this.members[bj] = [];

    A.splice(A.indexOf(bj), 1);
    if (A.length <= 1) this.done = true;
    return { type: "merge", i: bi, j: bj, level: best };
  };

  Hierarchical.prototype.stats = function () {
    return {
      active: this.active.length, merges: this.edges.length, total: this.n, done: this.done,
      level: this.edges.length ? this.edges[this.edges.length - 1].level : 0,
    };
  };

  window.HierarchicalStepper = Hierarchical;
})();
