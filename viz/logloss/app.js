/* «Log Loss / кросс-энтропия» — насколько хороши вероятности модели.
   Пациенты: истинный диагноз (болен=1 / здоров=0) и вероятность p̂ от модели.
   Штраф = −log p̂ (если болен) или −log(1−p̂) (если здоров). Точки тащим по
   кривой штрафа; уверенная ошибка → огромный штраф. Vanilla JS + KaTeX. */
(function () {
  "use strict";

  const SICK = "#ef4444", HEALTHY = "#10b981", ACCENT = "#4f46e5", PEN = "#7c3aed";
  const $ = (s) => document.querySelector(s);
  const KT = (tex) => (window.katex ? katex.renderToString(tex, { throwOnError: false, trust: true, strict: false }) : tex);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const fmt = (v) => (Math.round(v * 100) / 100).toFixed(2);

  const state = { count: 5, seed: 7, quality: 0.35, drag: -1, hover: -1, pinned: -1, shown: -1 };
  let PPL = [];   // [{sick, p}]
  let termEls = [];   // индекс пациента -> [DOM-слагаемые в формуле]

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function generate() {
    const r = mulberry32(state.seed); PPL = [];
    const q = state.quality;                                  // 0 — хорошая модель, 1 — плохая
    for (let i = 0; i < state.count; i++) {
      const sick = r() < 0.5;
      // вероятность, назначенная ИСТИННОМУ классу: хорошая модель → к 1, плохая → к 0 (уверенно неправа)
      const pCorrect = clamp(0.93 - q * 0.9 + (r() - 0.5) * 0.16, 0.02, 0.98);
      const p = sick ? pCorrect : 1 - pCorrect;               // p = вероятность «болен»
      PPL.push({ sick, p });
    }
  }
  const loss = (d) => (d.sick ? -Math.log(clamp(d.p, 1e-3, 1)) : -Math.log(clamp(1 - d.p, 1e-3, 1)));
  const total = () => PPL.reduce((s, d) => s + loss(d), 0) / PPL.length;

  // ---------- карточки ----------
  let cards = [];
  function renderCards() {
    const wrap = $("#pstrip"); wrap.innerHTML = ""; cards = [];
    PPL.forEach((d, i) => {
      const el = document.createElement("div");
      el.className = "pcard " + (d.sick ? "sickb" : "healthyb");
      el.dataset.i = i;
      const L = loss(d);
      const penCol = L < 0.4 ? "#0f9d58" : L < 1.2 ? "#b45309" : "#dc2626";
      el.innerHTML =
        `<div class="emoji">${d.sick ? "🤒" : "🙂"}</div>` +
        `<div class="num">№${i + 1}</div>` +
        `<div class="who ${d.sick ? "s" : "h"}">${d.sick ? "болен" : "здоров"}</div>` +
        `<div class="prob">p̂ = ${Math.round(d.p * 100)}%</div>` +
        `<div class="pen" style="color:${penCol}">штраф ${fmt(L)}</div>`;
      el.addEventListener("mouseenter", () => setHover(i));
      el.addEventListener("mouseleave", () => setHover(-1));
      el.addEventListener("click", () => setPin(i));
      wrap.appendChild(el); cards[i] = el;
    });
  }

  // ---------- таблица ----------
  let rows = [];
  function renderTable() {
    const tb = $("#tbody"); tb.innerHTML = ""; rows = [];
    PPL.forEach((d, i) => {
      const tr = document.createElement("tr"); tr.dataset.i = i;
      const L = loss(d);
      tr.innerHTML =
        `<td class="obj">${d.sick ? "🤒" : "🙂"} №${i + 1} <span style="color:${d.sick ? SICK : HEALTHY}">${d.sick ? "болен" : "здоров"}</span></td>` +
        `<td>${d.sick ? 1 : 0}</td><td>${d.p.toFixed(2)}</td><td class="pen-c">${fmt(L)}</td>`;
      tr.addEventListener("mouseenter", () => setHover(i));
      tr.addEventListener("mouseleave", () => setHover(-1));
      tr.addEventListener("click", () => setPin(i));
      tb.appendChild(tr); rows[i] = tr;
    });
    const sum = PPL.reduce((s, d) => s + loss(d), 0);
    const sr = document.createElement("tr"); sr.className = "sum";
    sr.innerHTML = `<td class="obj">Σ штрафов (÷${PPL.length})</td><td></td><td></td><td class="pen-c">${fmt(sum)}</td>`;
    tb.appendChild(sr);
  }
  function worstIndex() { let w = 0; PPL.forEach((d, i) => { if (loss(d) > loss(PPL[w])) w = i; }); return w; }
  // разбор одного пациента: какое из двух слагаемых живёт (×1), а какое гаснет (×0)
  function renderBreakdown(i) {
    if (i < 0 || i >= PPL.length) i = worstIndex();
    const d = PPL[i], p = d.p, L = loss(d), grey = "\\textcolor{#c3c9d4}";
    const who = $("#bdWho");
    who.textContent = `№${i + 1} · ${d.sick ? "болен (y = 1)" : "здоров (y = 0)"}`;
    who.className = "who " + (d.sick ? "s" : "h");
    let tex;
    if (d.sick) {
      tex = `-\\big[\\,\\textcolor{#ef4444}{1\\cdot\\ln p} \\;+\\; ${grey}{0\\cdot\\ln(1-p)}\\,\\big]` +
            ` = -\\ln p = -\\ln(${p.toFixed(2)}) = \\htmlClass{kres}{${fmt(L)}}`;
      $("#bdHint").innerHTML = 'y = 1 → живёт только <b class="sick">−ln p̂</b>; второй член умножается на 0 и исчезает.';
    } else {
      tex = `-\\big[\\,${grey}{0\\cdot\\ln p} \\;+\\; \\textcolor{#10b981}{1\\cdot\\ln(1-p)}\\,\\big]` +
            ` = -\\ln(1-p) = -\\ln(${(1 - p).toFixed(2)}) = \\htmlClass{kres}{${fmt(L)}}`;
      $("#bdHint").innerHTML = 'y = 0 → живёт только <b class="healthy">−ln(1−p̂)</b>; первый член умножается на 0 и исчезает.';
    }
    $("#bdMath").innerHTML = KT(tex);
  }

  function renderTotal() {
    const terms = PPL.map((d, i) => {
      const col = d.sick ? "#ef4444" : "#10b981";
      return `\\htmlClass{term term-${i}}{\\textcolor{${col}}{${fmt(loss(d))}}}`;
    }).join("+");
    const tex = `\\mathrm{LogLoss}=\\dfrac{${terms}}{${PPL.length}}\\approx \\htmlClass{llres}{${fmt(total())}}`;
    $("#totalEq").innerHTML = KT(tex);
    renderBreakdown(effIndex());
    termEls = [];
    PPL.forEach((d, i) => {
      const els = [...document.querySelectorAll(`#totalEq .term-${i}`)];
      termEls[i] = els;
      els.forEach((el) => {
        el.addEventListener("mouseenter", () => setHover(i));
        el.addEventListener("mouseleave", () => setHover(-1));
        el.addEventListener("click", () => setPin(i));
      });
    });
  }
  function renderVerdict() {
    let worst = 0; PPL.forEach((d, i) => { if (loss(d) > loss(PPL[worst])) worst = i; });
    const w = PPL[worst], L = loss(w), conf = w.sick ? 1 - w.p : w.p;
    const confWrong = (w.sick && w.p < 0.4) || (!w.sick && w.p > 0.6);
    const msg = confWrong
      ? `Худший — пациент №${worst + 1}: он <b>${w.sick ? "болен" : "здоров"}</b>, а модель уверенно сказала обратное (p̂ = ${Math.round(w.p * 100)}%) → штраф <b style="color:#dc2626">${fmt(L)}</b>. Вот она, «уверенная ошибка»: Log Loss наказывает её несоизмеримо.`
      : `Пока никто не ошибся уверенно — штрафы умеренные. Перетащи больного к низкой вероятности (или здорового к высокой), и увидишь, как штраф взлетает.`;
    $("#verdict").innerHTML = `${msg} Средний штраф = <b style="color:${PEN}">Log Loss ≈ ${fmt(total())}</b>. Идеал — 0 (модель уверенно права на всех).`;
  }

  // ---------- подсветка ----------
  function effIndex() { return state.pinned >= 0 ? state.pinned : state.hover; }
  function applyHL(i) {
    if (i !== state.shown) {
      const tog = (idx, add) => {
        if (idx < 0) return;
        if (cards[idx]) cards[idx].classList.toggle("hl", add);
        if (rows[idx]) rows[idx].classList.toggle("hl", add);
        (termEls[idx] || []).forEach((e) => e.classList.toggle("hl", add));
      };
      tog(state.shown, false); state.shown = i; tog(i, true);
      renderBreakdown(i >= 0 ? i : worstIndex());
    }
    draw();
  }
  function setHover(i) { state.hover = i; if (state.pinned < 0) applyHL(i); }
  function setPin(i) { state.pinned = (state.pinned === i) ? -1 : (i >= 0 ? i : -1); applyHL(effIndex()); }

  // ---------- график кривой штрафа ----------
  const canvas = $("#chart"), ctx = canvas.getContext("2d");
  let W = 0, H = 0;
  const PAD = { l: 44, r: 18, t: 16, b: 44 }, YMAX = 4.6;
  function resize() {
    const r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    W = r.width; H = r.height; canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); draw();
  }
  const plot = () => ({ x: PAD.l, y: PAD.t, w: W - PAD.l - PAD.r, h: H - PAD.t - PAD.b });
  const px = (p) => plot().x + p * plot().w;
  const py = (v) => { const pl = plot(); return pl.y + pl.h - clamp(v, 0, YMAX) / YMAX * pl.h; };
  const ipx = (X) => clamp((X - plot().x) / plot().w, 0, 1);

  function lossCurve(sick) {
    const pl = plot(); ctx.beginPath(); let started = false;
    for (let i = 0; i <= 200; i++) {
      const p = clamp(i / 200, 0.005, 0.995), v = sick ? -Math.log(p) : -Math.log(1 - p);
      const X = px(p), Y = py(v);
      if (v > YMAX) { started = false; continue; }
      if (!started) { ctx.moveTo(X, Y); started = true; } else ctx.lineTo(X, Y);
    }
    ctx.strokeStyle = sick ? SICK : HEALTHY; ctx.lineWidth = 2.4; ctx.stroke();
  }
  function draw() {
    if (!W) return;
    const pl = plot(), base = pl.y + pl.h;
    ctx.clearRect(0, 0, W, H);
    // сетка + оси
    ctx.font = "11px -apple-system, system-ui, sans-serif"; ctx.fillStyle = "#8a93a3"; ctx.strokeStyle = "rgba(20,23,28,.06)"; ctx.lineWidth = 1;
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    for (let v = 0; v <= 4; v++) { const Y = py(v); ctx.beginPath(); ctx.moveTo(pl.x, Y); ctx.lineTo(pl.x + pl.w, Y); ctx.stroke(); ctx.fillText(v, pl.x - 7, Y); }
    ctx.save(); ctx.translate(13, pl.y + pl.h / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = "center"; ctx.fillText("штраф (Log Loss)", 0, 0); ctx.restore();
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    for (const t of [0, 0.25, 0.5, 0.75, 1]) ctx.fillText(t.toFixed(2), px(t), base + 6);
    ctx.fillText("вероятность p̂, что человек болен (мнение модели)", pl.x + pl.w / 2, base + 24);

    // референс «чистого сомнения»: p̂=0.5 → −ln(0.5)=ln2≈0.69
    const yDoubt = py(Math.LN2);
    ctx.strokeStyle = "rgba(124,58,237,.22)"; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(pl.x, yDoubt); ctx.lineTo(pl.x + pl.w, yDoubt); ctx.stroke(); ctx.setLineDash([]);

    lossCurve(true); lossCurve(false);

    // подписи кривых — по краям, каждая на своей крутой ветви, без наложения
    ctx.font = "700 12.5px -apple-system, sans-serif"; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = SICK; ctx.textAlign = "left";
    ctx.fillText("болен (y=1): −ln p̂", px(0.085), py(-Math.log(0.085)) - 7);
    ctx.fillStyle = HEALTHY; ctx.textAlign = "right";
    ctx.fillText("здоров (y=0): −ln(1−p̂)", px(0.915), py(-Math.log(1 - 0.915)) - 7);
    // подпись линии сомнения
    ctx.fillStyle = "#7c3aed"; ctx.font = "11px -apple-system, sans-serif"; ctx.textAlign = "right"; ctx.textBaseline = "bottom";
    ctx.fillText("p̂ = 0.5 → штраф 0.69", pl.x + pl.w - 4, yDoubt - 3);

    // точки-пациенты на своих кривых
    const hi = effIndex();
    PPL.forEach((d, i) => {
      const X = px(d.p), Y = py(loss(d)), hot = i === hi;
      if (hot) {
        ctx.strokeStyle = "rgba(20,23,28,.25)"; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(X, base); ctx.lineTo(X, Y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(pl.x, Y); ctx.lineTo(X, Y); ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.beginPath(); ctx.arc(X, Y, hot ? 8 : 6, 0, 7);
      ctx.fillStyle = d.sick ? SICK : HEALTHY; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = "#fff"; ctx.stroke();
      if (hot) {
        ctx.fillStyle = "#14171c"; ctx.font = "700 12px -apple-system, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
        ctx.fillText("№" + (i + 1) + ": штраф " + fmt(loss(d)), X, Y - 11);
      }
    });
  }

  // ---------- перетаскивание точек ----------
  function nearest(mx, my) {
    let bi = -1, bd = 16 * 16;
    PPL.forEach((d, i) => { const dx = mx - px(d.p), dy = my - py(loss(d)); const dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; bi = i; } });
    return bi;
  }
  function mpos(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  canvas.addEventListener("mousedown", (e) => { const m = mpos(e); const i = nearest(m.x, m.y); if (i >= 0) { state.drag = i; setHover(i); canvas.style.cursor = "grabbing"; } });
  window.addEventListener("mousemove", (e) => {
    const m = mpos(e);
    if (state.drag >= 0) { PPL[state.drag].p = clamp(ipx(m.x), 0.02, 0.98); refresh(); }
    else { const r = canvas.getBoundingClientRect(); if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) setHover(nearest(m.x, m.y)); }
  });
  window.addEventListener("mouseup", () => { state.drag = -1; canvas.style.cursor = "grab"; });

  // ---------- обновления ----------
  function refresh() { renderTable(); renderTotal(); renderVerdict(); draw(); }
  function rebuild() { generate(); state.hover = -1; state.pinned = -1; state.shown = -1; refresh(); }
  $("#count").addEventListener("input", (e) => { state.count = +e.target.value; $("#countVal").textContent = e.target.value; rebuild(); });
  $("#quality").addEventListener("input", (e) => { state.quality = +e.target.value / 100; rebuild(); });
  $("#newData").addEventListener("click", () => { state.seed = (state.seed * 1103515245 + 12345) >>> 0; rebuild(); });
  window.addEventListener("resize", resize);

  // ---------- старт ----------
  generate(); renderTable(); renderTotal(); renderVerdict(); resize();
})();
