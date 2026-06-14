/* «Насколько мы промахнулись? MAE / MSE / RMSE» — детски-понятная страница.
   Для каждой квартиры модель даёт прогноз цены (ŷ), факт сделки — (y), промах
   e=y−ŷ превращаем в ошибку и собираем в метрику. Объект ↔ строка ↔ точка ↔
   слагаемое связаны подсветкой при наведении. Чистый vanilla JS, без зависимостей. */
(function () {
  "use strict";

  const MAE_C = "#10b981", MSE_C = "#4f46e5", RMSE_C = "#8b5cf6";
  const GUESS_C = "#0ea5e9", REAL_C = "#334155";
  const $ = (s) => document.querySelector(s);

  const state = { n: 8, seed: 7, quality: 0.4, view: "bars", dropOut: false, hover: -1, pinned: -1, shown: -1 };
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
  // генерируем n квартир: факт y (стоимость, млн ₽), прогноз g; ошибки крупные и без нулей, у одной — грубый промах
  function generate() {
    const rng = mulberry32(state.seed), n = state.n;
    DATA = []; OUT = Math.floor(rng() * n);
    const q = state.quality;                                      // 0 — хорошая модель, 1 — плохая
    const baseNormal = 1 + q * 7, baseOut = 3 + q * 14;           // масштаб обычной ошибки и выброса
    for (let i = 0; i < n; i++) {
      const y = 8 + Math.floor(rng() * 12);                       // факт 8..19 млн ₽
      const base = (i === OUT) ? baseOut : baseNormal;
      const mag = Math.max(1, Math.round(base * (0.6 + rng() * 0.8))); // крупнее при плохой модели, без нуля
      let g = (rng() < 0.5) ? y - mag : y + mag;                  // направление промаха — случайно
      if (g < 1) g = y + mag;                                     // прогноз держим ≥ 1
      const e = y - g;
      DATA.push({ i, g, y, e, ae: Math.abs(e), se: e * e });
    }
    YMAX = Math.max(16, Math.ceil(Math.max(...DATA.flatMap((d) => [d.y, d.g])) / 4) * 4);
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
        `<td class="obj">🏠 №${d.i + 1}</td><td>${d.g}</td><td>${d.y}</td>` +
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

  // ---------- сборка метрик (KaTeX) ----------
  let termEls = [];                       // индекс квартиры -> [DOM-элементы слагаемых]
  const KT = (tex) => (window.katex ? katex.renderToString("\\displaystyle " + tex, { throwOnError: false, trust: true, strict: false }) : tex);
  const tmpl = (rows) => `<div class="mtemplate">${rows.map(([l, t]) => `<div><span class="tag">${l}</span> ${t}</div>`).join("")}</div>`;
  function renderMetrics() {
    const m = metrics();
    const big = active().reduce((a, d) => (d.ae > a.ae ? d : a), active()[0]); // крупнейший по |e|
    const A = approx(m.mae), S = approx(m.mse), R = approx(m.rmse);
    const eqA = A.eq === "=" ? "=" : "\\approx", eqS = S.eq === "=" ? "=" : "\\approx";
    const sumAE = active().map((d) => `\\htmlClass{term term-${d.i} kmae}{${d.ae}}`).join("+");
    const sumSE = active().map((d) => `\\htmlClass{term term-${d.i} kmse}{${d.se}}`).join("+");
    const maeTex = `\\mathrm{MAE}=\\frac1n\\sum_{i=1}^{n}\\lvert y_i-\\hat y_i\\rvert=\\frac{${sumAE}}{${m.n}}=\\frac{${m.sae}}{${m.n}} ${eqA} \\htmlClass{kres kmae}{${A.s}}`;
    const mseTex = `\\mathrm{MSE}=\\frac1n\\sum_{i=1}^{n}(y_i-\\hat y_i)^2=\\frac{${sumSE}}{${m.n}}=\\frac{${m.sse}}{${m.n}} ${eqS} \\htmlClass{kres kmse}{${S.s}}`;
    const rmseTex = `\\mathrm{RMSE}=\\sqrt{\\frac1n\\sum_{i=1}^{n}(y_i-\\hat y_i)^2}=\\sqrt{\\dfrac{${sumSE}}{${m.n}}}=\\sqrt{\\dfrac{${m.sse}}{${m.n}}}\\approx \\htmlClass{kres krmse}{${R.s}}`;
    $("#metrics").innerHTML =
      `<div class="mrow"><div class="mhead"><span class="mname mae-c">MAE</span><span class="mq">средняя абсолютная ошибка · Mean Absolute Error</span></div>` +
        `<div class="metric-eq">${KT(maeTex)}<span class="unit mae-c">млн ₽</span></div>` +
        tmpl([["Отвечает на вопрос:", "на сколько миллионов рублей модель в среднем промахивается в цене."]]) + `</div>` +

      `<div class="mrow"><div class="mhead"><span class="mname mse-c">MSE</span><span class="mq">средний квадрат ошибки · Mean Squared Error</span></div>` +
        `<div class="metric-eq">${KT(mseTex)}<span class="unit mse-c">(млн ₽)²</span></div>` +
        `<div class="mnote">Квартира №${big.i + 1} с ошибкой <i>e</i> = ${big.e}: в сумму |e| даёт <b style="color:#10b981">${big.ae}</b>, а в сумму e² — уже <b style="color:#4f46e5">${big.se}</b>; квадрат усиливает крупные промахи.</div>` +
        tmpl([["Отвечает на вопрос:", "насколько велики ошибки, если крупные штрафовать особенно сильно (в квадрате)."]]) + `</div>` +

      `<div class="mrow"><div class="mhead"><span class="mname rmse-c">RMSE</span><span class="mq">корень из среднего квадрата · Root Mean Squared Error</span></div>` +
        `<div class="metric-eq">${KT(rmseTex)}<span class="unit rmse-c">млн ₽</span></div>` +
        tmpl([["Отвечает на вопрос:", "какова типичная ошибка в млн ₽, но с повышенным штрафом за крупные промахи."]]) + `</div>`;
    termEls = [];
    active().forEach((d) => {
      const els = [...$("#metrics").querySelectorAll(`.term-${d.i}`)];
      termEls[d.i] = els;
      els.forEach((el) => {
        el.addEventListener("mouseenter", () => setHover(d.i));
        el.addEventListener("mouseleave", () => setHover(-1));
        el.addEventListener("click", () => setPin(d.i));
      });
    });
  }
  // ---------- ховер-ридаут под графиком потерь: e = y − ŷ, MSE, MAE, RMSE разом ----------
  const KTS = (tex) => (window.katex ? katex.renderToString(tex, { throwOnError: false, strict: false }) : tex);
  function renderReadout(i) {
    const ro = $("#readout"); if (!ro) return;
    const m = metrics(), A = approx(m.mae), S = approx(m.mse), R = approx(m.rmse);
    const d = (i >= 0 && DATA[i] && !(state.dropOut && i === OUT)) ? DATA[i] : null;
    const eCell = d
      ? `<div class="rcell re"><span class="obj-tag">🏠 №${d.i + 1}</span>${KTS(`e = y - \\hat y = ${d.y} - ${d.g} = ${d.e}`)}</div>`
      : `<div class="rcell re">${KTS("e = y - \\hat y")}</div>`;
    ro.innerHTML =
      eCell +
      `<div class="rcell rmae">${KTS(`\\mathrm{MAE} ${A.eq === "=" ? "=" : "\\approx"} \\textcolor{#10b981}{${A.s}}`)}</div>` +
      `<div class="rcell rmse">${KTS(`\\mathrm{MSE} ${S.eq === "=" ? "=" : "\\approx"} \\textcolor{#4f46e5}{${S.s}}`)}</div>` +
      `<div class="rcell rrmse">${KTS(`\\mathrm{RMSE} \\approx \\textcolor{#8b5cf6}{${R.s}}`)}</div>`;
  }
  function renderVerdict() {
    const all = metricsOf(DATA), cut = metricsOf(DATA.filter((d) => d.i !== OUT));
    const o = DATA[OUT];
    $("#verdict").innerHTML = state.dropOut
      ? `Убрали грубый промах (квартира №${OUT + 1}) — и <b>RMSE упал с ${fmt(all.rmse)} до ${fmt(cut.rmse)} млн ₽</b>, а <b>MAE едва дрогнул: ${fmt(all.mae)} → ${fmt(cut.mae)} млн ₽</b>. Квадрат «помнит» большой промах куда сильнее: RMSE/MSE — строгие судьи, а MAE — спокойный.`
      : `В среднем модель ошибается в цене на <b>MAE = ${fmt(all.mae)} млн ₽</b>. Но квартира №${OUT + 1} (промах ${o.ae} млн ₽) раздувает квадраты, и <b>RMSE = ${fmt(all.rmse)} млн ₽</b> заметно больше. Поставь галочку «убрать грубый промах» — RMSE резко просядет, а MAE почти нет.`;
  }

  // ---------- подсветка (объект ↔ строка ↔ точка ↔ слагаемое), с закреплением по клику ----------
  function effIndex() { return state.pinned >= 0 ? state.pinned : state.hover; }
  function applyHL(i) {
    if (i !== state.shown) {
      const tog = (idx, add) => {
        if (idx < 0) return;
        if (cards[idx]) cards[idx].classList.toggle("hl", add);
        if (rows[idx]) rows[idx].classList.toggle("hl", add);
        (termEls[idx] || []).forEach((e) => e.classList.toggle("hl", add));
      };
      tog(state.shown, false);
      state.shown = i;
      tog(i, true);
    }
    renderReadout(i); drawChart(); drawCurves();
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
  let YMAX = 16;
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
    ctx.save(); ctx.translate(12, p.y + p.h / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = "center"; ctx.fillText("стоимость, млн ₽", 0, 0); ctx.restore();

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
      // ось X: номер квартиры (всегда) + эмодзи
      ctx.globalAlpha = dim ? 0.45 : 1; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
      ctx.font = (small ? 11 : 14) + "px -apple-system, sans-serif"; ctx.fillText("🏠", X, p.y + p.h + 19);
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
  let CW = 0, CH = 0, curveGeom = null;
  function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  // «красивый» шаг сетки (1, 2, 5 × 10ⁿ) — оси остаются читаемыми при любом зуме
  function niceStep(raw) { if (!(raw > 0)) return 1; const p = Math.pow(10, Math.floor(Math.log10(raw))); const f = raw / p; const n = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10; return n * p; }
  function fmtAxis(v) { const a = Math.abs(v); if (a < 1e-9) return "0"; return (a < 10 && Math.abs(v - Math.round(v)) > 1e-9) ? String(Math.round(v * 10) / 10) : String(Math.round(v)); }
  // аккуратная типографика подписей кривых на canvas: |e| с прямыми модульными чертами и наклонным e
  function absELabel(c, x, y, color) {
    c.fillStyle = color; c.textBaseline = "middle"; c.textAlign = "left";
    c.font = "600 15px Georgia, 'Times New Roman', serif"; c.fillText("|", x, y); const w1 = c.measureText("|").width;
    c.font = "italic 600 15px Georgia, 'Times New Roman', serif"; c.fillText("e", x + w1, y); const w2 = c.measureText("e").width;
    c.font = "600 15px Georgia, 'Times New Roman', serif"; c.fillText("|", x + w1 + w2, y);
  }
  // e² с настоящим приподнятым показателем (а не «e2»)
  function eSqLabel(c, x, y, color) {
    c.fillStyle = color; c.textBaseline = "middle"; c.textAlign = "left";
    c.font = "italic 600 15px Georgia, 'Times New Roman', serif"; c.fillText("e", x, y); const w = c.measureText("e").width;
    c.font = "600 10px Georgia, 'Times New Roman', serif"; c.fillText("2", x + w + 1, y - 6);
  }
  function resizeCurves() {
    if (!cCanvas) return;
    const r = cCanvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    CW = r.width; CH = r.height; cCanvas.width = Math.round(CW * dpr); cCanvas.height = Math.round(CH * dpr);
    cctx.setTransform(dpr, 0, 0, dpr, 0, 0); drawCurves();
  }
  let hoverE = null, hoverPx = null;                      // ховер: ошибка под курсором и его пиксель
  // Три кривые-метрики: двигаем ошибку e ОДНОГО объекта (самого крупного промаха),
  // остальные объекты фиксированы (фон). Кривые — как от этого меняются метрики:
  //   MAE(e) = (Σ|e| фон + |e|)/n   — линейная (галочка),
  //   MSE(e) = (Σe² фон + e²)/n      — парабола, растёт быстрее → «наказывает сильнее»,
  //   RMSE(e) = √MSE(e)              — корень, возвращает в млн ₽ (рядом с MAE).
  // В точке e = (реальная ошибка объекта) кривые проходят через настоящие MAE/MSE/RMSE.
  function curveFns() {
    const arr = active(), n = Math.max(1, arr.length);
    let movI = 0; for (let i = 1; i < arr.length; i++) if (Math.abs(arr[i].e) > Math.abs(arr[movI].e)) movI = i;
    const eMov = arr.length ? arr[movI].e : 0;
    let Kae = 0, Kse = 0; arr.forEach((d, i) => { if (i !== movI) { Kae += d.ae; Kse += d.se; } });
    const MAEf = (e) => (Kae + Math.abs(e)) / n, MSEf = (e) => (Kse + e * e) / n, RMSEf = (e) => Math.sqrt(MSEf(e));
    return { eMov, MAEf, MSEf, RMSEf };
  }
  function drawCurves() {
    if (!cctx || !CW) return;
    cctx.clearRect(0, 0, CW, CH);
    const pad = { l: 52, r: 18, t: 18, b: 40 };
    const x0 = pad.l, y0 = pad.t, pw = CW - pad.l - pad.r, ph = CH - pad.t - pad.b;
    const { eMov, MAEf, MSEf, RMSEf } = curveFns();
    const E = Math.max(6, Math.abs(eMov) * 1.18);          // ось ошибок: показываем и реальный промах, и запас
    const ymax = MSEf(E) * 1.08;                           // ось значений: помещаем самую высокую (MSE)
    const PX = (e) => x0 + (e + E) / (2 * E) * pw;
    const PY = (v) => y0 + ph - Math.min(Math.max(v, 0), ymax) / ymax * ph;
    const toE = (px) => (px - x0) / pw * 2 * E - E;
    curveGeom = { E, toE };
    // сетка/оси
    const ystep = niceStep(ymax / 4);
    cctx.font = "11px -apple-system, system-ui, sans-serif"; cctx.fillStyle = "#8a93a3"; cctx.textAlign = "right"; cctx.textBaseline = "middle";
    for (let v = 0; v <= ymax + 1e-6; v += ystep) { const Y = PY(v); cctx.strokeStyle = "rgba(20,23,28,.06)"; cctx.beginPath(); cctx.moveTo(x0, Y); cctx.lineTo(x0 + pw, Y); cctx.stroke(); cctx.fillText(fmtAxis(v), x0 - 7, Y); }
    const xstep = niceStep(2 * E / 10);
    cctx.textAlign = "center"; cctx.textBaseline = "alphabetic";
    for (let e = Math.ceil(-E / xstep) * xstep; e <= E + 1e-6; e += xstep) { const X = PX(e); const zero = Math.abs(e) < 1e-9; cctx.strokeStyle = zero ? "rgba(20,23,28,.18)" : "rgba(20,23,28,.05)"; cctx.beginPath(); cctx.moveTo(X, y0); cctx.lineTo(X, y0 + ph); cctx.stroke(); cctx.fillStyle = "#8a93a3"; cctx.fillText((e > 1e-9 ? "+" : "") + fmtAxis(e), X, y0 + ph + 16); }
    cctx.fillText("ошибка одного объекта  e,  млн ₽", x0 + pw / 2, y0 + ph + 31);
    cctx.save(); cctx.translate(14, y0 + ph / 2); cctx.rotate(-Math.PI / 2); cctx.textAlign = "center"; cctx.fillText("значение метрики", 0, 0); cctx.restore();
    // кривые
    const curve = (fn, color) => { cctx.strokeStyle = color; cctx.lineWidth = 2.8; cctx.beginPath(); for (let s = 0; s <= 240; s++) { const e = -E + 2 * E * s / 240, X = PX(e), Y = PY(fn(e)); s ? cctx.lineTo(X, Y) : cctx.moveTo(X, Y); } cctx.stroke(); };
    curve(MSEf, "#4f46e5"); curve(RMSEf, "#8b5cf6"); curve(MAEf, "#10b981");
    // подписи кривых у правого края
    cctx.font = "800 12.5px -apple-system, sans-serif"; cctx.textAlign = "right";
    cctx.fillStyle = "#4f46e5"; cctx.textBaseline = "bottom"; cctx.fillText("MSE (млн ₽)²", x0 + pw - 5, PY(MSEf(E)) - 5);
    cctx.fillStyle = "#8b5cf6"; cctx.textBaseline = "bottom"; cctx.fillText("RMSE млн ₽", x0 + pw - 5, PY(RMSEf(E)) - 5);
    cctx.fillStyle = "#10b981"; cctx.textBaseline = "top"; cctx.fillText("MAE млн ₽", x0 + pw - 5, PY(MAEf(E)) + 5);
    // ── ховер: вертикаль + точки на трёх кривых + ПАНЕЛЬ С ТРЕМЯ МЕТРИКАМИ (меняются с e) ──
    if (hoverE != null) {
      const e = Math.max(-E, Math.min(E, hoverE)), X = PX(e);
      const vMAE = MAEf(e), vMSE = MSEf(e), vRMSE = RMSEf(e);
      cctx.strokeStyle = "rgba(20,23,28,.38)"; cctx.lineWidth = 1.2; cctx.setLineDash([4, 4]);
      cctx.beginPath(); cctx.moveTo(X, y0); cctx.lineTo(X, y0 + ph); cctx.stroke(); cctx.setLineDash([]);
      const dot = (v, c) => {
        if (v > ymax) { cctx.fillStyle = c; cctx.beginPath(); cctx.moveTo(X, y0 + 3); cctx.lineTo(X - 5, y0 + 12); cctx.lineTo(X + 5, y0 + 12); cctx.closePath(); cctx.fill(); return; }
        cctx.beginPath(); cctx.arc(X, PY(v), 5.5, 0, 7); cctx.fillStyle = c; cctx.fill(); cctx.strokeStyle = "#fff"; cctx.lineWidth = 2; cctx.stroke();
      };
      dot(vMSE, "#4f46e5"); dot(vRMSE, "#8b5cf6"); dot(vMAE, "#10b981");
      const r2 = (x) => Math.round(x * 100) / 100;
      const head = "ошибка объекта  e = " + (e > 0 ? "+" : "") + (Math.round(e * 10) / 10) + " млн ₽";
      const rows = [["#34d399", "MAE = " + r2(vMAE) + " млн ₽"], ["#818cf8", "MSE = " + r2(vMSE) + " (млн ₽)²"], ["#c4b5fd", "RMSE = " + r2(vRMSE) + " млн ₽"]];
      cctx.font = "600 11px -apple-system, sans-serif"; let tw = cctx.measureText(head).width;
      cctx.font = "800 13px -apple-system, sans-serif"; rows.forEach((rw) => tw = Math.max(tw, cctx.measureText(rw[1]).width));
      tw += 24; const th = 96;
      let tx = X + 16; if (tx + tw > CW - 4) tx = X - tw - 16; if (tx < 4) tx = 4;
      let ty = (hoverPx ? hoverPx.y - th / 2 : y0 + 8); if (ty < y0 + 4) ty = y0 + 4; if (ty + th > y0 + ph) ty = y0 + ph - th - 2;
      cctx.fillStyle = "rgba(20,23,28,.95)"; roundRect(cctx, tx, ty, tw, th, 10); cctx.fill();
      cctx.textAlign = "left"; cctx.textBaseline = "top";
      cctx.font = "600 11px -apple-system, sans-serif"; cctx.fillStyle = "#cbd5e1"; cctx.fillText(head, tx + 12, ty + 10);
      cctx.strokeStyle = "rgba(255,255,255,.14)"; cctx.lineWidth = 1; cctx.beginPath(); cctx.moveTo(tx + 12, ty + 29); cctx.lineTo(tx + tw - 12, ty + 29); cctx.stroke();
      cctx.font = "800 13px -apple-system, sans-serif";
      rows.forEach((rw, k) => { cctx.fillStyle = rw[0]; cctx.fillText(rw[1], tx + 12, ty + 37 + k * 19); });
    }
  }
  if (cCanvas) {
    cCanvas.style.cursor = "crosshair";
    cCanvas.addEventListener("mousemove", (ev) => {
      const r = cCanvas.getBoundingClientRect();
      hoverPx = { x: ev.clientX - r.left, y: ev.clientY - r.top };
      hoverE = curveGeom ? curveGeom.toE(hoverPx.x) : null;
      drawCurves();
    });
    cCanvas.addEventListener("mouseleave", () => { hoverE = null; hoverPx = null; drawCurves(); });
  }

  // ---------- управление ----------
  function renderAll() { renderTable(); renderMetrics(); renderVerdict(); renderReadout(effIndex()); drawChart(); drawCurves(); }
  function rebuild() { generate(); state.hover = -1; state.pinned = -1; state.shown = -1; renderAll(); }

  $("#viewSeg").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    $("#viewSeg").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
    state.view = b.dataset.view; drawChart();
  }));
  $("#dropOut").addEventListener("change", (e) => {
    state.dropOut = e.target.checked; renderTable(); renderMetrics(); renderVerdict(); renderReadout(effIndex()); drawChart(); drawCurves();
  });
  $("#count").addEventListener("input", (e) => {
    state.n = +e.target.value; $("#countVal").textContent = e.target.value;
    state.dropOut = false; $("#dropOut").checked = false; rebuild();
  });
  $("#newData").addEventListener("click", () => {
    state.seed = (state.seed * 1103515245 + 12345) >>> 0;
    state.dropOut = false; $("#dropOut").checked = false; rebuild();
  });
  function qualityWord(g) { return g < 0.34 ? "слабая" : g < 0.67 ? "средняя" : "сильная"; } // g = «доброта» = 1−q
  $("#quality").addEventListener("input", (e) => {
    const g = +e.target.value / 100;            // вправо = лучше модель
    state.quality = 1 - g;
    $("#qualityVal").textContent = qualityWord(g);
    state.dropOut = false; $("#dropOut").checked = false; rebuild();
  });
  window.addEventListener("resize", () => { resize(); resizeCurves(); });

  // ---------- старт ----------
  generate(); renderTable(); renderMetrics(); renderVerdict(); renderReadout(-1); resize(); resizeCurves();
})();
