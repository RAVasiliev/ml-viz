/* «Болен или здоров?» — порог классификации, матрица ошибок и метрики
   Accuracy / Precision / Recall / F1. Верхний график — гистограмма людей по
   вероятности болезни. Нижний график — все метрики как функции порога.
   Порог тащим в обоих местах. Масштабируется до тысяч людей. Vanilla JS. */
(function () {
  "use strict";

  const SICK = "#ef4444", HEALTHY = "#10b981", ACCENT = "#4f46e5";
  const SICK_D = "#b91c1c", HEALTHY_D = "#047857";
  const C_ACC = "#475569", C_F1 = "#8b5cf6", C_REC = "#4f46e5", C_PREC = "#0ea5e9";
  const $ = (s) => document.querySelector(s);
  const KT = (tex) => (window.katex ? katex.renderToString(tex, { throwOnError: false, trust: true, strict: false }) : tex);

  const state = { sep: 0.24, balance: 0.4, count: 500, seed: 3, thr: 0.5, drag: null,
                  prev: { a: 0, p: 0, r: 0, f: 0 } };
  let PPL = [];       // [{sick, p}]
  let CURVES = [];    // [{t, acc, prec, rec, f1}] — метрики по сетке порогов
  const NB = 50;      // бины гистограммы
  const STEPS = 100;  // шаги порога для кривых

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(r, m, sd) {
    let u = 0, v = 0;
    while (u === 0) u = r(); while (v === 0) v = r();
    return m + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  function generate() {
    const r = mulberry32(state.seed);
    PPL = [];
    for (let i = 0; i < state.count; i++) {
      const sick = r() < state.balance;
      const mean = sick ? 0.5 + state.sep : 0.5 - state.sep;
      const p = clamp(gauss(r, mean, 0.13), 0.001, 0.999);
      PPL.push({ sick, p });
    }
    computeCurves();
  }
  function countsAt(T) {
    let TP = 0, FP = 0, FN = 0, TN = 0;
    for (const d of PPL) {
      const pos = d.p >= T;
      if (d.sick && pos) TP++; else if (!d.sick && pos) FP++;
      else if (d.sick && !pos) FN++; else TN++;
    }
    return { TP, FP, FN, TN };
  }
  function metricsFrom(c) {
    const N = c.TP + c.FP + c.FN + c.TN;
    return {
      acc: N ? (c.TP + c.TN) / N : NaN,
      rec: (c.TP + c.FN) ? c.TP / (c.TP + c.FN) : NaN,
      prec: (c.TP + c.FP) ? c.TP / (c.TP + c.FP) : NaN,
      f1: (2 * c.TP + c.FP + c.FN) ? (2 * c.TP) / (2 * c.TP + c.FP + c.FN) : NaN,
    };
  }
  function computeCurves() {
    CURVES = [];
    for (let k = 0; k <= STEPS; k++) {
      const t = k / STEPS, m = metricsFrom(countsAt(t));
      CURVES.push({ t, ...m });
    }
  }
  const curveAt = (t) => CURVES[clamp(Math.round(t * STEPS), 0, STEPS)];
  function bins() {
    const s = new Array(NB).fill(0), h = new Array(NB).fill(0);
    for (const d of PPL) { const b = clamp(Math.floor(d.p * NB), 0, NB - 1); if (d.sick) s[b]++; else h[b]++; }
    return { s, h };
  }

  // ---------- общие хелперы ----------
  function setupCanvas(cv, c) {
    const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    c.setTransform(dpr, 0, 0, dpr, 0, 0); return { w: r.width, h: r.height };
  }
  function roundRect(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }

  // ====== ВЕРХНИЙ ГРАФИК: гистограмма ======
  const canvas = $("#chart"), ctx = canvas.getContext("2d");
  let W = 0, H = 0;
  const PAD = { l: 46, r: 16, t: 26, b: 48 };
  const plot = () => ({ x: PAD.l, y: PAD.t, w: W - PAD.l - PAD.r, h: H - PAD.t - PAD.b });
  const px = (p) => plot().x + p * plot().w;
  const ipx = (X) => clamp((X - plot().x) / plot().w, 0, 1);

  function yTicks(max) {
    const raw = max / 4, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = (raw / mag <= 1 ? 1 : raw / mag <= 2 ? 2 : raw / mag <= 5 ? 5 : 10) * mag;
    const out = []; for (let v = 0; v <= max + 1e-9; v += step) out.push(Math.round(v));
    return out;
  }
  function hatch(x, y, w, h, col) {
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.globalAlpha = 0.5;
    for (let d = -h; d < w; d += 5) { ctx.beginPath(); ctx.moveTo(x + d, y + h); ctx.lineTo(x + d + h, y); ctx.stroke(); }
    ctx.restore();
  }
  function region(t, X, Y, col) {
    ctx.font = "800 13px -apple-system, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = col; ctx.globalAlpha = 0.5; ctx.fillText(t, X, Y); ctx.globalAlpha = 1;
  }
  function draw() {
    if (!W) return;
    const p = plot(), T = state.thr, Xt = px(T), base = p.y + p.h;
    ctx.clearRect(0, 0, W, H);
    const { s, h } = bins();
    let maxC = 1; for (let b = 0; b < NB; b++) maxC = Math.max(maxC, s[b], h[b]);
    const yScale = (p.h - 6) / (maxC * 1.12), bw = p.w / NB;

    ctx.fillStyle = "rgba(16,185,129,.05)"; ctx.fillRect(p.x, p.y, Xt - p.x, p.h);
    ctx.fillStyle = "rgba(239,68,68,.05)"; ctx.fillRect(Xt, p.y, p.x + p.w - Xt, p.h);

    ctx.font = "11px -apple-system, system-ui, sans-serif"; ctx.fillStyle = "#8a93a3";
    ctx.strokeStyle = "rgba(20,23,28,.06)"; ctx.lineWidth = 1;
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    for (const v of yTicks(maxC * 1.12)) { const Y = base - v * yScale; ctx.beginPath(); ctx.moveTo(p.x, Y); ctx.lineTo(p.x + p.w, Y); ctx.stroke(); ctx.fillText(v, p.x - 7, Y); }
    ctx.save(); ctx.translate(14, p.y + p.h / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = "center"; ctx.fillText("число людей", 0, 0); ctx.restore();

    for (let b = 0; b < NB; b++) {
      const x0 = px(b / NB), center = (b + 0.5) / NB, left = center < T;
      if (h[b]) {
        const ht = h[b] * yScale, err = !left;
        ctx.fillStyle = err ? "rgba(16,185,129,.55)" : "rgba(16,185,129,.30)";
        ctx.fillRect(x0 + 0.5, base - ht, bw - 1, ht);
        if (err) hatch(x0 + 0.5, base - ht, bw - 1, ht, HEALTHY_D);
      }
      if (s[b]) {
        const ht = s[b] * yScale, err = left;
        ctx.fillStyle = err ? "rgba(239,68,68,.55)" : "rgba(239,68,68,.30)";
        ctx.fillRect(x0 + 0.5, base - ht, bw - 1, ht);
        if (err) hatch(x0 + 0.5, base - ht, bw - 1, ht, SICK_D);
      }
    }

    ctx.strokeStyle = "rgba(20,23,28,.2)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(p.x, base); ctx.lineTo(p.x + p.w, base); ctx.stroke();
    ctx.fillStyle = "#8a93a3"; ctx.textAlign = "center"; ctx.textBaseline = "top";
    for (const t of [0, 0.25, 0.5, 0.75, 1]) ctx.fillText(t.toFixed(2), px(t), base + 6);
    ctx.fillText("вероятность болезни (по мнению теста)", p.x + p.w / 2, base + 24);
    ctx.font = "700 12px -apple-system, sans-serif";
    ctx.fillStyle = HEALTHY_D; ctx.textAlign = "left"; ctx.fillText("← тест: «здоров»", p.x + 6, p.y + 2);
    ctx.fillStyle = SICK_D; ctx.textAlign = "right"; ctx.fillText("тест: «болен» →", p.x + p.w - 6, p.y + 2);

    region("TN", px(clamp(0.5 - state.sep, 0.04, T - 0.02)), p.y + 22, HEALTHY_D);
    region("TP", px(clamp(0.5 + state.sep, T + 0.02, 0.96)), p.y + 22, SICK_D);

    ctx.strokeStyle = ACCENT; ctx.lineWidth = 2.5; ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.moveTo(Xt, p.y + 14); ctx.lineTo(Xt, base); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = ACCENT; roundRect(ctx, Xt - 26, p.y - 8, 52, 22, 7); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = "700 12px -apple-system, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("⇆ " + T.toFixed(2), Xt, p.y + 3);
  }

  // ====== НИЖНИЙ ГРАФИК: метрики от порога ======
  const canvas2 = $("#chart2"), ctx2 = canvas2.getContext("2d");
  let W2 = 0, H2 = 0;
  const PAD2 = { l: 44, r: 16, t: 30, b: 40 };
  const plot2 = () => ({ x: PAD2.l, y: PAD2.t, w: W2 - PAD2.l - PAD2.r, h: H2 - PAD2.t - PAD2.b });
  const px2 = (t) => plot2().x + t * plot2().w;
  const py2 = (v) => { const p = plot2(); return p.y + p.h - v * p.h; };
  const ipx2 = (X) => clamp((X - plot2().x) / plot2().w, 0, 1);

  function curve2(getter, color, dash) {
    ctx2.save(); ctx2.strokeStyle = color; ctx2.lineWidth = 2.4; ctx2.setLineDash(dash || []);
    ctx2.lineJoin = "round"; ctx2.beginPath();
    let started = false;
    for (const d of CURVES) {
      const v = getter(d);
      if (Number.isNaN(v)) { started = false; continue; }
      const X = px2(d.t), Y = py2(v);
      if (!started) { ctx2.moveTo(X, Y); started = true; } else ctx2.lineTo(X, Y);
    }
    ctx2.stroke(); ctx2.restore();
  }
  function draw2() {
    if (!W2) return;
    const p = plot2(), base = p.y + p.h, T = state.thr, Xt = px2(T);
    ctx2.clearRect(0, 0, W2, H2);
    // сетка
    ctx2.font = "11px -apple-system, system-ui, sans-serif"; ctx2.fillStyle = "#8a93a3";
    ctx2.strokeStyle = "rgba(20,23,28,.06)"; ctx2.lineWidth = 1;
    ctx2.textAlign = "right"; ctx2.textBaseline = "middle";
    for (const v of [0, 0.25, 0.5, 0.75, 1]) { const Y = py2(v); ctx2.beginPath(); ctx2.moveTo(p.x, Y); ctx2.lineTo(p.x + p.w, Y); ctx2.stroke(); ctx2.fillText(Math.round(v * 100) + "%", p.x - 6, Y); }
    ctx2.textAlign = "center"; ctx2.textBaseline = "top";
    for (const t of [0, 0.25, 0.5, 0.75, 1]) ctx2.fillText(t.toFixed(2), px2(t), base + 6);
    ctx2.fillText("порог", p.x + p.w / 2, base + 22);

    // кривые
    curve2((d) => d.acc, C_ACC, []);
    curve2((d) => d.f1, C_F1, [6, 4]);
    curve2((d) => d.rec, C_REC, []);
    curve2((d) => d.prec, C_PREC, [2, 4]);

    // линия текущего порога
    ctx2.strokeStyle = ACCENT; ctx2.lineWidth = 2; ctx2.setLineDash([5, 4]);
    ctx2.beginPath(); ctx2.moveTo(Xt, p.y); ctx2.lineTo(Xt, base); ctx2.stroke(); ctx2.setLineDash([]);

    // точки + легенда с текущими значениями
    const cur = curveAt(T);
    const items = [["Accuracy", cur.acc, C_ACC, []], ["F1", cur.f1, C_F1, [6, 4]], ["Recall", cur.rec, C_REC, []], ["Precision", cur.prec, C_PREC, [2, 4]]];
    for (const [, v, col] of items) {
      if (Number.isNaN(v)) continue;
      ctx2.beginPath(); ctx2.arc(Xt, py2(v), 4.5, 0, 7); ctx2.fillStyle = col; ctx2.fill();
      ctx2.lineWidth = 2; ctx2.strokeStyle = "#fff"; ctx2.stroke();
    }
    // легенда вверху
    ctx2.textBaseline = "middle"; ctx2.font = "12px -apple-system, system-ui, sans-serif";
    let lx = p.x + 2, ly = p.y - 16;
    for (const [name, v, col, dash] of items) {
      ctx2.strokeStyle = col; ctx2.lineWidth = 2.6; ctx2.setLineDash(dash);
      ctx2.beginPath(); ctx2.moveTo(lx, ly); ctx2.lineTo(lx + 20, ly); ctx2.stroke(); ctx2.setLineDash([]);
      ctx2.fillStyle = col; ctx2.textAlign = "left";
      const txt = name + " " + (Number.isNaN(v) ? "—" : Math.round(v * 100) + "%");
      ctx2.fillText(txt, lx + 26, ly + 1);
      lx += 26 + ctx2.measureText(txt).width + 18;
    }
  }

  // ---------- метрики/панели ----------
  const pct = (v) => (Number.isNaN(v) ? "—" : Math.round(v * 100) + "%");
  const setBar = (id, v) => { $(id).style.width = (Number.isNaN(v) ? 0 : v * 100) + "%"; };
  function arrow(sel, val, key) {
    const el = $(sel), prev = state.prev[key];
    if (!Number.isNaN(val)) {
      el.textContent = val > prev + 0.002 ? "↑" : val < prev - 0.002 ? "↓" : "";
      el.style.color = val > prev + 0.002 ? "#0f9d58" : "#dc2626";
      state.prev[key] = val;
    } else el.textContent = "";
  }
  function update() {
    const c = countsAt(state.thr), N = c.TP + c.FP + c.FN + c.TN, m = metricsFrom(c);
    $("#cmTP").querySelector(".ct").textContent = c.TP;
    $("#cmFP").querySelector(".ct").textContent = c.FP;
    $("#cmFN").querySelector(".ct").textContent = c.FN;
    $("#cmTN").querySelector(".ct").textContent = c.TN;

    $("#aVal").textContent = pct(m.acc); $("#fVal").textContent = pct(m.f1);
    $("#rVal").textContent = pct(m.rec); $("#pVal").textContent = pct(m.prec);
    $("#aFrac").innerHTML = KT(`\\mathrm{Acc}=\\dfrac{TP+TN}{N}=\\dfrac{${c.TP}+${c.TN}}{${N}}`);
    $("#fFrac").innerHTML = KT(`F_1=\\dfrac{2\\,TP}{2\\,TP+FP+FN}=\\dfrac{${2 * c.TP}}{${2 * c.TP + c.FP + c.FN}}`);
    $("#rFrac").innerHTML = KT(`\\mathrm{Recall}=\\dfrac{TP}{TP+FN}=\\dfrac{${c.TP}}{${c.TP + c.FN}}`);
    $("#pFrac").innerHTML = KT(`\\mathrm{Precision}=\\dfrac{TP}{TP+FP}=\\dfrac{${c.TP}}{${c.TP + c.FP}}`);
    setBar("#aBar", m.acc); setBar("#fBar", m.f1); setBar("#rBar", m.rec); setBar("#pBar", m.prec);
    arrow("#aArr", m.acc, "a"); arrow("#fArr", m.f1, "f"); arrow("#rArr", m.rec, "r"); arrow("#pArr", m.prec, "p");

    const sickTotal = c.TP + c.FN, named = c.TP + c.FP;
    $("#note").innerHTML =
      `Порог <b>${state.thr.toFixed(2)}</b>: из <b>${sickTotal}</b> настоящих больных тест поймал <b style="color:#0f9d58">${c.TP}</b> и пропустил <b style="color:#dc2626">${c.FN}</b> (FN); ` +
      `из <b>${named}</b> названных больными <b style="color:#dc2626">${c.FP}</b> — ложная тревога (FP).<br>` +
      `<b>Правило:</b> порог <b>влево</b> → ловим больше больных (<b style="color:#4f46e5">Recall↑</b>), но больше ложных тревог (<b style="color:#0ea5e9">Precision↓</b>). Вправо — наоборот. <b>F1</b> высок, когда обе хороши.`;
  }

  // ---------- тащим порог (оба графика) ----------
  function setThr(t) {
    state.thr = Math.round(t * 100) / 100;
    $("#thrVal").textContent = state.thr.toFixed(2);
    draw(); draw2(); update();
  }
  canvas.addEventListener("mousedown", (e) => { state.drag = "hist"; const r = canvas.getBoundingClientRect(); setThr(ipx(e.clientX - r.left)); });
  canvas2.addEventListener("mousedown", (e) => { state.drag = "curve"; const r = canvas2.getBoundingClientRect(); setThr(ipx2(e.clientX - r.left)); });
  window.addEventListener("mousemove", (e) => {
    if (state.drag === "hist") { const r = canvas.getBoundingClientRect(); setThr(ipx(e.clientX - r.left)); }
    else if (state.drag === "curve") { const r = canvas2.getBoundingClientRect(); setThr(ipx2(e.clientX - r.left)); }
  });
  window.addEventListener("mouseup", () => { state.drag = null; });

  // ---------- ресайз ----------
  function resize() {
    const a = setupCanvas(canvas, ctx); W = a.w; H = a.h;
    const b = setupCanvas(canvas2, ctx2); W2 = b.w; H2 = b.h;
    draw(); draw2();
  }
  window.addEventListener("resize", resize);

  // ---------- контролы ----------
  function rebuild() { generate(); draw(); draw2(); update(); }
  $("#sep").addEventListener("input", (e) => {
    state.sep = +e.target.value;
    $("#sepVal").textContent = state.sep < 0.15 ? "слабый" : state.sep < 0.3 ? "ср." : "сильный";
    rebuild();
  });
  $("#bal").addEventListener("input", (e) => { state.balance = +e.target.value; $("#balVal").textContent = Math.round(state.balance * 100) + "%"; rebuild(); });
  $("#count").addEventListener("input", (e) => { state.count = +e.target.value; $("#countVal").textContent = e.target.value; rebuild(); });
  $("#newData").addEventListener("click", () => { state.seed = (state.seed * 1103515245 + 12345) >>> 0; rebuild(); });

  // ---------- старт ----------
  // KaTeX-набор инлайн-формул в лиде (s(x), τ, ŷ = 1[s≥τ], y∈{0,1})
  document.querySelectorAll('.kf[data-tex]').forEach((e) => {
    try { katex.render(e.dataset.tex, e, { throwOnError: false, trust: true, strict: false }); } catch (err) {}
  });
  $("#sepVal").textContent = "ср.";
  generate(); resize(); update();
})();
