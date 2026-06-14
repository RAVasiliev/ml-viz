/* «Насколько мы промахнулись? MAE / MSE / RMSE» — детски-понятная страница.
   Угадываем вес арбузов (ŷ), кладём на весы (y), промах e=y−ŷ превращаем
   в ошибку и собираем в метрику. Объект ↔ строка ↔ точка ↔ слагаемое связаны
   подсветкой при наведении. Чистый vanilla JS, без зависимостей. */
(function () {
  "use strict";

  const MAE_C = "#10b981", MSE_C = "#4f46e5", RMSE_C = "#8b5cf6";
  const GUESS_C = "#0ea5e9", REAL_C = "#334155";
  const $ = (s) => document.querySelector(s);

  const state = { n: 8, seed: 7, view: "bars", dropOut: false, hover: -1, pinned: -1, shown: -1 };
  let DATA = [];     // [{i,g,y,e,ae,se}]
  let OUT = -1;      // индекс грубого промаха

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // генерируем n арбузов: факт y (5..12 кг), угадал g; у одного — грубый промах ±7 кг
  function generate() {
    const rng = mulberry32(state.seed), n = state.n;
    DATA = []; OUT = Math.floor(rng() * n);
    for (let i = 0; i < n; i++) {
      const y = 5 + Math.floor(rng() * 8);
      let g;
      if (i === OUT) g = (y >= 8) ? y - 7 : y + 7;        // явный промах на 7 кг
      else g = y + (Math.round(rng() * 4) - 2);           // обычный промах −2..+2
      g = Math.max(1, Math.min(15, g));
      const e = y - g;
      DATA.push({ i, g, y, e, ae: Math.abs(e), se: e * e });
    }
  }

  const active = () => DATA.filter((d) => !(state.dropOut && d.i === OUT));
  function metricsOf(arr) {
    const n = arr.length;
    const sae = arr.reduce((s, d) => s + d.ae, 0), sse = arr.reduce((s, d) => s + d.se, 0);
    return { n, sae, sse, mae: sae / n, mse: sse / n, rmse: Math.sqrt(sse / n) };
  }
  const metrics = () => metricsOf(active());
  const fmt = (v) => String(Math.round(v * 100) / 100);
  // строгое =/≈: точно для конечных дробей, иначе ≈
  const approx = (v) => { const r = Math.round(v * 100) / 100; return { s: String(r), eq: Math.abs(r - v) < 1e-9 ? "=" : "≈" }; };

  // грядка убрана; cards оставлены пустыми — подсветка их просто пропускает
  const cards = [];

  // ---------- таблица ----------
  let rows = [];
  function renderTable() {
    const tb = $("#tbody"); tb.innerHTML = ""; rows = [];
    DATA.forEach((d) => {
      const tr = document.createElement("tr");
      tr.dataset.i = d.i;
      if (state.dropOut && d.i === OUT) tr.className = "dim";
      const sgn = d.e > 0 ? "pos" : d.e < 0 ? "neg" : "zero";
      const eTxt = d.e > 0 ? "+" + d.e : d.e === 0 ? "0 🎯" : String(d.e);
      tr.innerHTML =
        `<td class="obj">🍉 №${d.i + 1}</td><td>${d.g}</td><td>${d.y}</td>` +
        `<td class="${sgn}">${eTxt}</td><td class="mae">${d.ae}</td><td class="mse">${d.se}</td>`;
      tr.addEventListener("mouseenter", () => setHover(d.i));
      tr.addEventListener("mouseleave", () => setHover(-1));
      tr.addEventListener("click", () => setPin(d.i));
      tb.appendChild(tr); rows[d.i] = tr;
    });
    const m = metrics();
    const sum = document.createElement("tr"); sum.className = "sum";
    sum.innerHTML = `<td class="obj">Σ сумма (÷${m.n})</td><td></td><td></td><td></td>` +
      `<td class="mae">${m.sae}</td><td class="mse">${m.sse}</td>`;
    tb.appendChild(sum);
  }

  // ---------- сборка метрик ----------
  let maeTerms = [], mseTerms = [];
  function terms(field, color) {
    return active().map((d) =>
      `<span class="term" data-i="${d.i}" style="color:${color}">${d[field]}</span>`).join(" + ");
  }
  function renderMetrics() {
    const m = metrics();
    const big = active().reduce((a, d) => (d.ae > a.ae ? d : a), active()[0]); // крупнейший по |e|
    const frac = (a, b) => `<span class="frac"><span class="num">${a}</span><span class="den">${b}</span></span>`;
    const sqrtm = (inner) => `<span class="sqrtm"><span class="sgn">√</span><span class="rad">${inner}</span></span>`;
    const SUM = `<span class="sumop">Σ<sup>n</sup><sub>i=1</sub></span>`;
    const yi = `<i>y<sub>i</sub></i>`, yhi = `<i>ŷ<sub>i</sub></i>`, oneN = frac("1", "<i>n</i>");
    const A = approx(m.mae), S = approx(m.mse), R = approx(m.rmse);
    $("#metrics").innerHTML =
      `<div class="mrow"><div class="mhead"><span class="mname mae-c">MAE</span>
        <span class="mdesc">средняя абсолютная ошибка — типичный промах в килограммах</span></div>
        <div class="mline math"><span class="mlabel mae-c">MAE</span> = ${oneN} ${SUM} |${yi} − ${yhi}|
          = ${frac(terms("ae", MAE_C), m.n)} = ${frac(m.sae, m.n)} ${A.eq}
          <span class="res mae-c">${A.s} кг</span></div></div>` +

      `<div class="mrow"><div class="mhead"><span class="mname mse-c">MSE</span>
        <span class="mdesc">средний квадрат ошибки — крупный промах входит в квадрате, единицы кг²</span></div>
        <div class="mline math"><span class="mlabel mse-c">MSE</span> = ${oneN} ${SUM} (${yi} − ${yhi})²
          = ${frac(terms("se", MSE_C), m.n)} = ${frac(m.sse, m.n)} ${S.eq}
          <span class="res mse-c">${S.s} кг²</span></div>
        <div class="mdesc" style="margin-top:6px">Арбуз №${big.i + 1}, ошибка <span class="math"><i>e</i> = ${big.e}</span>: в <span class="math">Σ|<i>e<sub>i</sub></i>|</span> добавляет <b style="color:#10b981">${big.ae}</b>, а в <span class="math">Σ<i>e<sub>i</sub></i>²</span> — уже <b style="color:#4f46e5">${big.se}</b>. Квадрат усиливает крупные ошибки.</div></div>` +

      `<div class="mrow"><div class="mhead"><span class="mname rmse-c">RMSE</span>
        <span class="mdesc">корень из среднего квадрата — снова килограммы, сравнимо с MAE</span></div>
        <div class="mline math"><span class="mlabel rmse-c">RMSE</span> = ${sqrtm(`${oneN} ${SUM} (${yi} − ${yhi})²`)}
          = ${sqrtm(frac(m.sse, m.n))} = ${sqrtm(S.s)} ${R.eq}
          <span class="res rmse-c">${R.s} кг</span></div></div>`;
    maeTerms = []; mseTerms = [];
    $("#metrics").querySelectorAll(".mrow:nth-child(1) .term").forEach((t) => { maeTerms[+t.dataset.i] = t; bindTerm(t); });
    $("#metrics").querySelectorAll(".mrow:nth-child(2) .term").forEach((t) => { mseTerms[+t.dataset.i] = t; bindTerm(t); });
  }
  function bindTerm(t) {
    t.addEventListener("mouseenter", () => setHover(+t.dataset.i));
    t.addEventListener("mouseleave", () => setHover(-1));
    t.addEventListener("click", () => setPin(+t.dataset.i));
  }

  function renderVerdict() {
    const all = metricsOf(DATA), cut = metricsOf(DATA.filter((d) => d.i !== OUT));
    const o = DATA[OUT];
    $("#verdict").innerHTML = state.dropOut
      ? `Убрали грубый промах (№${OUT + 1}) — и <b>RMSE упал с ${fmt(all.rmse)} до ${fmt(cut.rmse)} кг</b>, а <b>MAE едва дрогнул: ${fmt(all.mae)} → ${fmt(cut.mae)} кг</b>. Видишь? Квадрат «помнит» большой промах куда сильнее. Поэтому RMSE/MSE — строгие судьи, а MAE — спокойный.`
      : `В среднем мы мажем на <b>MAE = ${fmt(all.mae)} кг</b>. Но арбуз №${OUT + 1} (мимо на ${o.ae} кг) раздувает квадраты, и <b>RMSE = ${fmt(all.rmse)} кг</b> заметно больше. Поставь галочку «убрать грубый промах» — RMSE резко просядет, а MAE почти нет.`;
  }

  // ---------- подсветка (объект ↔ строка ↔ точка ↔ слагаемое), с закреплением по клику ----------
  function effIndex() { return state.pinned >= 0 ? state.pinned : state.hover; }
  function applyHL(i) {
    if (i !== state.shown) {
      const off = (arr) => { const el = arr[state.shown]; if (el) el.classList.remove("hl"); };
      off(cards); off(rows); off(maeTerms); off(mseTerms);
      state.shown = i;
      const on = (arr) => { const el = arr[i]; if (el) el.classList.add("hl"); };
      if (i >= 0) { on(cards); on(rows); on(maeTerms); on(mseTerms); }
    }
    drawChart(); drawCurves();
  }
  function setHover(i) { state.hover = i; if (state.pinned < 0) applyHL(i); }
  function setPin(i) { state.pinned = (state.pinned === i) ? -1 : (i >= 0 ? i : -1); applyHL(effIndex()); }

  // ---------- график ----------
  const canvas = $("#chart"), ctx = canvas.getContext("2d");
  let W = 0, H = 0;
  function resize() {
    const r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    W = r.width; H = r.height; canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); drawChart();
  }
  const PAD = { l: 40, r: 14, t: 16, b: 38 };
  function plot() { return { x: PAD.l, y: PAD.t, w: W - PAD.l - PAD.r, h: H - PAD.t - PAD.b }; }
  const YMAX = 16;
  function colX(i) { const p = plot(); return p.x + (i + 0.5) / DATA.length * p.w; }
  function pyKg(v) { const p = plot(); return p.y + p.h - v / YMAX * p.h; }
  function pxPerKg() { const p = plot(); return p.h / YMAX; }

  function drawChart() {
    if (!W) return;
    ctx.clearRect(0, 0, W, H);
    const p = plot(), small = DATA.length > 11;
    ctx.font = "11px -apple-system, system-ui, sans-serif"; ctx.fillStyle = "#8a93a3"; ctx.strokeStyle = "rgba(20,23,28,.06)";
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    for (let v = 0; v <= YMAX; v += 4) { const Y = pyKg(v); ctx.beginPath(); ctx.moveTo(p.x, Y); ctx.lineTo(p.x + p.w, Y); ctx.stroke(); ctx.fillText(v + "", p.x - 7, Y); }
    ctx.save(); ctx.translate(12, p.y + p.h / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = "center"; ctx.fillText("вес, кг", 0, 0); ctx.restore();

    const sq = state.view === "squares", hi = effIndex();
    if (sq) { for (const d of DATA) if (d.i !== hi) drawSquare(d, false); if (hi >= 0) drawSquare(DATA[hi], true); }

    const rad = small ? 4 : 5.5;
    for (const d of DATA) {
      const dim = (state.dropOut && d.i === OUT) || (hi >= 0 && hi !== d.i);
      const X = colX(d.i), Yg = pyKg(d.g), Yy = pyKg(d.y);
      ctx.globalAlpha = dim ? 0.28 : 1;
      ctx.strokeStyle = d.e === 0 ? "#10b981" : (d.e > 0 ? GUESS_C : "#f59e0b");
      ctx.lineWidth = d.i === hi ? 4 : 2.5; ctx.beginPath(); ctx.moveTo(X, Yg); ctx.lineTo(X, Yy); ctx.stroke();
      ctx.beginPath(); ctx.arc(X, Yy, rad, 0, 7); ctx.fillStyle = REAL_C; ctx.fill();
      ctx.beginPath(); ctx.arc(X, Yg, rad, 0, 7); ctx.fillStyle = "#fff"; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = GUESS_C; ctx.stroke();
      if (!sq && d.ae > 0 && (!small || d.i === hi)) { ctx.globalAlpha = dim ? 0.3 : 1; ctx.fillStyle = "#475569"; ctx.font = "700 11px -apple-system, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(d.ae + "", X + 11, (Yg + Yy) / 2); }
      // ось X: номер арбуза (всегда) + эмодзи
      ctx.globalAlpha = dim ? 0.45 : 1; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
      ctx.font = (small ? 11 : 14) + "px -apple-system, sans-serif"; ctx.fillText("🍉", X, p.y + p.h + 19);
      ctx.fillStyle = d.i === hi ? "#14171c" : "#8a93a3"; ctx.font = (d.i === hi ? "700 " : "") + "11px -apple-system, sans-serif";
      ctx.fillText(String(d.i + 1), X, p.y + p.h + 33);
      if (d.i === state.pinned) { ctx.globalAlpha = 1; ctx.font = "13px -apple-system, sans-serif"; ctx.textBaseline = "middle"; ctx.fillText("📌", X, p.y + 11); }
    }
    ctx.globalAlpha = 1;
    // легенда
    ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.font = "12px -apple-system, sans-serif";
    let lx = p.x + 6, ly = p.y + 8;
    ctx.beginPath(); ctx.arc(lx + 5, ly, 5, 0, 7); ctx.fillStyle = "#fff"; ctx.fill(); ctx.strokeStyle = GUESS_C; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = "#14171c"; ctx.fillText("прогноз ŷ", lx + 16, ly); lx += 98;
    ctx.beginPath(); ctx.arc(lx + 5, ly, 5, 0, 7); ctx.fillStyle = REAL_C; ctx.fill(); ctx.fillText("факт y", lx + 16, ly);
  }
  function drawSquare(d, hot) {
    if (d.ae === 0) return;
    if (state.dropOut && d.i === OUT) return;
    const p = plot(), X = colX(d.i), side = d.ae * pxPerKg();
    const topY = pyKg(Math.max(d.g, d.y));
    const dir = (X + side > p.x + p.w) ? -1 : 1;
    const x0 = dir > 0 ? X : X - side;
    ctx.fillStyle = hot ? "rgba(79,70,229,.34)" : "rgba(79,70,229,.15)";
    ctx.fillRect(x0, topY, side, side);
    ctx.strokeStyle = hot ? "#4f46e5" : "rgba(79,70,229,.4)"; ctx.lineWidth = hot ? 2 : 1; ctx.strokeRect(x0, topY, side, side);
    if (hot) {
      ctx.strokeStyle = "rgba(79,70,229,.35)"; ctx.lineWidth = 0.6; const u = pxPerKg();
      for (let k = 1; k < d.ae; k++) {
        ctx.beginPath(); ctx.moveTo(x0 + k * u, topY); ctx.lineTo(x0 + k * u, topY + side); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x0, topY + k * u); ctx.lineTo(x0 + side, topY + k * u); ctx.stroke();
      }
      ctx.fillStyle = "#4f46e5"; ctx.font = "700 12px -apple-system, sans-serif"; ctx.textBaseline = "bottom";
      ctx.textAlign = dir > 0 ? "left" : "right";
      ctx.fillText(d.ae + "×" + d.ae + " = " + d.se, dir > 0 ? x0 + 3 : x0 + side - 3, topY - 3);
    }
  }
  function nearest(mx) {
    let best = -1, bd = 1e9; for (const d of DATA) { const dd = Math.abs(mx - colX(d.i)); if (dd < bd) { bd = dd; best = d.i; } }
    return bd < plot().w / DATA.length / 1.4 ? best : -1;
  }
  canvas.style.cursor = "pointer";
  canvas.addEventListener("mousemove", (e) => { const r = canvas.getBoundingClientRect(); setHover(nearest(e.clientX - r.left)); });
  canvas.addEventListener("mouseleave", () => setHover(-1));
  canvas.addEventListener("click", (e) => { const r = canvas.getBoundingClientRect(); setPin(nearest(e.clientX - r.left)); });

  // ---------- кривульки: штраф MAE/MSE/RMSE от размера промаха ----------
  const cCanvas = $("#curves"), cctx = cCanvas ? cCanvas.getContext("2d") : null;
  let CW = 0, CH = 0;
  function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function resizeCurves() {
    if (!cCanvas) return;
    const r = cCanvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    CW = r.width; CH = r.height; cCanvas.width = Math.round(CW * dpr); cCanvas.height = Math.round(CH * dpr);
    cctx.setTransform(dpr, 0, 0, dpr, 0, 0); drawCurves();
  }
  function drawCurves() {
    if (!cctx || !CW) return;
    cctx.clearRect(0, 0, CW, CH);
    const pad = { l: 46, r: 16, t: 16, b: 36 };
    const x0 = pad.l, y0 = pad.t, pw = CW - pad.l - pad.r, ph = CH - pad.t - pad.b;
    const pts = active(), mm = metrics();
    const xmax = Math.max(4, ...pts.map((d) => d.ae)), ymax = xmax * xmax;
    const PX = (x) => x0 + x / xmax * pw, PY = (y) => y0 + ph - Math.min(y, ymax) / ymax * ph;
    // сетка и оси
    cctx.font = "11px -apple-system, system-ui, sans-serif"; cctx.strokeStyle = "rgba(20,23,28,.06)";
    cctx.fillStyle = "#8a93a3"; cctx.textAlign = "right"; cctx.textBaseline = "middle";
    for (let k = 0; k <= 4; k++) { const yy = ymax * k / 4, Y = PY(yy); cctx.beginPath(); cctx.moveTo(x0, Y); cctx.lineTo(x0 + pw, Y); cctx.stroke(); cctx.fillText(Math.round(yy) + "", x0 - 7, Y); }
    cctx.textAlign = "center"; cctx.textBaseline = "alphabetic";
    for (let k = 0; k <= xmax; k++) cctx.fillText(k + "", PX(k), y0 + ph + 16);
    cctx.fillText("ошибка |e|, кг", x0 + pw / 2, y0 + ph + 30);
    cctx.save(); cctx.translate(13, y0 + ph / 2); cctx.rotate(-Math.PI / 2); cctx.textAlign = "center"; cctx.fillText("штраф", 0, 0); cctx.restore();
    // функции потерь L(e)=|e| и L(e)=e²
    const curve = (fn, color) => { cctx.strokeStyle = color; cctx.lineWidth = 2.6; cctx.beginPath(); for (let s = 0; s <= 120; s++) { const x = xmax * s / 120, X = PX(x), Y = PY(fn(x)); s ? cctx.lineTo(X, Y) : cctx.moveTo(X, Y); } cctx.stroke(); };
    curve((x) => x * x, "#4f46e5");
    curve((x) => x, "#10b981");
    // средние = метрики (горизонтальный пунктир)
    const hline = (yv, color, label) => {
      const Y = PY(yv); cctx.strokeStyle = color; cctx.lineWidth = 1.5; cctx.setLineDash([5, 4]);
      cctx.beginPath(); cctx.moveTo(x0, Y); cctx.lineTo(x0 + pw, Y); cctx.stroke(); cctx.setLineDash([]);
      cctx.fillStyle = color; cctx.font = "700 11px -apple-system, sans-serif"; cctx.textAlign = "right"; cctx.textBaseline = "bottom"; cctx.fillText(label, x0 + pw - 3, Y - 2);
    };
    const aM = approx(mm.mse), aA = approx(mm.mae), aR = approx(mm.rmse);
    hline(mm.mse, "#4f46e5", "MSE " + aM.eq + " " + aM.s);
    hline(mm.mae, "#10b981", "MAE " + aA.eq + " " + aA.s);
    // RMSE = √MSE: пересечение линии MSE с параболой → проекция на ось e
    const rmse = Math.sqrt(mm.mse), Xr = PX(rmse), Yr = PY(mm.mse);
    cctx.strokeStyle = "#8b5cf6"; cctx.lineWidth = 1.6; cctx.setLineDash([4, 4]);
    cctx.beginPath(); cctx.moveTo(Xr, Yr); cctx.lineTo(Xr, y0 + ph); cctx.stroke(); cctx.setLineDash([]);
    cctx.beginPath(); cctx.arc(Xr, Yr, 4.5, 0, 7); cctx.fillStyle = "#8b5cf6"; cctx.fill(); cctx.strokeStyle = "#fff"; cctx.lineWidth = 2; cctx.stroke();
    cctx.fillStyle = "#8b5cf6"; cctx.font = "700 11px -apple-system, sans-serif"; cctx.textAlign = "center"; cctx.textBaseline = "top"; cctx.fillText("RMSE " + aR.eq + " " + aR.s, Xr, y0 + ph - 15);
    // наши арбузы как точки на кривых
    const hi = effIndex();
    for (const d of pts) {
      if (d.ae === 0) continue;
      const X = PX(d.ae), hot = d.i === hi;
      cctx.globalAlpha = hot ? 1 : 0.6;
      cctx.beginPath(); cctx.arc(X, PY(d.se), hot ? 6 : 4, 0, 7); cctx.fillStyle = "#4f46e5"; cctx.fill();
      cctx.beginPath(); cctx.arc(X, PY(d.ae), hot ? 6 : 4, 0, 7); cctx.fillStyle = "#10b981"; cctx.fill();
      cctx.globalAlpha = 1;
      if (hot) {
        cctx.strokeStyle = "rgba(20,23,28,.3)"; cctx.setLineDash([4, 4]); cctx.beginPath(); cctx.moveTo(X, y0); cctx.lineTo(X, y0 + ph); cctx.stroke(); cctx.setLineDash([]);
        [["#4f46e5", d.se], ["#10b981", d.ae]].forEach(([c, v]) => { cctx.beginPath(); cctx.arc(X, PY(v), 6, 0, 7); cctx.fillStyle = c; cctx.fill(); cctx.strokeStyle = "#fff"; cctx.lineWidth = 2; cctx.stroke(); });
        const txt = "арбуз №" + (d.i + 1) + ": |e| = " + d.ae + ",  e² = " + d.se;
        cctx.font = "700 11px -apple-system, sans-serif"; const tw = cctx.measureText(txt).width + 16;
        let tx = X + 10; if (tx + tw > CW - 4) tx = X - tw - 10;
        cctx.fillStyle = "rgba(20,23,28,.9)"; roundRect(cctx, tx, y0 + 4, tw, 22, 7); cctx.fill();
        cctx.fillStyle = "#fff"; cctx.textAlign = "left"; cctx.textBaseline = "middle"; cctx.fillText(txt, tx + 8, y0 + 15);
      }
    }
    // легенда
    cctx.textAlign = "left"; cctx.textBaseline = "middle"; cctx.font = "12px -apple-system, sans-serif";
    let lx = x0 + 8; const ly = y0 + 11;
    const leg = (c, t) => { cctx.fillStyle = c; cctx.beginPath(); cctx.arc(lx + 5, ly, 5, 0, 7); cctx.fill(); cctx.fillStyle = "#14171c"; cctx.fillText(t, lx + 14, ly); lx += 14 + cctx.measureText(t).width + 16; };
    leg("#10b981", "|e| → MAE"); leg("#4f46e5", "e² → MSE");
  }

  // ---------- управление ----------
  function renderAll() { renderTable(); renderMetrics(); renderVerdict(); drawChart(); drawCurves(); }
  function rebuild() { generate(); state.hover = -1; state.pinned = -1; state.shown = -1; renderAll(); }

  $("#viewSeg").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    $("#viewSeg").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
    state.view = b.dataset.view; drawChart();
  }));
  $("#dropOut").addEventListener("change", (e) => {
    state.dropOut = e.target.checked; renderTable(); renderMetrics(); renderVerdict(); drawChart(); drawCurves();
  });
  $("#count").addEventListener("input", (e) => {
    state.n = +e.target.value; $("#countVal").textContent = e.target.value;
    state.dropOut = false; $("#dropOut").checked = false; rebuild();
  });
  $("#newData").addEventListener("click", () => {
    state.seed = (state.seed * 1103515245 + 12345) >>> 0;
    state.dropOut = false; $("#dropOut").checked = false; rebuild();
  });
  window.addEventListener("resize", () => { resize(); resizeCurves(); });

  // ---------- старт ----------
  generate(); renderTable(); renderMetrics(); renderVerdict(); resize(); resizeCurves();
})();
