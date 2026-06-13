/* UI и отрисовка визуализации DBSCAN. */
(function () {
  "use strict";

  const NOISE = window.DBSCANStepper.NOISE;
  const PALETTE = ["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444",
                   "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#6366f1",
                   "#84cc16", "#06b6d4"];

  const $ = (id) => document.getElementById(id);
  const canvas = $("canvas");
  const ctx = canvas.getContext("2d");

  const datasetSel = $("dataset");
  const pointsRange = $("points"), pointsVal = $("pointsVal");
  const epsRange = $("eps"), epsVal = $("epsVal");
  const minptsRange = $("minpts"), minptsVal = $("minptsVal");
  const speedRange = $("speed"), speedVal = $("speedVal");
  const playBtn = $("play"), stepBtn = $("step"), resetBtn = $("reset"), regenBtn = $("regen");
  const progressBar = $("progressBar");

  let pts = [];
  let stepper = null;
  let playing = false;
  let acc = 0, lastT = 0;
  let seed = 7;
  let W = 0, H = 0;
  const PAD = 18;

  // --- Заполняем список датасетов ---
  window.Datasets.list.forEach((d) => {
    const o = document.createElement("option");
    o.value = d.id; o.textContent = d.name;
    datasetSel.appendChild(o);
  });
  datasetSel.value = "smiley";

  // --- Геометрия: квадратная область внутри canvas (чтобы ε был кругом) ---
  function plot() {
    const size = Math.min(W, H) - 2 * PAD;
    return { size, ox: (W - size) / 2, oy: (H - size) / 2 };
  }
  function toX(nx) { const p = plot(); return p.ox + nx * p.size; }
  function toY(ny) { const p = plot(); return p.oy + ny * p.size; }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    W = rect.width; H = rect.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    render();
  }

  // --- Данные и сброс ---
  function regenData() {
    pts = window.Datasets.generate(datasetSel.value, +pointsRange.value, seed);
    rebuild();
  }
  function rebuild() {
    stepper = new window.DBSCANStepper(pts, +epsRange.value, +minptsRange.value);
    pause();
    updateStats();
    render();
  }

  // --- Шаги алгоритма ---
  function doStep() {
    if (!stepper.done) stepper.step();
    updateStats();
  }
  function stepsPerSec() {
    // слайдер 1..100 → 2..140 шагов/с (нелинейно, чтобы хвост был быстрым)
    const t = (+speedRange.value - 1) / 99;
    return Math.round(2 + 138 * t * t);
  }

  // --- Управление воспроизведением ---
  function play() {
    if (stepper.done) rebuild();
    playing = true; acc = 0; updatePlayBtn();
  }
  function pause() { playing = false; updatePlayBtn(); }
  function togglePlay() { playing ? pause() : play(); }
  function updatePlayBtn() {
    playBtn.innerHTML = playing
      ? '<svg width="13" height="13" viewBox="0 0 12 12"><rect x="2" y="1.5" width="3" height="9" rx="1" fill="currentColor"/><rect x="7" y="1.5" width="3" height="9" rx="1" fill="currentColor"/></svg> Пауза'
      : '<svg width="13" height="13" viewBox="0 0 12 12"><path d="M3 1.5l7 4.5-7 4.5z" fill="currentColor"/></svg> Запуск';
  }

  // --- Статистика ---
  function updateStats() {
    const s = stepper.stats();
    $("statClusters").textContent = s.clusters;
    $("statNoise").textContent = s.noise;
    $("statAssigned").textContent = s.assigned;
    $("statUnvisited").textContent = s.unvisited;
    const processed = s.total - s.unvisited;
    progressBar.style.width = (s.total ? (processed / s.total) * 100 : 0) + "%";
    stepBtn.disabled = s.done;
  }

  // --- Отрисовка ---
  function render() {
    ctx.clearRect(0, 0, W, H);
    if (!stepper) return;
    const a = stepper.active;

    // ε-окрестность активной точки и связи с соседями — под точками.
    if (a >= 0) {
      const ax = toX(pts[a].x), ay = toY(pts[a].y), r = +epsRange.value * plot().size;
      ctx.beginPath();
      ctx.arc(ax, ay, r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(79,70,229,.07)";
      ctx.fill();
      ctx.strokeStyle = "rgba(79,70,229,.45)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.strokeStyle = "rgba(79,70,229,.22)";
      ctx.lineWidth = 1;
      for (const j of stepper.lastNeighbors) {
        if (j === a) continue;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(toX(pts[j].x), toY(pts[j].y));
        ctx.stroke();
      }
    }

    // Точки.
    for (let i = 0; i < pts.length; i++) drawPoint(i);

    // Подсветка активной точки — поверх.
    if (a >= 0) {
      const ax = toX(pts[a].x), ay = toY(pts[a].y);
      ctx.beginPath();
      ctx.arc(ax, ay, 7, 0, Math.PI * 2);
      ctx.strokeStyle = "#14171c";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  function drawPoint(i) {
    const x = toX(pts[i].x), y = toY(pts[i].y);
    const label = stepper.labels[i], type = stepper.types[i];
    ctx.beginPath();
    if (label > 0) {
      const c = PALETTE[(label - 1) % PALETTE.length];
      if (type === "border") {
        // граничная точка — полая, цветное кольцо
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = "#fff"; ctx.fill();
        ctx.lineWidth = 2.4; ctx.strokeStyle = c; ctx.stroke();
      } else {
        // ядро — залитая
        ctx.arc(x, y, 4.6, 0, Math.PI * 2);
        ctx.fillStyle = c; ctx.fill();
      }
    } else if (label === NOISE) {
      ctx.arc(x, y, 2.8, 0, Math.PI * 2);
      ctx.fillStyle = "#475569"; ctx.fill();
    } else {
      ctx.arc(x, y, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = "#cbd5e1"; ctx.fill();
    }
  }

  // --- Главный цикл ---
  function loop(t) {
    requestAnimationFrame(loop);
    if (!lastT) lastT = t;
    const dt = t - lastT; lastT = t;
    if (playing && stepper && !stepper.done) {
      acc += dt;
      const interval = 1000 / stepsPerSec();
      let guard = 0;
      while (acc >= interval && !stepper.done && guard < 2000) {
        stepper.step(); acc -= interval; guard++;
      }
      if (stepper.done) pause();
      updateStats();
    }
    render();
  }

  // --- Обработчики ---
  function syncLabels() {
    pointsVal.textContent = pointsRange.value;
    epsVal.textContent = (+epsRange.value).toFixed(3);
    minptsVal.textContent = minptsRange.value;
    speedVal.textContent = speedRange.value;
  }

  datasetSel.addEventListener("change", regenData);
  pointsRange.addEventListener("input", () => { syncLabels(); regenData(); });
  epsRange.addEventListener("input", () => { syncLabels(); rebuild(); });
  minptsRange.addEventListener("input", () => { syncLabels(); rebuild(); });
  speedRange.addEventListener("input", syncLabels);
  playBtn.addEventListener("click", togglePlay);
  stepBtn.addEventListener("click", () => { pause(); doStep(); });
  resetBtn.addEventListener("click", rebuild);
  regenBtn.addEventListener("click", () => { seed = (seed * 1103515245 + 12345) >>> 0; regenData(); });

  // Клик по canvas — добавить точку (когда не идёт воспроизведение).
  canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const p = plot();
    const nx = (e.clientX - rect.left - p.ox) / p.size;
    const ny = (e.clientY - rect.top - p.oy) / p.size;
    if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return;
    pts.push({ x: nx, y: ny });
    rebuild();
  });

  // Горячие клавиши: пробел — play/pause, → — шаг, R — сброс, N — новые данные.
  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "SELECT" || e.target.tagName === "INPUT") return;
    if (e.code === "Space") { e.preventDefault(); togglePlay(); }
    else if (e.code === "ArrowRight") { pause(); doStep(); }
    else if (e.key === "r" || e.key === "R" || e.key === "к" || e.key === "К") rebuild();
    else if (e.key === "n" || e.key === "N" || e.key === "т" || e.key === "Т") { seed = (seed * 1103515245 + 12345) >>> 0; regenData(); }
  });

  window.addEventListener("resize", resize);

  // --- Старт ---
  syncLabels();
  resize();
  regenData();
  requestAnimationFrame(loop);
})();
