/* Пошаговый DBSCAN.
   Каждый вызов step() выполняет один осмысленный шаг (обработку одной точки)
   и обновляет состояние, чтобы UI мог отрисовать промежуточную картину:
   текущую точку (active), её ε-окрестность (lastNeighbors), метки и типы. */
(function () {
  const UNCLASSIFIED = 0;
  const NOISE = -1;

  function DBSCAN(points, eps, minPts) {
    this.points = points;
    this.eps = eps;
    this.minPts = minPts;
    this.n = points.length;
    this.labels = new Array(this.n).fill(UNCLASSIFIED); // 0=не классиф., -1=шум, >0=id кластера
    this.types = new Array(this.n).fill(null);          // 'core' | 'border' | 'noise'
    this.clusterId = 0;     // сколько кластеров уже заведено
    this.i = 0;             // указатель внешнего сканирования
    this.seeds = [];        // очередь расширения текущего кластера
    this.inSeeds = new Set();
    this.currentCluster = 0;
    this.active = -1;       // индекс точки в фокусе
    this.lastNeighbors = [];
    this.done = false;
  }

  DBSCAN.prototype.rangeQuery = function (idx) {
    const p = this.points[idx];
    const eps2 = this.eps * this.eps;
    const res = [];
    for (let j = 0; j < this.n; j++) {
      const q = this.points[j];
      const dx = p.x - q.x, dy = p.y - q.y;
      if (dx * dx + dy * dy <= eps2) res.push(j);
    }
    return res;
  };

  DBSCAN.prototype.step = function () {
    if (this.done) return { done: true };

    // Фаза 1 — расширение текущего кластера по очереди затравок.
    while (this.seeds.length) {
      const q = this.seeds.shift();
      this.inSeeds.delete(q);
      if (this.labels[q] > 0) continue; // уже в кластере — пропускаем
      this.labels[q] = this.currentCluster; // шумовая точка тут становится граничной
      const N = this.rangeQuery(q);
      this.active = q;
      this.lastNeighbors = N;
      if (N.length >= this.minPts) {
        this.types[q] = "core";
        for (const rIdx of N) {
          if (rIdx !== q && this.labels[rIdx] <= 0 && !this.inSeeds.has(rIdx)) {
            this.seeds.push(rIdx);
            this.inSeeds.add(rIdx);
          }
        }
      } else {
        this.types[q] = "border";
      }
      return { type: "expand", point: q, cluster: this.currentCluster, neighbors: N, core: N.length >= this.minPts };
    }

    // Фаза 2 — поиск следующей не классифицированной точки (затравки).
    while (this.i < this.n && this.labels[this.i] !== UNCLASSIFIED) this.i++;
    if (this.i >= this.n) {
      this.done = true;
      this.active = -1;
      this.lastNeighbors = [];
      return { done: true };
    }
    const p = this.i;
    const N = this.rangeQuery(p);
    this.active = p;
    this.lastNeighbors = N;
    if (N.length < this.minPts) {
      this.labels[p] = NOISE;
      this.types[p] = "noise";
      return { type: "noise", point: p, neighbors: N };
    }
    // Точка ядра — открываем новый кластер.
    this.clusterId++;
    this.currentCluster = this.clusterId;
    this.labels[p] = this.clusterId;
    this.types[p] = "core";
    this.seeds = [];
    this.inSeeds = new Set();
    for (const rIdx of N) {
      if (rIdx !== p && this.labels[rIdx] <= 0) {
        this.seeds.push(rIdx);
        this.inSeeds.add(rIdx);
      }
    }
    return { type: "core", point: p, cluster: this.clusterId, neighbors: N };
  };

  DBSCAN.prototype.stats = function () {
    let noise = 0, assigned = 0, unvisited = 0;
    for (let k = 0; k < this.n; k++) {
      if (this.labels[k] === NOISE) noise++;
      else if (this.labels[k] > 0) assigned++;
      else unvisited++;
    }
    return { clusters: this.clusterId, noise, assigned, unvisited, total: this.n, done: this.done };
  };

  window.DBSCANStepper = DBSCAN;
  window.DBSCANStepper.NOISE = NOISE;
  window.DBSCANStepper.UNCLASSIFIED = UNCLASSIFIED;
})();
