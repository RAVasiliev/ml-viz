/* UI и отрисовка kNN: heatmap решающей поверхности (голосование по сетке),
   точки обучающей выборки, интерактив — клик показывает k соседей и бюллетень. */
(function () {
  "use strict";

  const CLASS = [[79, 70, 229], [239, 68, 68], [16, 185, 129], [245, 158, 11]];
  const CLASS_HEX = ["#4f46e5", "#ef4444", "#10b981", "#f59e0b"];
  const CLASS_NAME = ["класс 0", "класс 1", "класс 2", "класс 3"];
  const BG = [245, 247, 250];

  const $ = (id) => document.getElementById(id);
  const canvas = $("canvas"), ctx = canvas.getContext("2d");

  const datasetSel = $("dataset");
  const pointsRange = $("points"), pointsVal = $("pointsVal");
  const kRange = $("k"), kVal = $("kVal");
  const metricSel = $("metric");
  const weightSel = $("weight");
  const resetBtn = $("reset"), regenBtn = $("regen");
  const ballotBox = $("ballot");

  const G = 60;
  const grid = document.createElement("canvas"); grid.width = G; grid.height = G;
  const gctx = grid.getContext("2d");
  const gimg = gctx.createImageData(G, G);

  let data = null, X = [], yv = [], nC = 2;
  let knn = null;
  let seed = 7;
  let W = 0, H = 0;
  const PAD = 16;
  let probe = null; // {x,y} в норм. координатах — точка, по которой кликнули

  window.LabeledDatasets.list.forEach((d) => {
    const o = document.createElement("option"); o.value = d.id; o.textContent = d.name; datasetSel.appendChild(o);
  });
  datasetSel.value = "moons";

  function plot() { const size = Math.min(W, H) - 2 * PAD; return { size, ox: (W - size) / 2, oy: (H - size) / 2 }; }
  const toX = (nx) => { const p = plot(); return p.ox + nx * p.size; };
  const toY = (ny) => { const p = plot(); return p.oy + ny * p.size; };

  function sizeCanvas(cv, c) {
    const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    c.setTransform(dpr, 0, 0, dpr, 0, 0); return { w: r.width, h: r.height };
  }
  function resize() {
    const a = sizeCanvas(canvas, ctx); W = a.w; H = a.h;
    render();
  }

  function regenData() {
    data = window.LabeledDatasets.generate(datasetSel.value, +pointsRange.value, seed);
    X = data.points; yv = data.labels; nC = data.nClasses;
    probe = null;
    rebuild();
  }
  function rebuild() {
    knn = new window.KNN(X, yv, {
      nClasses: nC, k: +kRange.value, metric: metricSel.value,
      weighting: weightSel.value, grid: G,
    });
    refreshGrid(); updateStats(); renderBallot(); render();
  }
  // Лёгкая перестройка без пересоздания (метрика/k/вес) — KNN кеширует выборку.
  function reparam() {
    if (!knn) return rebuild();
    knn.setParams({ k: +kRange.value, metric: metricSel.value, weighting: weightSel.value });
    refreshGrid(); updateStats(); renderBallot(); render();
  }

  function lerp(a, b, t) { return Math.round(a + (b - a) * t); }
  function refreshGrid() {
    const d = gimg.data;
    for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
      const o = (gy * G + gx) * 4;
      const cell = knn.cell(gx, gy);
      const col = CLASS[cell.cls % CLASS.length];
      // насыщенность ∝ доле голосов сверх случайного уровня (1/nC).
      const margin = Math.max(0, (cell.conf - 1 / nC) / (1 - 1 / nC));
      const a = 0.14 + 0.58 * margin;
      d[o] = lerp(BG[0], col[0], a); d[o + 1] = lerp(BG[1], col[1], a);
      d[o + 2] = lerp(BG[2], col[2], a); d[o + 3] = 255;
    }
    gctx.putImageData(gimg, 0, 0);
  }

  function updateStats() {
    $("statK").textContent = knn.k;
    $("statAcc").textContent = (knn.accuracy() * 100).toFixed(1) + "%";
  }

  function drawPoints(emphasizeNeighbors) {
    const p = plot();
    const r = W > 360 ? 3.8 : 2.4;
    for (let i = 0; i < X.length; i++) {
      const x = p.ox + X[i].x * p.size, yy = p.oy + X[i].y * p.size;
      ctx.beginPath(); ctx.arc(x, yy, r, 0, Math.PI * 2);
      ctx.fillStyle = CLASS_HEX[yv[i] % CLASS_HEX.length]; ctx.fill();
      // если выделяем соседей — приглушим всё остальное лёгкой белой вуалью
      const pred = knn.predict(X[i].x, X[i].y);
      if (pred !== yv[i]) { ctx.lineWidth = 1.8; ctx.strokeStyle = "#14171c"; ctx.stroke(); }
      else if (W > 360) { ctx.lineWidth = 1; ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.stroke(); }
    }
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    if (!knn) return;
    const p = plot();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(grid, p.ox, p.oy, p.size, p.size); // гладкая решающая поверхность

    // интерактив: спицы к k соседям выделенной точки
    if (probe) {
      const b = knn.ballot(probe.x, probe.y);
      const qx = toX(probe.x), qy = toY(probe.y);
      // окружность охвата (до самого дальнего из k соседей) — наглядно для L2
      if (metricSel.value === "l2" && b.neigh.length) {
        const rad = b.neigh[b.neigh.length - 1].d * p.size;
        ctx.beginPath(); ctx.arc(qx, qy, rad, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(20,23,28,.04)"; ctx.fill();
        ctx.lineWidth = 1.2; ctx.setLineDash([4, 4]);
        ctx.strokeStyle = "rgba(20,23,28,.30)"; ctx.stroke(); ctx.setLineDash([]);
      }
      // спицы: толщина ∝ весу соседа
      const wMax = b.weights.length ? Math.max.apply(null, b.weights) : 1;
      for (let j = 0; j < b.neigh.length; j++) {
        const ni = b.neigh[j].i;
        const nx = toX(X[ni].x), ny = toY(X[ni].y);
        const wRel = wMax > 0 ? b.weights[j] / wMax : 1;
        ctx.beginPath(); ctx.moveTo(qx, qy); ctx.lineTo(nx, ny);
        ctx.lineWidth = 0.7 + 3.3 * wRel;
        ctx.strokeStyle = hexA(CLASS_HEX[yv[ni] % CLASS_HEX.length], 0.35 + 0.5 * wRel);
        ctx.stroke();
      }
      drawPoints();
      // обвести самих соседей
      for (let j = 0; j < b.neigh.length; j++) {
        const ni = b.neigh[j].i;
        ctx.beginPath(); ctx.arc(toX(X[ni].x), toY(X[ni].y), 5.4, 0, Math.PI * 2);
        ctx.lineWidth = 2; ctx.strokeStyle = "#14171c"; ctx.stroke();
      }
      // сама точка-запрос
      ctx.beginPath(); ctx.arc(qx, qy, 6.5, 0, Math.PI * 2);
      ctx.fillStyle = CLASS_HEX[b.cls % CLASS_HEX.length]; ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = "#fff"; ctx.stroke();
      ctx.lineWidth = 1; ctx.strokeStyle = "#14171c"; ctx.stroke();
    } else {
      drawPoints();
    }
  }

  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  // «Бюллетень» голосов в боковой панели
  function renderBallot() {
    if (!probe || !knn) {
      ballotBox.innerHTML = '<div class="empty">Кликни по полю — подсветим k ближайших соседей (спицы, толщина ∝ весу) и покажем бюллетень голосов с предсказанным классом.</div>';
      return;
    }
    const b = knn.ballot(probe.x, probe.y);
    const total = b.total || 1;
    let html = '<div class="pred">Предсказание: <b><span class="swatch" style="background:' +
      CLASS_HEX[b.cls % CLASS_HEX.length] + '"></span>' + CLASS_NAME[b.cls] + '</b></div>';
    for (let c = 0; c < nC; c++) {
      const frac = b.votes[c] / total;
      const win = c === b.cls;
      // подпись веса: для равных весов показываем целое число голосов, иначе долю
      const label = weightSel.value === "equal"
        ? Math.round(b.votes[c]) + " гол."
        : (frac * 100).toFixed(0) + "%";
      html += '<div class="row' + (win ? ' win' : '') + '">' +
        '<span class="name"><i style="background:' + CLASS_HEX[c % CLASS_HEX.length] + '"></i>' + CLASS_NAME[c] + '</span>' +
        '<span class="bar"><span style="width:' + (frac * 100).toFixed(1) + '%;background:' + CLASS_HEX[c % CLASS_HEX.length] + '"></span></span>' +
        '<span class="v">' + label + '</span></div>';
    }
    ballotBox.innerHTML = html;
  }

  // Перевод координат клика в нормированное пространство признаков [0,1].
  function eventToNorm(e) {
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    const p = plot();
    const nx = (px - p.ox) / p.size, ny = (py - p.oy) / p.size;
    if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return null;
    return { x: nx, y: ny };
  }

  function syncLabels() {
    pointsVal.textContent = pointsRange.value;
    kVal.textContent = kRange.value;
  }

  canvas.addEventListener("click", (e) => {
    const q = eventToNorm(e);
    if (!q) return;
    probe = q; renderBallot(); render();
  });

  datasetSel.addEventListener("change", regenData);
  pointsRange.addEventListener("input", () => { syncLabels(); regenData(); });
  kRange.addEventListener("input", () => { syncLabels(); reparam(); });
  metricSel.addEventListener("change", reparam);
  weightSel.addEventListener("change", reparam);
  resetBtn.addEventListener("click", () => { probe = null; rebuild(); });
  regenBtn.addEventListener("click", () => { seed = (seed * 1103515245 + 12345) >>> 0; regenData(); });

  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "SELECT" || e.target.tagName === "INPUT") return;
    if (e.code === "Space") { e.preventDefault(); probe = null; renderBallot(); render(); }
    else if (e.code === "ArrowRight") {
      // шаг: увеличить k на 2 (в пределах диапазона) — показать сглаживание границы
      const nv = Math.min(+kRange.max, +kRange.value + 2);
      kRange.value = nv; syncLabels(); reparam();
    }
    else if (e.key === "r" || e.key === "R" || e.key === "к" || e.key === "К") { probe = null; rebuild(); }
    else if (e.key === "n" || e.key === "N" || e.key === "т" || e.key === "Т") { seed = (seed * 1103515245 + 12345) >>> 0; regenData(); }
  });
  window.addEventListener("resize", resize);

  syncLabels(); resize(); regenData();
})();
