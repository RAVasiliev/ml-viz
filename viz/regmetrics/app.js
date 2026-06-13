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

  // ---------- грядка ----------
  let cards = [];
  function renderShelf() {
    const shelf = $("#shelf"); shelf.innerHTML = ""; cards = [];
    DATA.forEach((d) => {
      const el = document.createElement("div");
      el.className = "melon" + (state.dropOut && d.i === OUT ? " dim" : "");
      el.dataset.i = d.i;
      const badge = d.e === 0 ? "🎯 точно" : (d.e > 0 ? "+" : "−") + d.ae + " кг";
      const badgeBg = d.e === 0 ? "#dcfce7" : d.e > 0 ? "#e0f2fe" : "#fef3c7";
      const badgeCol = d.e === 0 ? "#15803d" : d.e > 0 ? "#0369a1" : "#b45309";
      el.innerHTML =
        `<div class="miss" style="background:${badgeBg};color:${badgeCol}">${badge}</div>` +
        `<div class="emoji">🍉</div><div class="num">№${d.i + 1}</div>` +
        `<div class="guess">угадал ${d.g}</div><div class="real">весы ${d.y}</div>`;
      el.addEventListener("mouseenter", () => setHover(d.i));
      el.addEventListener("mouseleave", () => setHover(-1));
      el.addEventListener("click", () => setPin(d.i));
      shelf.appendChild(el); cards[d.i] = el;
    });
  }

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
    const big = active().reduce((a, d) => (d.ae > a.ae ? d : a), active()[0]); // крупнейший промах
    $("#metrics").innerHTML =
      `<div class="mrow"><div class="mhead"><span class="mname mae-c">MAE</span>
        <span class="mdesc">средняя длина промаха — на сколько килограммов ошибаемся в среднем</span></div>
        <div class="sum">|e|:&nbsp; ${terms("ae", MAE_C)} = <b>${m.sae}</b> &nbsp;÷&nbsp;${m.n} =
        <span class="res mae-c">${fmt(m.mae)} кг</span></div></div>` +

      `<div class="mrow"><div class="mhead"><span class="mname mse-c">MSE</span>
        <span class="mdesc">средняя площадь квадрата — крупный промах раздувается (в кг²)</span></div>
        <div class="sum">e²:&nbsp; ${terms("se", MSE_C)} = <b>${m.sse}</b> &nbsp;÷&nbsp;${m.n} =
        <span class="res mse-c">${fmt(m.mse)} кг²</span></div>
        <div class="mdesc" style="margin-top:7px">⚖️ промах <b>${big.ae} кг</b> (арбуз №${big.i + 1}): в MAE весит <b style="color:#10b981">${big.ae}</b>, а в MSE — <b style="color:#4f46e5">${big.se}</b> (${big.ae} в квадрате). Вот почему MSE так боится больших промахов.</div></div>` +

      `<div class="mrow"><div class="mhead"><span class="mname rmse-c">RMSE</span>
        <span class="mdesc">длинный корень над всей суммой квадратов ÷ n — возвращает килограммы</span></div>
        <div class="sum" style="line-height:2.5">RMSE =
          <span class="sqrt rmse-c"><span class="sign">√</span><span class="rad"><span style="color:#4f46e5">${active().map((d) => d.se).join(" + ")}</span><span style="color:#64748b">&nbsp;÷&nbsp;${m.n}</span></span></span>
          = √${fmt(m.mse)} = <span class="res rmse-c">${fmt(m.rmse)} кг</span></div>
        <div class="mdesc" style="margin-top:7px">— как MAE, но квадраты под корнем «помнят» крупный промах, поэтому RMSE строже.</div></div>`;
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
    ctx.fillStyle = "#14171c"; ctx.fillText("угадал ŷ", lx + 16, ly); lx += 90;
    ctx.beginPath(); ctx.arc(lx + 5, ly, 5, 0, 7); ctx.fillStyle = REAL_C; ctx.fill(); ctx.fillText("весы y", lx + 16, ly);
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
    const pad = { l: 44, r: 14, t: 14, b: 34 };
    const x0 = pad.l, y0 = pad.t, pw = CW - pad.l - pad.r, ph = CH - pad.t - pad.b;
    const xmax = Math.max(4, ...DATA.map((d) => d.ae)), ymax = xmax * xmax;
    const PX = (x) => x0 + x / xmax * pw, PY = (y) => y0 + ph - y / ymax * ph;
    cctx.font = "11px -apple-system, system-ui, sans-serif"; cctx.strokeStyle = "rgba(20,23,28,.06)";
    cctx.fillStyle = "#8a93a3"; cctx.textAlign = "right"; cctx.textBaseline = "middle";
    for (let k = 0; k <= 4; k++) { const yy = ymax * k / 4, Y = PY(yy); cctx.beginPath(); cctx.moveTo(x0, Y); cctx.lineTo(x0 + pw, Y); cctx.stroke(); cctx.fillText(Math.round(yy) + "", x0 - 7, Y); }
    cctx.textAlign = "center"; cctx.textBaseline = "alphabetic";
    for (let k = 0; k <= xmax; k++) cctx.fillText(k + "", PX(k), y0 + ph + 16);
    cctx.fillText("размер промаха |e|, кг", x0 + pw / 2, y0 + ph + 30);
    cctx.save(); cctx.translate(13, y0 + ph / 2); cctx.rotate(-Math.PI / 2); cctx.textAlign = "center"; cctx.fillText("штраф", 0, 0); cctx.restore();
    const line = (fn, color, dash) => { cctx.strokeStyle = color; cctx.lineWidth = 2.6; cctx.setLineDash(dash || []); cctx.beginPath(); for (let s = 0; s <= 120; s++) { const x = xmax * s / 120, X = PX(x), Y = PY(Math.min(ymax, fn(x))); s ? cctx.lineTo(X, Y) : cctx.moveTo(X, Y); } cctx.stroke(); cctx.setLineDash([]); };
    line((x) => x * x, "#4f46e5");        // MSE — парабола
    line((x) => x, "#10b981");            // MAE — прямая
    line((x) => x, "#8b5cf6", [6, 5]);    // RMSE (на одной точке = MAE)
    cctx.textAlign = "left"; cctx.textBaseline = "middle"; cctx.font = "12px -apple-system, sans-serif";
    let lx = x0 + 8; const ly = y0 + 10;
    const leg = (c, t, dash) => { cctx.strokeStyle = c; cctx.lineWidth = 2.6; cctx.setLineDash(dash || []); cctx.beginPath(); cctx.moveTo(lx, ly); cctx.lineTo(lx + 20, ly); cctx.stroke(); cctx.setLineDash([]); cctx.fillStyle = "#14171c"; cctx.fillText(t, lx + 25, ly); lx += 25 + cctx.measureText(t).width + 16; };
    leg("#10b981", "MAE = |e|"); leg("#4f46e5", "MSE = e²"); leg("#8b5cf6", "RMSE", [6, 5]);
    const i = effIndex();
    if (i >= 0 && DATA[i] && DATA[i].ae > 0) {
      const e = DATA[i].ae, X = PX(e);
      cctx.strokeStyle = "rgba(20,23,28,.3)"; cctx.setLineDash([4, 4]); cctx.beginPath(); cctx.moveTo(X, y0); cctx.lineTo(X, y0 + ph); cctx.stroke(); cctx.setLineDash([]);
      cctx.beginPath(); cctx.arc(X, PY(Math.min(ymax, e * e)), 5, 0, 7); cctx.fillStyle = "#4f46e5"; cctx.fill(); cctx.strokeStyle = "#fff"; cctx.lineWidth = 2; cctx.stroke();
      cctx.beginPath(); cctx.arc(X, PY(e), 5, 0, 7); cctx.fillStyle = "#10b981"; cctx.fill(); cctx.stroke();
      const txt = "промах " + e + " → MAE " + e + ", MSE " + (e * e);
      cctx.font = "700 11px -apple-system, sans-serif"; const tw = cctx.measureText(txt).width + 16;
      let tx = X + 10; if (tx + tw > CW - 4) tx = X - tw - 10;
      cctx.fillStyle = "rgba(20,23,28,.9)"; roundRect(cctx, tx, y0 + 6, tw, 22, 7); cctx.fill();
      cctx.fillStyle = "#fff"; cctx.textAlign = "left"; cctx.textBaseline = "middle"; cctx.fillText(txt, tx + 8, y0 + 17);
    }
  }

  // ---------- управление ----------
  function renderAll() { renderShelf(); renderTable(); renderMetrics(); renderVerdict(); drawChart(); drawCurves(); }
  function rebuild() { generate(); state.hover = -1; state.pinned = -1; state.shown = -1; renderAll(); }

  $("#viewSeg").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    $("#viewSeg").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
    state.view = b.dataset.view; drawChart();
  }));
  $("#dropOut").addEventListener("change", (e) => {
    state.dropOut = e.target.checked; renderShelf(); renderTable(); renderMetrics(); renderVerdict(); drawChart();
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
  generate(); renderShelf(); renderTable(); renderMetrics(); renderVerdict(); resize(); resizeCurves();
})();
