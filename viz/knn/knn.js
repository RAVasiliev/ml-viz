/* Логика метрического классификатора kNN (k ближайших соседей).
   Метрики расстояния (L1/L2/L∞), majority vote и взвешенное голосование (ядра).
   Класс KNN хранит обучающую выборку (lazy learning) и считает предсказание
   по сетке и в произвольной точке. Координаты признаков — в [0,1]. */
(function () {
  "use strict";

  const EPS = 1e-6;

  // d(x, q) по выбранной метрике. Все формулы — из конспекта недели 3.
  const METRIC = {
    // Евклидово расстояние L2: sqrt(sum (xi - qi)^2)
    l2: (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by),
    // Манхэттенское L1 (city block): sum |xi - qi|
    l1: (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by),
    // Чебышёва L∞ (предел Минковского при p→∞): max_i |xi - qi|
    linf: (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by)),
  };

  // Ядерная (весовая) функция K(d) для взвешенного kNN.
  //  - equal:    w_j = 1  (обычный majority vote)
  //  - inverse:  w_j = 1 / (d + eps)         (обратное расстояние)
  //  - gauss:    w_j = exp(-(d/h)^2 / 2)      (гауссово ядро, h = расст. до k-го соседа)
  function weightOf(weighting, d, hBand) {
    if (weighting === "inverse") return 1 / (d + EPS);
    if (weighting === "gauss") {
      const h = hBand > EPS ? hBand : EPS;
      const z = d / h;
      return Math.exp(-0.5 * z * z);
    }
    return 1; // equal
  }

  class KNN {
    constructor(X, y, opts) {
      opts = opts || {};
      this.X = X;
      this.y = y;
      this.nClasses = opts.nClasses || 2;
      this.k = Math.max(1, opts.k || 5);
      this.metric = METRIC[opts.metric] ? opts.metric : "l2";
      this.weighting = opts.weighting || "equal";
      this.G = opts.grid || 60;
      this.grid = null;       // Int8Array предсказанных классов по сетке
      this.gridConf = null;   // Float32Array доли голосов за победивший класс
      this._buildGrid();
    }

    setParams(opts) {
      if (opts.k != null) this.k = Math.max(1, opts.k);
      if (opts.metric && METRIC[opts.metric]) this.metric = opts.metric;
      if (opts.weighting) this.weighting = opts.weighting;
      this._buildGrid();
    }

    // k ближайших соседей точки q (по индексам), отсортированы по возрастанию d.
    neighbors(qx, qy) {
      const dist = METRIC[this.metric], X = this.X;
      const arr = new Array(X.length);
      for (let i = 0; i < X.length; i++) {
        arr[i] = { i, d: dist(X[i].x, X[i].y, qx, qy) };
      }
      arr.sort((a, b) => a.d - b.d);
      const k = Math.min(this.k, arr.length);
      return arr.slice(0, k);
    }

    // Полный «бюллетень» голосования в точке q: голоса по классам, веса соседей,
    // победивший класс и его доля. neigh — результат neighbors() (можно передать готовый).
    ballot(qx, qy, neigh) {
      neigh = neigh || this.neighbors(qx, qy);
      const votes = new Float64Array(this.nClasses);
      // h для гауссова ядра — расстояние до самого дальнего из k соседей (ширина окна).
      const hBand = neigh.length ? neigh[neigh.length - 1].d : EPS;
      let total = 0;
      const weights = new Array(neigh.length);
      for (let j = 0; j < neigh.length; j++) {
        const w = weightOf(this.weighting, neigh[j].d, hBand);
        weights[j] = w;
        votes[this.y[neigh[j].i]] += w;
        total += w;
      }
      let cls = 0, best = -Infinity;
      for (let c = 0; c < this.nClasses; c++) {
        if (votes[c] > best) { best = votes[c]; cls = c; }
      }
      const conf = total > 0 ? best / total : 1 / this.nClasses;
      return { neigh, weights, votes: Array.from(votes), total, cls, conf, hBand };
    }

    predict(qx, qy) {
      return this.ballot(qx, qy).cls;
    }

    // Предсказание по сетке G×G: класс + доля голосов (для насыщенности heatmap).
    _buildGrid() {
      const G = this.G;
      this.grid = new Int8Array(G * G);
      this.gridConf = new Float32Array(G * G);
      for (let gy = 0; gy < G; gy++) {
        for (let gx = 0; gx < G; gx++) {
          const b = this.ballot((gx + 0.5) / G, (gy + 0.5) / G);
          const o = gy * G + gx;
          this.grid[o] = b.cls;
          this.gridConf[o] = b.conf;
        }
      }
    }

    cell(gx, gy) {
      const o = gy * this.G + gx;
      return { cls: this.grid[o], conf: this.gridConf[o] };
    }

    // train-accuracy: доля верно классифицированных обучающих точек.
    // Для честности исключаем саму точку из её соседей (leave-one-out по индексу).
    accuracy() {
      const X = this.X, y = this.y, dist = METRIC[this.metric];
      let correct = 0;
      for (let t = 0; t < X.length; t++) {
        const arr = [];
        for (let i = 0; i < X.length; i++) {
          if (i === t) continue;
          arr.push({ i, d: dist(X[i].x, X[i].y, X[t].x, X[t].y) });
        }
        arr.sort((a, b) => a.d - b.d);
        const k = Math.min(this.k, arr.length);
        const hBand = k ? arr[k - 1].d : EPS;
        const votes = new Float64Array(this.nClasses);
        for (let j = 0; j < k; j++) {
          votes[y[arr[j].i]] += weightOf(this.weighting, arr[j].d, hBand);
        }
        let cls = 0, best = -Infinity;
        for (let c = 0; c < this.nClasses; c++) if (votes[c] > best) { best = votes[c]; cls = c; }
        if (cls === y[t]) correct++;
      }
      return X.length ? correct / X.length : 0;
    }
  }

  window.KNN = KNN;
})();
