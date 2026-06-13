/* «Болен или здоров?» — порог классификации, матрица ошибок, Precision/Recall.
   Каждый человек — точка по вероятности болезни (мнение теста). Порог тащим
   мышью: правее = тест говорит «болен». Цвет точки = настоящий диагноз.
   Всё пересчитывается вживую. Чистый vanilla JS. */
(function () {
  "use strict";

  const SICK = "#ef4444", HEALTHY = "#10b981", ACCENT = "#4f46e5";
  const $ = (s) => document.querySelector(s);

  const state = { sep: 0.24, balance: 0.4, count: 44, seed: 3, thr: 0.5, drag: false, prevP: 0, prevR: 0 };
  let PPL = [];   // [{sick, p, jit}]

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
      const p = clamp(gauss(r, mean, 0.13), 0.015, 0.985);
      PPL.push({ sick, p, jit: r() });
    }
  }
  function counts() {
    const T = state.thr; let TP = 0, FP = 0, FN = 0, TN = 0;
    for (const d of PPL) {
      const pos = d.p >= T;
      if (d.sick && pos) TP++; else if (!d.sick && pos) FP++;
      else if (d.sick && !pos) FN++; else TN++;
    }
    return { TP, FP, FN, TN };
  }

  // ---------- canvas ----------
  const canvas = $("#chart"), ctx = canvas.getContext("2d");
  let W = 0, H = 0;
  const PAD = { l: 18, r: 18, t: 26, b: 48 };
  function resize() {
    const r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    W = r.width; H = r.height; canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); draw();
  }
  const plot = () => ({ x: PAD.l, y: PAD.t, w: W - PAD.l - PAD.r, h: H - PAD.t - PAD.b });
  const px = (p) => plot().x + p * plot().w;
  const ipx = (X) => clamp((X - plot().x) / plot().w, 0, 1);

  function densityAt(x, sick) {
    const m = sick ? 0.5 + state.sep : 0.5 - state.sep, sd = 0.13;
    const z = (x - m) / sd; return Math.exp(-0.5 * z * z);
  }
  function draw() {
    if (!W) return;
    const p = plot(), T = state.thr, Xt = px(T), base = p.y + p.h;
    ctx.clearRect(0, 0, W, H);

    // зоны решения: левее порога — «здоров» (зел), правее — «болен» (красн)
    ctx.fillStyle = "rgba(16,185,129,.06)"; ctx.fillRect(p.x, p.y, Xt - p.x, p.h);
    ctx.fillStyle = "rgba(239,68,68,.06)"; ctx.fillRect(Xt, p.y, p.x + p.w - Xt, p.h);

    // фоновые распределения (тонко)
    const fSick = Math.max(0.0001, state.balance), fH = Math.max(0.0001, 1 - state.balance);
    const peak = Math.max(fSick, fH), curveH = p.h * 0.62;
    for (const [sick, frac] of [[false, fH], [true, fSick]]) {
      ctx.beginPath(); ctx.moveTo(p.x, base);
      for (let i = 0; i <= 120; i++) {
        const x = i / 120, val = frac * densityAt(x, sick) / peak;
        ctx.lineTo(px(x), base - val * curveH);
      }
      ctx.lineTo(p.x + p.w, base); ctx.closePath();
      ctx.fillStyle = sick ? "rgba(239,68,68,.10)" : "rgba(16,185,129,.10)";
      ctx.fill();
    }

    // люди-точки (джиттер по высоте). Ошибки — с тёмным кольцом.
    const band = { top: p.y + 16, bot: base - 12 };
    for (const d of PPL) {
      const X = px(d.p), Y = band.top + d.jit * (band.bot - band.top);
      const pos = d.p >= T;
      const err = (d.sick && !pos) || (!d.sick && pos);
      ctx.beginPath(); ctx.arc(X, Y, 6, 0, 7);
      ctx.fillStyle = d.sick ? SICK : HEALTHY; ctx.fill();
      if (err) { ctx.lineWidth = 2.5; ctx.strokeStyle = "#14171c"; ctx.stroke(); }
      else { ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.stroke(); }
    }

    // ось X
    ctx.strokeStyle = "rgba(20,23,28,.18)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(p.x, base); ctx.lineTo(p.x + p.w, base); ctx.stroke();
    ctx.fillStyle = "#8a93a3"; ctx.font = "11px -apple-system, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "top";
    for (const t of [0, 0.25, 0.5, 0.75, 1]) ctx.fillText(t.toFixed(2), px(t), base + 6);
    ctx.fillText("вероятность болезни (по мнению теста)", p.x + p.w / 2, base + 24);
    // подписи зон
    ctx.font = "700 12px -apple-system, sans-serif";
    ctx.fillStyle = HEALTHY; ctx.textAlign = "left"; ctx.fillText("← тест: «здоров»", p.x + 6, p.y + 2);
    ctx.fillStyle = SICK; ctx.textAlign = "right"; ctx.fillText("тест: «болен» →", p.x + p.w - 6, p.y + 2);

    // линия порога + ручка
    ctx.strokeStyle = ACCENT; ctx.lineWidth = 2.5; ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.moveTo(Xt, p.y + 14); ctx.lineTo(Xt, base); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = ACCENT;
    roundRect(Xt - 26, p.y - 8, 52, 22, 7); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = "700 12px -apple-system, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("⇆ " + T.toFixed(2), Xt, p.y + 3);
  }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  // ---------- обновление панелей ----------
  function pct(v) { return Number.isNaN(v) ? "—" : Math.round(v * 100) + "%"; }
  function update() {
    const c = counts();
    $("#cmTP").querySelector(".ct").textContent = c.TP;
    $("#cmFP").querySelector(".ct").textContent = c.FP;
    $("#cmFN").querySelector(".ct").textContent = c.FN;
    $("#cmTN").querySelector(".ct").textContent = c.TN;

    const recall = (c.TP + c.FN) ? c.TP / (c.TP + c.FN) : NaN;
    const prec = (c.TP + c.FP) ? c.TP / (c.TP + c.FP) : NaN;
    $("#rVal").textContent = pct(recall); $("#pVal").textContent = pct(prec);
    $("#rFrac").textContent = `TP / (TP + FN) = ${c.TP} / (${c.TP} + ${c.FN})`;
    $("#pFrac").textContent = `TP / (TP + FP) = ${c.TP} / (${c.TP} + ${c.FP})`;
    $("#rBar").style.width = (Number.isNaN(recall) ? 0 : recall * 100) + "%";
    $("#pBar").style.width = (Number.isNaN(prec) ? 0 : prec * 100) + "%";
    arrow("#rArr", recall, "prevR"); arrow("#pArr", prec, "prevP");

    const named = c.TP + c.FP, sickTotal = c.TP + c.FN;
    $("#note").innerHTML =
      `При пороге <b>${state.thr.toFixed(2)}</b> тест назвал больными <b>${named}</b> чел.: верно <b style="color:#0f9d58">${c.TP}</b>, ложная тревога <b style="color:#dc2626">${c.FP}</b>. ` +
      `Пропустил больных (FN): <b style="color:#dc2626">${c.FN}</b> из ${sickTotal}.<br>` +
      `<b>Правило:</b> сдвинешь порог <b>влево</b> — поймаешь больше больных (<b style="color:#4f46e5">Recall↑</b>), но будет больше ложных тревог (<b style="color:#0ea5e9">Precision↓</b>). Вправо — наоборот.`;
  }
  function arrow(sel, val, key) {
    const el = $(sel); const prev = state[key];
    if (!Number.isNaN(val)) {
      if (val > prev + 0.001) { el.textContent = "↑"; el.style.color = "#0f9d58"; }
      else if (val < prev - 0.001) { el.textContent = "↓"; el.style.color = "#dc2626"; }
      else el.textContent = "";
      state[key] = val;
    } else el.textContent = "";
  }

  // ---------- взаимодействие: тащим порог ----------
  function setThrFromX(clientX) {
    const r = canvas.getBoundingClientRect();
    state.thr = Math.round(ipx(clientX - r.left) * 100) / 100;
    $("#thrVal").textContent = state.thr.toFixed(2);
    draw(); update();
  }
  canvas.addEventListener("mousedown", (e) => { state.drag = true; setThrFromX(e.clientX); });
  window.addEventListener("mousemove", (e) => { if (state.drag) setThrFromX(e.clientX); });
  window.addEventListener("mouseup", () => { state.drag = false; });

  // ---------- контролы ----------
  function rebuild() { generate(); draw(); update(); }
  $("#sep").addEventListener("input", (e) => {
    state.sep = +e.target.value;
    $("#sepVal").textContent = state.sep < 0.15 ? "слабый" : state.sep < 0.3 ? "ср." : "сильный";
    rebuild();
  });
  $("#bal").addEventListener("input", (e) => { state.balance = +e.target.value; $("#balVal").textContent = Math.round(state.balance * 100) + "%"; rebuild(); });
  $("#count").addEventListener("input", (e) => { state.count = +e.target.value; $("#countVal").textContent = e.target.value; rebuild(); });
  $("#newData").addEventListener("click", () => { state.seed = (state.seed * 1103515245 + 12345) >>> 0; rebuild(); });
  window.addEventListener("resize", resize);

  // ---------- старт ----------
  $("#sepVal").textContent = "ср.";
  generate(); resize(); update();
})();
