/* «Критерии расщепления: чистота узла» — как дерево измеряет неоднородность узла
   (доля ошибок / Джини / энтропия), как из них считается прирост информации при
   сплите, и где лучше разрезать одномерную выборку. Vanilla JS + canvas, без зависимостей. */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);

  // классы и критерии
  const CLS_A = "#7c3aed", CLS_B = "#e11d48";
  const CR = {
    error:   { name: "Доля ошибок", en: "Misclassification", color: "#0f9d58", max: 0.5 },
    gini:    { name: "Джини",       en: "Gini",              color: "#2563eb", max: 0.5 },
    entropy: { name: "Энтропия",    en: "Entropy",           color: "#ea8a1e", max: 1.0 },
  };
  const ORDER = ["error", "gini", "entropy"];

  const log2 = (x) => Math.log(x) / Math.LN2;
  // меры неоднородности для двух классов, p — доля класса A
  const impur = {
    error:   (p) => 1 - Math.max(p, 1 - p),
    gini:    (p) => 2 * p * (1 - p),
    entropy: (p) => (p <= 0 || p >= 1) ? 0 : (-p * log2(p) - (1 - p) * log2(1 - p)),
  };

  const fmt = (v) => v.toFixed(2);
  // строгое =/≈ относительно округления до 2 знаков
  const isExact = (v) => Math.abs(Number(v.toFixed(2)) - v) < 1e-9;

  function mkCanvas(id) {
    const cv = $("#" + id), o = { cv, ctx: cv.getContext("2d"), W: 0, H: 0 };
    o.resize = function () {
      const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      o.W = r.width; o.H = r.height;
      cv.width = Math.round(o.W * dpr); cv.height = Math.round(o.H * dpr);
      o.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    return o;
  }
  function rng32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const state = { k: 4, N: 10, crit: "gini", t: 0.5, seed: 5, hoverP: -1, pts: [], best: 0.5 };

  // ======================= ЧАСТЬ 1: узел =======================
  function renderNode() {
    const k = state.k, N = state.N, p = k / N;
    // точки
    const dots = $("#dots"); dots.innerHTML = "";
    for (let i = 0; i < N; i++) {
      const d = document.createElement("div");
      d.className = "dot";
      d.style.background = i < k ? CLS_A : CLS_B;
      dots.appendChild(d);
    }
    // столбики частот
    const fa = p, fb = 1 - p;
    $("#freq").innerHTML =
      `<div class="fcol"><span class="fval cA">${fmt(fa)}</span><div class="fbar" style="height:${fa * 100}%;background:${CLS_A}"></div><span class="flab">A</span></div>` +
      `<div class="fcol"><span class="fval cB">${fmt(fb)}</span><div class="fbar" style="height:${fb * 100}%;background:${CLS_B}"></div><span class="flab">B</span></div>`;
    // три критерия с формулами
    const KT = (tex) => (window.katex ? katex.renderToString(tex, { throwOnError: false, strict: false }) : tex);
    const a = k, b = N - k;
    const tex = {
      error: `1-\\max\\!\\left(\\tfrac{${a}}{${N}},\\,\\tfrac{${b}}{${N}}\\right)`,
      gini: `2\\cdot\\tfrac{${a}}{${N}}\\cdot\\tfrac{${b}}{${N}}`,
      entropy: `-\\tfrac{${a}}{${N}}\\log_2\\tfrac{${a}}{${N}}-\\tfrac{${b}}{${N}}\\log_2\\tfrac{${b}}{${N}}`,
    };
    const pure = (k === 0 || k === N);
    const html = ORDER.map((key) => {
      const c = CR[key], v = impur[key](p);
      const eqT = isExact(v) ? "=" : "\\approx";
      const body = pure ? `\\textcolor{${c.color}}{H}=0` : `\\textcolor{${c.color}}{H}=${tex[key]} ${eqT} ${fmt(v)}`;
      const tag = pure ? `<span class="pure-tag">чистый · H = 0</span>` : "";
      return `<div class="crit">
        <div class="ch"><span class="cn" style="color:${c.color}">${c.name}</span><span class="cq">${c.en}</span>
          <span class="cval" style="color:${c.color}">${tag || fmt(v)}</span></div>
        <div class="cf">${KT(body)}</div>
        <div class="cbar"><span style="width:${Math.min(100, v / c.max * 100)}%;background:${c.color}"></span></div>
      </div>`;
    }).join("");
    $("#critList").innerHTML = html;
  }

  // ======================= ЧАСТЬ 1: кривые критериев =======================
  const cu = mkCanvas("curves");
  const CU_PAD = { l: 44, r: 16, t: 16, b: 34 };
  function drawCurves() {
    const { ctx, W, H } = cu; if (!W) return;
    ctx.clearRect(0, 0, W, H);
    const x0 = CU_PAD.l, y0 = CU_PAD.t, pw = W - CU_PAD.l - CU_PAD.r, ph = H - CU_PAD.t - CU_PAD.b;
    const YMAX = 0.5;                          // энтропия показана ×½ → все умещаются в 0..0.5
    const PX = (p) => x0 + p * pw;
    const PY = (v) => y0 + ph - v / YMAX * ph;
    // сетка
    ctx.font = "11px -apple-system, system-ui, sans-serif"; ctx.fillStyle = "#8a93a3";
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    for (let v = 0; v <= 0.5 + 1e-9; v += 0.1) { const Y = PY(v); ctx.strokeStyle = "rgba(20,23,28,.06)"; ctx.beginPath(); ctx.moveTo(x0, Y); ctx.lineTo(x0 + pw, Y); ctx.stroke(); ctx.fillText(v.toFixed(1), x0 - 7, Y); }
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    for (let p = 0; p <= 1 + 1e-9; p += 0.2) { const X = PX(p); ctx.strokeStyle = "rgba(20,23,28,.05)"; ctx.beginPath(); ctx.moveTo(X, y0); ctx.lineTo(X, y0 + ph); ctx.stroke(); ctx.fillStyle = "#8a93a3"; ctx.fillText(p.toFixed(1), X, y0 + ph + 16); }
    ctx.fillText("доля класса A   p", x0 + pw / 2, y0 + ph + 30);
    ctx.save(); ctx.translate(13, y0 + ph / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = "center"; ctx.fillText("неоднородность H", 0, 0); ctx.restore();
    // кривые (энтропия ×½)
    const disp = { error: (p) => impur.error(p), gini: (p) => impur.gini(p), entropy: (p) => impur.entropy(p) * 0.5 };
    ORDER.forEach((key) => {
      ctx.strokeStyle = CR[key].color; ctx.lineWidth = 2.6; ctx.beginPath();
      for (let s = 0; s <= 200; s++) { const p = s / 200, X = PX(p), Y = PY(disp[key](p)); s ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }
      ctx.stroke();
    });
    // подписи кривых
    ctx.font = "italic 700 12px Georgia, serif"; ctx.textBaseline = "middle";
    ctx.fillStyle = CR.entropy.color; ctx.textAlign = "left"; ctx.fillText("Энтропия ×½", PX(0.62), PY(disp.entropy(0.78)) - 2);
    ctx.fillStyle = CR.gini.color; ctx.textAlign = "right"; ctx.fillText("Джини", PX(0.22), PY(disp.gini(0.22)) - 12);
    ctx.fillStyle = CR.error.color; ctx.textAlign = "left"; ctx.fillText("Доля ошибок", PX(0.5) + 4, PY(0.27));
    // пунктир текущего p (из ползунка) + точки на трёх кривых
    const pk = state.k / state.N;
    drawPLine(ctx, PX, PY, disp, pk, true);
    // ховер в любой точке
    if (state.hoverP >= 0) drawPLine(ctx, PX, PY, disp, state.hoverP, false);
    // тултип
    const tp = state.hoverP >= 0 ? state.hoverP : pk;
    const tip = `p = ${fmt(tp)}   ·   ошибки ${fmt(impur.error(tp))}   ·   Джини ${fmt(impur.gini(tp))}   ·   энтропия ${fmt(impur.entropy(tp))}`;
    ctx.font = "600 11.5px -apple-system, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillStyle = "#475569";
    ctx.fillText(tip, x0 + pw / 2, y0 + 1);
  }
  function drawPLine(ctx, PX, PY, disp, p, solid) {
    const X = PX(p);
    ctx.strokeStyle = solid ? "rgba(20,23,28,.35)" : "rgba(20,23,28,.18)";
    ctx.lineWidth = 1.4; ctx.setLineDash(solid ? [] : [4, 4]);
    ctx.beginPath(); ctx.moveTo(X, PY(0)); ctx.lineTo(X, PY(0.5)); ctx.stroke(); ctx.setLineDash([]);
    ORDER.forEach((key) => {
      ctx.beginPath(); ctx.arc(X, PY(disp[key](p)), solid ? 5 : 4, 0, 7);
      ctx.fillStyle = CR[key].color; ctx.fill();
      if (solid) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.stroke(); }
    });
  }
  cu.cv.addEventListener("mousemove", (e) => {
    const r = cu.cv.getBoundingClientRect();
    const pw = cu.W - CU_PAD.l - CU_PAD.r;
    const p = (e.clientX - r.left - CU_PAD.l) / pw;
    state.hoverP = Math.max(0, Math.min(1, p)); drawCurves();
  });
  cu.cv.addEventListener("mouseleave", () => { state.hoverP = -1; drawCurves(); });

  // ======================= ЧАСТЬ 2: сплит и прирост =======================
  const sp = mkCanvas("split");
  const SP_PAD = { l: 44, r: 16, t: 14, b: 28 };
  const STRIP_H = 66, GAP = 20;

  function genPoints() {
    const r = rng32(state.seed), N = 14, pts = [];
    for (let i = 0; i < N; i++) pts.push({ x: 0.05 + r() * 0.9, jit: 0.18 + r() * 0.64 });
    pts.sort((p, q) => p.x - q.x);
    // сбалансированный родитель (~7/7): левая половина — класс A, правая — B
    const mid = Math.floor(N / 2);
    pts.forEach((p, i) => { p.cls = i < mid ? 0 : 1; });
    // лёгкое перекрытие у границы + одна случайная инверсия внутри — для реалистичности
    pts[mid - 1].cls = 1; pts[mid].cls = 0;
    const j = 2 + Math.floor(r() * (N - 4));
    pts[j].cls = 1 - pts[j].cls;
    state.pts = pts;
    state.best = bestSplit().t;
    state.t = state.best;
  }
  // неоднородность набора по долям класса A
  function Hof(pts) {
    if (!pts.length) return 0;
    const a = pts.filter((p) => p.cls === 0).length;
    return impur[state.crit](a / pts.length);
  }
  function gainAt(t) {
    const pts = state.pts, N = pts.length;
    const L = pts.filter((p) => p.x <= t), R = pts.filter((p) => p.x > t);
    const Hp = Hof(pts), Hl = Hof(L), Hr = Hof(R);
    const w = (L.length / N) * Hl + (R.length / N) * Hr;
    return { Hp, Hl, Hr, w, Q: Hp - w, nl: L.length, nr: R.length };
  }
  function bestSplit() {
    const xs = state.pts.map((p) => p.x).sort((a, b) => a - b);
    let bt = 0.5, bq = -1;
    for (let i = 0; i < xs.length - 1; i++) {
      const t = (xs[i] + xs[i + 1]) / 2, q = gainAt(t).Q;
      if (q > bq + 1e-12) { bq = q; bt = t; }
    }
    return { t: bt, Q: bq };
  }

  function drawSplit() {
    const { ctx, W, H } = sp; if (!W) return;
    ctx.clearRect(0, 0, W, H);
    const x0 = SP_PAD.l, pw = W - SP_PAD.l - SP_PAD.r;
    const PX = (x) => x0 + x * pw;
    const sY = SP_PAD.t, sH = STRIP_H;
    const cY = sY + sH + GAP, cH = H - cY - SP_PAD.b;
    const g = gainAt(state.t);
    // верхняя лента: тонировка регионов по классу-большинству
    const tint = (pts, X1, X2) => {
      if (!pts.length) return;
      const a = pts.filter((p) => p.cls === 0).length;
      ctx.fillStyle = a >= pts.length - a ? "rgba(124,58,237,.07)" : "rgba(225,29,72,.07)";
      ctx.fillRect(X1, sY, X2 - X1, sH);
    };
    const L = state.pts.filter((p) => p.x <= state.t), R = state.pts.filter((p) => p.x > state.t);
    tint(L, x0, PX(state.t)); tint(R, PX(state.t), x0 + pw);
    ctx.strokeStyle = "rgba(20,23,28,.12)";
    ctx.strokeRect(x0, sY, pw, sH);
    // точки
    state.pts.forEach((p) => {
      const X = PX(p.x), Y = sY + sH * p.jit;
      ctx.beginPath(); ctx.arc(X, Y, 6, 0, 7); ctx.fillStyle = p.cls === 0 ? CLS_A : CLS_B; ctx.fill();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.stroke();
    });
    ctx.font = "11px -apple-system, system-ui, sans-serif"; ctx.fillStyle = "#8a93a3";
    ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText("объекты", x0 + 4, sY + 9);
    // нижний график Q(t)
    let maxQ = 0; for (let s = 0; s <= 120; s++) { maxQ = Math.max(maxQ, gainAt(s / 120).Q); }
    maxQ = Math.max(maxQ, 0.05) * 1.18;
    const QY = (q) => cY + cH - q / maxQ * cH;
    // сетка Y
    ctx.textAlign = "right"; ctx.textBaseline = "middle"; ctx.fillStyle = "#8a93a3";
    for (let k = 0; k <= 3; k++) { const q = maxQ * k / 3, Y = QY(q); ctx.strokeStyle = "rgba(20,23,28,.06)"; ctx.beginPath(); ctx.moveTo(x0, Y); ctx.lineTo(x0 + pw, Y); ctx.stroke(); ctx.fillText(q.toFixed(2), x0 - 7, Y); }
    // ось X (признак)
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    for (let x = 0; x <= 1 + 1e-9; x += 0.2) { const X = PX(x); ctx.fillStyle = "#8a93a3"; ctx.fillText(x.toFixed(1), X, cY + cH + 16); }
    ctx.fillText("порог t  (значение признака x)", x0 + pw / 2, cY + cH + 27);
    ctx.save(); ctx.translate(12, cY + cH / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = "center"; ctx.fillStyle = "#8a93a3"; ctx.fillText("прирост Q(t)", 0, 0); ctx.restore();
    // кривая Q(t)
    ctx.strokeStyle = CR[state.crit].color; ctx.lineWidth = 2.6; ctx.beginPath();
    for (let s = 0; s <= 300; s++) { const t = s / 300, X = PX(t), Y = QY(gainAt(t).Q); s ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }
    ctx.stroke();
    // лучший сплит — звезда (всегда в кадре)
    const bs = bestSplit();
    drawStar(ctx, PX(bs.t), QY(bs.Q), 8, "#f59e0b");
    ctx.fillStyle = "#b45309"; ctx.font = "700 11px -apple-system, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    ctx.fillText("лучший", PX(bs.t), QY(bs.Q) - 11);
    // вертикаль текущего порога через обе ленты
    const TX = PX(state.t);
    ctx.strokeStyle = "#4f46e5"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(TX, sY - 4); ctx.lineTo(TX, cY + cH); ctx.stroke();
    // ручка
    ctx.fillStyle = "#4f46e5"; ctx.beginPath(); ctx.moveTo(TX - 6, sY - 10); ctx.lineTo(TX + 6, sY - 10); ctx.lineTo(TX, sY - 2); ctx.closePath(); ctx.fill();
    // точка на кривой при текущем t
    ctx.beginPath(); ctx.arc(TX, QY(g.Q), 5.5, 0, 7); ctx.fillStyle = "#4f46e5"; ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke();
    renderGain(g);
  }
  function drawStar(ctx, cx, cy, r, color) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const ang = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; const x = cx + rr * Math.cos(ang), y = cy + rr * Math.sin(ang); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.closePath(); ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.2; ctx.stroke();
  }
  function renderGain(g) {
    const c = CR[state.crit];
    $("#gainStats").innerHTML =
      `<div class="gchip"><div class="gk">H(узла) · ${c.name}</div><div class="gv">${fmt(g.Hp)}</div></div>` +
      `<div class="gchip"><div class="gk">H(левый) · n=${g.nl}</div><div class="gv" style="color:${CLS_A}">${fmt(g.Hl)}</div></div>` +
      `<div class="gchip"><div class="gk">H(правый) · n=${g.nr}</div><div class="gv" style="color:${CLS_B}">${fmt(g.Hr)}</div></div>` +
      `<div class="gchip"><div class="gk">взвеш. дети</div><div class="gv">${fmt(g.w)}</div></div>` +
      `<div class="gchip gain"><div class="gk">прирост Q = H − дети</div><div class="gv">${fmt(g.Q)}</div></div>`;
  }
  // перетаскивание порога
  function setTFromX(clientX) {
    const r = sp.cv.getBoundingClientRect(), pw = sp.W - SP_PAD.l - SP_PAD.r;
    state.t = Math.max(0, Math.min(1, (clientX - r.left - SP_PAD.l) / pw));
    drawSplit();
  }
  let dragging = false;
  sp.cv.addEventListener("mousedown", (e) => { dragging = true; setTFromX(e.clientX); });
  window.addEventListener("mousemove", (e) => { if (dragging) setTFromX(e.clientX); });
  window.addEventListener("mouseup", () => { dragging = false; });

  // ======================= ноут =======================
  function renderNote() {
    $("#note").innerHTML =
      `<b>Главное.</b> Чистый узел → <b>H = 0</b>; смесь 50/50 → максимум. Дерево на каждом шаге берёт сплит с <b>наибольшим приростом Q</b> — и так жадно режет данные на всё более чистые куски. ` +
      `<b class="c-gini">Джини</b> и <b class="c-ent">энтропия</b> почти всегда дают близкие деревья (обе гладкие); <b class="c-err">доля ошибок</b> грубее и для роста дерева используется редко. В регрессии та же логика, но H — это дисперсия (MSE) или MAE. ` +
      `Как один порог делит выборку налево/направо — подробно на странице <a href="../split/index.html" style="color:#4f46e5;font-weight:650">«Сплит дерева»</a>.`;
  }

  // ======================= управление =======================
  function redrawAll() { renderNode(); drawCurves(); drawSplit(); }

  $("#kSlider").addEventListener("input", (e) => { state.k = +e.target.value; $("#kVal").textContent = e.target.value; renderNode(); drawCurves(); });
  $("#critSeg").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    $("#critSeg").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
    state.crit = b.dataset.crit;
    // подкрасим активную кнопку цветом критерия
    $("#critSeg").querySelectorAll("button").forEach((x) => { x.style.background = x.classList.contains("on") ? CR[x.dataset.crit].color : ""; });
    state.best = bestSplit().t; drawSplit();
  }));
  $("#toBest").addEventListener("click", () => { state.t = bestSplit().t; drawSplit(); });
  $("#newPts").addEventListener("click", () => { state.seed = (state.seed * 1103515245 + 12345) >>> 0; genPoints(); drawSplit(); });
  window.addEventListener("resize", () => { cu.resize(); sp.resize(); drawCurves(); drawSplit(); });

  // ======================= старт =======================
  function init() {
    // цвет активной кнопки критерия
    $("#critSeg").querySelectorAll("button").forEach((x) => { if (x.classList.contains("on")) x.style.background = CR[x.dataset.crit].color; });
    genPoints();
    renderNode(); renderNote();
    cu.resize(); sp.resize();
    drawCurves(); drawSplit();
  }
  init();
})();
