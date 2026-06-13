/* UI и отрисовка агломеративной кластеризации: поле слияний + дендрограмма.
   Дерево строится до единого корня. «Срез на K» — горизонтальный порог:
   ниже среза ветви окрашены по K кластерам, выше — серые. */
(function () {
  "use strict";

  const PALETTE = ["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444",
                   "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#6366f1",
                   "#84cc16", "#06b6d4"];
  const GREY_SINGLE = "#cbd5e1";  // одиночка ниже среза
  const GREY_ABOVE = "#aeb6c4";   // ветвь выше среза

  const $ = (id) => document.getElementById(id);
  const canvas = $("canvas");
  const ctx = canvas.getContext("2d");
  const dendro = $("dendro");
  const dctx = dendro.getContext("2d");

  const datasetSel = $("dataset");
  const pointsRange = $("points"), pointsVal = $("pointsVal");
  const linkSel = $("linkage");
  const targetRange = $("target"), targetVal = $("targetVal");
  const speedRange = $("speed"), speedVal = $("speedVal");
  const playBtn = $("play"), stepBtn = $("step"), resetBtn = $("reset"), regenBtn = $("regen");
  const progressBar = $("progressBar");

  let pts = [];
  let hc = null;
  let nodeColor = [];     // node id -> цвет (по срезу)
  let cutMerges = 0, cutClusters = 0;
  let playing = false, acc = 0, lastT = 0, seed = 5;
  let W = 0, H = 0, DW = 0, DH = 0;
  const PAD = 18;

  window.Datasets.list.forEach((d) => {
    const o = document.createElement("option");
    o.value = d.id; o.textContent = d.name;
    datasetSel.appendChild(o);
  });
  datasetSel.value = "blobs";

  function plot() { const size = Math.min(W, H) - 2 * PAD; return { size, ox: (W - size) / 2, oy: (H - size) / 2 }; }
  function toX(nx) { const p = plot(); return p.ox + nx * p.size; }
  function toY(ny) { const p = plot(); return p.oy + ny * p.size; }

  function sizeCanvas(cv, c) {
    const rect = cv.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(rect.width * dpr);
    cv.height = Math.round(rect.height * dpr);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: rect.width, h: rect.height };
  }
  function resize() {
    const a = sizeCanvas(canvas, ctx); W = a.w; H = a.h;
    const b = sizeCanvas(dendro, dctx); DW = b.w; DH = b.h;
    render();
  }

  function regenData() {
    pts = window.Datasets.generate(datasetSel.value, +pointsRange.value, seed);
    rebuild();
  }
  function rebuild() {
    hc = new window.HierarchicalStepper(pts, linkSel.value);
    pause();
    recolor();
    updateStats();
    render();
  }

  /* Срез на K: применяем только первые (n-K) слияний (или все, что есть, если
     до среза ещё не дошли). Через union-find красим листья и узлы по компонентам,
     ветви выше среза — серым. */
  function recolor() {
    const n = hc.n;
    const mergesDone = hc.merges.length;
    const K = Math.min(+targetRange.value, n);
    cutMerges = Math.min(mergesDone, Math.max(0, n - K));
    cutClusters = n - cutMerges;

    const size = n + cutMerges;            // узлы, существующие на/ниже среза
    const parent = new Int32Array(size);
    for (let i = 0; i < size; i++) parent[i] = i;
    const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    for (let t = 0; t < cutMerges; t++) {
      const node = n + t;                  // результат слияния t
      const ch = hc.children[node];
      parent[find(ch[0])] = node;
      parent[find(ch[1])] = node;
    }
    // размеры компонент по листьям
    const compSize = {};
    for (let i = 0; i < n; i++) { const r = find(i); compSize[r] = (compSize[r] || 0) + 1; }
    const comps = Object.keys(compSize).map(Number).sort((a, b) => compSize[b] - compSize[a]);
    const colorIdx = {};
    let ci = 0;
    for (const r of comps) if (compSize[r] >= 2) colorIdx[r] = ci++ % PALETTE.length;

    // цвет каждого существующего узла
    nodeColor = new Array(n + mergesDone);
    for (let node = 0; node < n + mergesDone; node++) {
      if (node >= n + cutMerges) { nodeColor[node] = GREY_ABOVE; continue; }
      const r = find(node);
      const k = colorIdx[r];
      nodeColor[node] = (k === undefined) ? GREY_SINGLE : PALETTE[k];
    }
  }

  function doStep() {
    if (hc.done) return;
    hc.step();
    recolor();
    updateStats();
  }
  function stepsPerSec() { const t = (+speedRange.value - 1) / 99; return Math.round(2 + 120 * t * t); }

  function play() { if (hc.done) rebuild(); playing = true; acc = 0; updatePlayBtn(); }
  function pause() { playing = false; updatePlayBtn(); }
  function togglePlay() { playing ? pause() : play(); }
  function updatePlayBtn() {
    playBtn.innerHTML = playing
      ? '<svg width="13" height="13" viewBox="0 0 12 12"><rect x="2" y="1.5" width="3" height="9" rx="1" fill="currentColor"/><rect x="7" y="1.5" width="3" height="9" rx="1" fill="currentColor"/></svg> Пауза'
      : '<svg width="13" height="13" viewBox="0 0 12 12"><path d="M3 1.5l7 4.5-7 4.5z" fill="currentColor"/></svg> Запуск';
  }

  function updateStats() {
    const s = hc.stats();
    $("statActive").textContent = cutClusters;
    $("statMerges").textContent = s.merges;
    $("statLevel").textContent = s.level.toFixed(3);
    $("statTotal").textContent = s.total;
    progressBar.style.width = (s.total > 1 ? (s.merges / (s.total - 1)) * 100 : 0) + "%";
    stepBtn.disabled = s.done;
  }

  // ---------- Поле ----------
  function render() {
    ctx.clearRect(0, 0, W, H);
    if (hc) {
      ctx.lineWidth = 1.4;
      for (const e of hc.edges) {
        ctx.strokeStyle = "rgba(79,70,229,.22)";
        ctx.beginPath();
        ctx.moveTo(toX(e.x1), toY(e.y1));
        ctx.lineTo(toX(e.x2), toY(e.y2));
        ctx.stroke();
      }
      for (let i = 0; i < pts.length; i++) {
        ctx.beginPath();
        ctx.arc(toX(pts[i].x), toY(pts[i].y), 3.6, 0, Math.PI * 2);
        ctx.fillStyle = nodeColor[i] || GREY_SINGLE;
        ctx.fill();
      }
    }
    renderDendro();
  }

  // ---------- Дендрограмма ----------
  function renderDendro() {
    dctx.clearRect(0, 0, DW, DH);
    if (!hc || hc.n === 0) return;

    const n = hc.n;
    const isLeaf = (node) => node < n;
    const mergesDone = hc.merges.length;

    // корни текущего леса (по всем выполненным слияниям) — для раскладки листьев
    const roots = hc.active.map((id) => hc.nodeOf[id]);

    const minLeafCache = {};
    function minLeafOf(node) {
      if (node in minLeafCache) return minLeafCache[node];
      let v;
      if (isLeaf(node)) v = node;
      else { const ch = hc.children[node]; v = Math.min(minLeafOf(ch[0]), minLeafOf(ch[1])); }
      minLeafCache[node] = v; return v;
    }
    roots.sort((a, b) => minLeafOf(a) - minLeafOf(b));

    // порядок листьев слева-направо (итеративный DFS)
    const leafX = {}; let order = 0;
    const stack = roots.slice().reverse();
    while (stack.length) {
      const node = stack.pop();
      if (isLeaf(node)) { leafX[node] = order++; continue; }
      const ch = hc.children[node];
      stack.push(ch[1]); stack.push(ch[0]);
    }
    const nLeaves = order || 1;

    let maxH = 1e-6;
    for (const m of hc.merges) if (hc.height[m.node] > maxH) maxH = hc.height[m.node];

    const padX = 16, padTop = 16, padBot = 14;
    const X = (lx) => padX + (nLeaves <= 1 ? 0.5 : lx / (nLeaves - 1)) * (DW - 2 * padX);
    const Yb = DH - padBot, Yt = padTop;
    const Y = (h) => Yb - (h / maxH) * (Yb - Yt);

    const nodeXCache = {};
    function nodeX(node) {
      if (node in nodeXCache) return nodeXCache[node];
      let x;
      if (isLeaf(node)) x = X(leafX[node]);
      else { const ch = hc.children[node]; x = (nodeX(ch[0]) + nodeX(ch[1])) / 2; }
      nodeXCache[node] = x; return x;
    }
    const nodeY = (node) => (isLeaf(node) ? Yb : Y(hc.height[node]));

    // рисуем всё дерево (итеративно), цвет узла — по срезу
    for (const root of roots) {
      const st = [root];
      while (st.length) {
        const node = st.pop();
        const col = nodeColor[node] || GREY_ABOVE;
        if (isLeaf(node)) {
          const x = nodeX(node);
          dctx.fillStyle = col;
          dctx.beginPath(); dctx.arc(x, Yb, 1.6, 0, Math.PI * 2); dctx.fill();
          continue;
        }
        const ch = hc.children[node];
        const xa = nodeX(ch[0]), xb = nodeX(ch[1]), yh = Y(hc.height[node]);
        dctx.strokeStyle = col; dctx.lineWidth = 1.3;
        dctx.beginPath();
        dctx.moveTo(xa, nodeY(ch[0])); dctx.lineTo(xa, yh);
        dctx.lineTo(xb, yh);
        dctx.lineTo(xb, nodeY(ch[1]));
        dctx.stroke();
        st.push(ch[0]); st.push(ch[1]);
      }
    }

    // линия среза: между последним слиянием ниже среза и первым выше
    if (cutMerges > 0 && mergesDone > cutMerges) {
      const hBelow = hc.height[n + cutMerges - 1];
      const hAbove = hc.height[n + cutMerges];
      const yCut = Y((hBelow + hAbove) / 2);
      dctx.strokeStyle = "rgba(20,23,28,.35)";
      dctx.lineWidth = 1; dctx.setLineDash([5, 4]);
      dctx.beginPath(); dctx.moveTo(8, yCut); dctx.lineTo(DW - 8, yCut); dctx.stroke();
      dctx.setLineDash([]);
      dctx.fillStyle = "rgba(20,23,28,.5)"; dctx.font = "11px -apple-system, sans-serif";
      dctx.fillText("срез K=" + cutClusters, 10, yCut - 5);
    }
  }

  function loop(t) {
    requestAnimationFrame(loop);
    if (!lastT) lastT = t;
    const dt = t - lastT; lastT = t;
    if (playing && hc && !hc.done) {
      acc += dt;
      const interval = 1000 / stepsPerSec();
      let guard = 0;
      while (acc >= interval && !hc.done && guard < 200) { hc.step(); acc -= interval; guard++; }
      recolor();
      updateStats();
      if (hc.done) pause();
    }
    render();
  }

  function syncLabels() {
    pointsVal.textContent = pointsRange.value;
    targetVal.textContent = targetRange.value;
    speedVal.textContent = speedRange.value;
  }

  datasetSel.addEventListener("change", regenData);
  pointsRange.addEventListener("input", () => { syncLabels(); regenData(); });
  linkSel.addEventListener("change", rebuild);
  // срез на K не пересобирает алгоритм — только перекрашивает
  targetRange.addEventListener("input", () => { syncLabels(); recolor(); updateStats(); render(); });
  speedRange.addEventListener("input", syncLabels);
  playBtn.addEventListener("click", togglePlay);
  stepBtn.addEventListener("click", () => { pause(); doStep(); });
  resetBtn.addEventListener("click", rebuild);
  regenBtn.addEventListener("click", () => { seed = (seed * 1103515245 + 12345) >>> 0; regenData(); });

  canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const p = plot();
    const nx = (e.clientX - rect.left - p.ox) / p.size;
    const ny = (e.clientY - rect.top - p.oy) / p.size;
    if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return;
    pts.push({ x: nx, y: ny });
    rebuild();
  });

  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "SELECT" || e.target.tagName === "INPUT") return;
    if (e.code === "Space") { e.preventDefault(); togglePlay(); }
    else if (e.code === "ArrowRight") { pause(); doStep(); }
    else if (e.key === "r" || e.key === "R" || e.key === "к" || e.key === "К") rebuild();
    else if (e.key === "n" || e.key === "N" || e.key === "т" || e.key === "Т") { seed = (seed * 1103515245 + 12345) >>> 0; regenData(); }
  });
  window.addEventListener("resize", resize);

  syncLabels();
  resize();
  regenData();
  requestAnimationFrame(loop);
})();
