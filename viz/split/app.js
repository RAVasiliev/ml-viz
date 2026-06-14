/* Сплит дерева решений: один порог t по признаку.
   Объекты с x<t → налево (R_ℓ), x≥t → направо (R_r). Считаем чистоту H каждой
   части и прирост информации Q(R,t)=H(R)−взвешенная сумма = IG. Тащим порог,
   ищем максимум IG. Формулы — Неделя 6 конспектов. Vanilla JS + KaTeX. */
(function () {
  "use strict";

  const C0 = "#2563eb", C1 = "#dc2626";          // классы
  const HLC = "#16a34a", HRC = "#ea580c";        // левая/правая части
  const IGC = "#7c3aed", ACCENT = "#4f46e5";
  const $ = (s) => document.querySelector(s);
  const KT = (t, b) => (window.katex ? katex.renderToString(t, { throwOnError: false, displayMode: !!b }) : t);

  const state = { crit: "entropy", n: 120, sep: 0.6, seed: 7, theta: 0, drag: null };
  let DATA = [];           // [{x, c}]
  let XMIN = -3, XMAX = 3;
  let CURVE = [];          // [{t, Hl, Hr, wl, wr, Q}]
  let TSTAR = 0, IGSTAR = 0;
  let parentH = 0, tot0 = 0, tot1 = 0;

  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function gauss(r, m, sd) { let u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return m + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  const Hmax = () => (state.crit === "entropy" ? 1 : 0.5);
  function H(n0, n1) {                            // чистота по выбранному критерию
    const n = n0 + n1; if (n === 0) return 0;
    const p = n1 / n, q = n0 / n;
    if (state.crit === "gini") return p * (1 - p) + q * (1 - q);
    if (state.crit === "error") return 1 - Math.max(p, q);
    const t = (x) => (x > 0 ? -x * Math.log2(x) : 0);
    return t(p) + t(q);
  }

  function generate() {
    const r = mulberry32(state.seed);
    const m = 0.3 + state.sep * 1.6;             // разнос центров классов
    DATA = [];
    for (let i = 0; i < state.n; i++) {
      const c = r() < 0.5 ? 0 : 1;
      const x = gauss(r, c === 0 ? -m : m, 1);
      DATA.push({ x, c });
    }
    let mn = Infinity, mx = -Infinity;
    for (const d of DATA) { if (d.x < mn) mn = d.x; if (d.x > mx) mx = d.x; }
    const pad = (mx - mn) * 0.04 + 0.1;
    XMIN = mn - pad; XMAX = mx + pad;
    tot0 = DATA.filter((d) => d.c === 0).length; tot1 = DATA.length - tot0;
    parentH = H(tot0, tot1);
    state.theta = clamp(state.theta, XMIN, XMAX) || (XMIN + XMAX) / 2;
    computeCurve();
  }

  function splitAt(t) {
    let n0l = 0, n1l = 0;
    for (const d of DATA) if (d.x < t) (d.c === 0 ? n0l++ : n1l++);
    const n0r = tot0 - n0l, n1r = tot1 - n1l;
    const nl = n0l + n1l, nr = n0r + n1r, n = nl + nr;
    const Hl = H(n0l, n1l), Hr = H(n0r, n1r);
    const wl = (nl / n) * Hl, wr = (nr / n) * Hr;
    const Q = parentH - wl - wr;
    return { n0l, n1l, n0r, n1r, nl, nr, n, Hl, Hr, wl, wr, Q };
  }

  function computeCurve() {
    CURVE = []; TSTAR = (XMIN + XMAX) / 2; IGSTAR = -1;
    const N = 240;
    for (let i = 0; i <= N; i++) {
      const t = XMIN + (XMAX - XMIN) * i / N;
      const s = splitAt(t);
      CURVE.push({ t, Hl: s.Hl, Hr: s.Hr, wl: s.wl, wr: s.wr, Q: s.Q });
      if (s.Q > IGSTAR) { IGSTAR = s.Q; TSTAR = t; }
    }
  }

  // ---------- геометрия ----------
  function setup(cv) {
    const ctx = cv.getContext("2d"), r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w: r.width, h: r.height };
  }
  const sceneCv = $("#scene"), curveCv = $("#curve");
  let SC = null, CU = null;
  const PADX = 44;
  function resize() { SC = setup(sceneCv); CU = setup(curveCv); drawScene(); drawCurve(); }
  const xMap = (g, v) => g.x0 + (v - XMIN) / (XMAX - XMIN) * g.w0;
  const xInv = (g, px) => XMIN + (px - g.x0) / g.w0 * (XMAX - XMIN);

  // ---------- сцена (полоска с объектами) ----------
  function drawScene() {
    if (!SC) return;
    const { ctx, w, h } = SC, g = { x0: PADX, w0: w - PADX - 14 };
    ctx.clearRect(0, 0, w, h);
    const Xt = xMap(g, state.theta), top = 16, bot = h - 26;
    // зоны
    ctx.fillStyle = "rgba(22,163,74,.06)"; ctx.fillRect(g.x0, top, Xt - g.x0, bot - top);
    ctx.fillStyle = "rgba(234,88,12,.06)"; ctx.fillRect(Xt, top, g.x0 + g.w0 - Xt, bot - top);
    // ось
    ctx.strokeStyle = "rgba(20,23,28,.18)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(g.x0, bot); ctx.lineTo(g.x0 + g.w0, bot); ctx.stroke();
    ctx.fillStyle = "#8a93a3"; ctx.font = "11px -apple-system, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "top";
    for (let k = Math.ceil(XMIN); k <= Math.floor(XMAX); k++) ctx.fillText(String(k), xMap(g, k), bot + 6);
    // объекты-квадратики
    const rng = mulberry32(99);
    for (const d of DATA) {
      const X = xMap(g, d.x), Y = top + 10 + rng() * (bot - top - 20);
      ctx.fillStyle = d.c === 0 ? C0 : C1; ctx.globalAlpha = 0.8;
      ctx.fillRect(X - 3, Y - 3, 6, 6);
    }
    ctx.globalAlpha = 1;
    // подписи зон
    ctx.font = "700 12px -apple-system, sans-serif"; ctx.textBaseline = "top";
    ctx.fillStyle = HLC; ctx.textAlign = "left"; ctx.fillText("← Rₗ (налево)", g.x0 + 6, top + 2);
    ctx.fillStyle = HRC; ctx.textAlign = "right"; ctx.fillText("Rᵣ (направо) →", g.x0 + g.w0 - 6, top + 2);
    // линия порога
    ctx.strokeStyle = ACCENT; ctx.lineWidth = 2.5; ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.moveTo(Xt, top); ctx.lineTo(Xt, bot); ctx.stroke(); ctx.setLineDash([]);
    drawKnob(ctx, Xt, top - 2, "t = " + state.theta.toFixed(2));
  }
  function drawKnob(ctx, X, y, label) {
    ctx.font = "700 11px -apple-system, sans-serif"; const tw = ctx.measureText(label).width + 16;
    ctx.fillStyle = ACCENT; roundRect(ctx, X - tw / 2, y - 9, tw, 18, 6); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(label, X, y);
  }
  function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  // ---------- кривые ----------
  function drawCurve() {
    if (!CU) return;
    const { ctx, w, h } = CU, g = { x0: PADX, w0: w - PADX - 14 };
    const top = 40, bot = h - 30, hm = Hmax();
    const Y = (v) => bot - v / hm * (bot - top);
    ctx.clearRect(0, 0, w, h);
    // сетка
    ctx.strokeStyle = "rgba(20,23,28,.06)"; ctx.fillStyle = "#8a93a3"; ctx.font = "11px -apple-system, sans-serif"; ctx.lineWidth = 1;
    const yt = hm === 1 ? [0, 0.25, 0.5, 0.75, 1] : [0, 0.125, 0.25, 0.375, 0.5];
    for (const v of yt) { const yy = Y(v); ctx.beginPath(); ctx.moveTo(g.x0, yy); ctx.lineTo(g.x0 + g.w0, yy); ctx.stroke(); ctx.textAlign = "right"; ctx.textBaseline = "middle"; ctx.fillText(v.toFixed(2), g.x0 - 7, yy); }
    for (let k = Math.ceil(XMIN); k <= Math.floor(XMAX); k++) { const xx = xMap(g, k); ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillText(String(k), xx, bot + 6); }
    ctx.fillStyle = "#5b6472"; ctx.textAlign = "center"; ctx.fillText("порог t (значение признака)", g.x0 + g.w0 / 2, bot + 20);

    // линия H(R) — чистота родителя
    ctx.strokeStyle = "rgba(20,23,28,.45)"; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(g.x0, Y(parentH)); ctx.lineTo(g.x0 + g.w0, Y(parentH)); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = "#5b6472"; ctx.font = "700 11px -apple-system, sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "bottom";
    ctx.fillText("H(R) = " + parentH.toFixed(2), g.x0 + 4, Y(parentH) - 2);

    const line = (key, color, dash, lw) => {
      ctx.strokeStyle = color; ctx.lineWidth = lw || 2; ctx.setLineDash(dash || []); ctx.beginPath();
      CURVE.forEach((c, i) => { const X = xMap(g, c.t), yy = Y(c[key]); i ? ctx.lineTo(X, yy) : ctx.moveTo(X, yy); });
      ctx.stroke(); ctx.setLineDash([]);
    };
    line("Hl", HLC, [], 1.6); line("Hr", HRC, [], 1.6);
    line("wl", HLC, [5, 4], 1.4); line("wr", HRC, [5, 4], 1.4);
    line("Q", IGC, [], 3);

    // лучший порог t*
    const Xs = xMap(g, TSTAR);
    ctx.strokeStyle = "rgba(124,58,237,.5)"; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(Xs, top); ctx.lineTo(Xs, bot); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = IGC; ctx.font = "12px -apple-system, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    ctx.fillText("★ t*", Xs, top - 2);

    // текущий порог
    const Xt = xMap(g, state.theta);
    ctx.strokeStyle = ACCENT; ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.moveTo(Xt, top); ctx.lineTo(Xt, bot); ctx.stroke(); ctx.setLineDash([]);
    const s = splitAt(state.theta);
    ctx.beginPath(); ctx.arc(Xt, Y(s.Q), 5, 0, 7); ctx.fillStyle = IGC; ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke();

    // легенда
    ctx.textBaseline = "middle"; ctx.font = "12px -apple-system, sans-serif";
    const items = [["H(Rₗ)", HLC, []], ["·вес", HLC, [5, 4]], ["H(Rᵣ)", HRC, []], ["·вес", HRC, [5, 4]], ["IG", IGC, []]];
    let lx = g.x0 + 4, ly = 16;
    for (const [lab, col, dash] of items) {
      ctx.strokeStyle = col; ctx.lineWidth = lab === "IG" ? 3 : 2; ctx.setLineDash(dash); ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + 20, ly); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = "#14171c"; ctx.textAlign = "left"; ctx.fillText(lab, lx + 24, ly + 1);
      lx += 24 + ctx.measureText(lab).width + 18;
    }
  }

  // ---------- правая панель: нода + IG ----------
  function purity(el, n0, n1) {
    const n = n0 + n1; const w0 = n ? (n0 / n * 100) : 50, w1 = n ? (n1 / n * 100) : 50;
    el.innerHTML = `<i class="p0" style="width:${w0}%"></i><i class="p1" style="width:${w1}%"></i>`;
  }
  function updatePanel() {
    const s = splitAt(state.theta);
    $("#hParent").textContent = "H = " + parentH.toFixed(3);
    $("#hLeft").textContent = "H = " + s.Hl.toFixed(3);
    $("#hRight").textContent = "H = " + s.Hr.toFixed(3);
    purity($("#purParent"), tot0, tot1); purity($("#purLeft"), s.n0l, s.n1l); purity($("#purRight"), s.n0r, s.n1r);
    $("#cntParent").innerHTML = `🔵 ${tot0} · 🔴 ${tot1} &nbsp; (всего ${tot0 + tot1})`;
    $("#cntLeft").innerHTML = `🔵 ${s.n0l} · 🔴 ${s.n1l} &nbsp; вес ${(s.nl / s.n).toFixed(2)}`;
    $("#cntRight").innerHTML = `🔵 ${s.n0r} · 🔴 ${s.n1r} &nbsp; вес ${(s.nr / s.n).toFixed(2)}`;

    const eq = `Q = ${parentH.toFixed(2)} - \\tfrac{${s.nl}}{${s.n}}\\!\\cdot\\!${s.Hl.toFixed(2)} - \\tfrac{${s.nr}}{${s.n}}\\!\\cdot\\!${s.Hr.toFixed(2)}`;
    $("#igeq").innerHTML = KT(eq, false);
    $("#igv").textContent = "IG = " + s.Q.toFixed(3);

    const best = Math.abs(state.theta - TSTAR) < (XMAX - XMIN) / 240 * 1.5;
    $("#note").innerHTML = best
      ? `Сейчас порог почти оптимален: <b>IG = ${s.Q.toFixed(3)}</b> ≈ максимум. Обе части стали максимально чистыми — дерево выбрало бы именно такой сплит.`
      : `Текущий <b>IG = ${s.Q.toFixed(3)}</b>, а в лучшем пороге <b>t* = ${TSTAR.toFixed(2)}</b> прирост <b>${IGSTAR.toFixed(3)}</b>. Жми «★ Лучший порог» или тащи к пику чёрной кривой. Чем чище обе части — тем больше IG.`;
  }

  function redraw() { drawScene(); drawCurve(); updatePanel(); }
  function setTheta(t) { state.theta = clamp(t, XMIN, XMAX); redraw(); }

  // ---------- взаимодействие ----------
  function bindDrag(cv, geomFn) {
    cv.addEventListener("mousedown", (e) => { state.drag = { cv, geomFn }; setFromEvent(e); });
  }
  function setFromEvent(e) {
    const { cv, geomFn } = state.drag; const r = cv.getBoundingClientRect();
    const g = geomFn(); setTheta(xInv(g, e.clientX - r.left));
  }
  window.addEventListener("mousemove", (e) => { if (state.drag) setFromEvent(e); });
  window.addEventListener("mouseup", () => { state.drag = null; });
  bindDrag(sceneCv, () => ({ x0: PADX, w0: SC.w - PADX - 14 }));
  bindDrag(curveCv, () => ({ x0: PADX, w0: CU.w - PADX - 14 }));

  // ---------- контролы ----------
  function rebuild() { generate(); redraw(); }
  $("#crit").addEventListener("change", (e) => { state.crit = e.target.value; parentH = H(tot0, tot1); computeCurve(); redraw(); });
  $("#n").addEventListener("input", (e) => { state.n = +e.target.value; $("#nVal").textContent = e.target.value; rebuild(); });
  $("#sep").addEventListener("input", (e) => { state.sep = +e.target.value; $("#sepVal").textContent = state.sep < 0.33 ? "низкая" : state.sep < 0.66 ? "ср." : "высокая"; rebuild(); });
  $("#newData").addEventListener("click", () => { state.seed = (state.seed * 1103515245 + 12345) >>> 0; rebuild(); });
  $("#best").addEventListener("click", () => setTheta(TSTAR));
  window.addEventListener("resize", resize);

  // ---------- старт ----------
  document.querySelectorAll(".kf[data-tex]").forEach((el) => { el.innerHTML = KT(el.getAttribute("data-tex"), el.hasAttribute("data-block")); });
  state.theta = 0;
  generate(); state.theta = (XMIN + XMAX) / 2; resize(); updatePanel();
})();
