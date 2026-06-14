/* Бинарные датасеты для kNN — наглядные задачи «два класса» с осмысленными
   осями. Реалистичные (экзамен, кредит) и нелинейные (луны, кольца).
   Координаты нормированы в [0.07, 0.93]. Сиды воспроизводимы. */
(function () {
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(r) { let u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  const cl = (x) => Math.max(0.07, Math.min(0.93, x));

  // два гауссовых облака → два класса
  function twoBlobs(n, seed, spec) {
    const r = mulberry32(seed), pts = [], labels = [], C = spec.centers, sp = spec.spread;
    for (let i = 0; i < n; i++) {
      const c = i % 2;
      pts.push({ x: cl(C[c][0] + gauss(r) * sp), y: cl(C[c][1] + gauss(r) * sp) });
      labels.push(c);
    }
    return { points: pts, labels, nClasses: 2, classNames: spec.names, xLabel: spec.xl, yLabel: spec.yl };
  }
  function moons(n, seed) {
    const r = mulberry32(seed), pts = [], labels = [], half = Math.floor(n / 2);
    for (let i = 0; i < half; i++) { const t = Math.PI * (i / half); pts.push({ x: cl(0.30 + 0.34 * Math.cos(t) + gauss(r) * 0.028), y: cl(0.62 - 0.34 * Math.sin(t) + gauss(r) * 0.028) }); labels.push(0); }
    for (let i = 0; i < n - half; i++) { const t = Math.PI * (i / (n - half)); pts.push({ x: cl(0.50 + 0.34 * Math.cos(t) + gauss(r) * 0.028), y: cl(0.40 + 0.34 * Math.sin(t) + gauss(r) * 0.028) }); labels.push(1); }
    return { points: pts, labels, nClasses: 2, classNames: ["класс A", "класс B"], xLabel: "признак 1 →", yLabel: "признак 2 ↑" };
  }
  function circles(n, seed) {
    const r = mulberry32(seed), pts = [], labels = [], inner = Math.floor(n * 0.5);
    for (let i = 0; i < inner; i++) { const a = r() * 2 * Math.PI, rad = 0.17 * Math.sqrt(r()); pts.push({ x: cl(0.5 + rad * Math.cos(a)), y: cl(0.5 + rad * Math.sin(a)) }); labels.push(0); }
    for (let i = 0; i < n - inner; i++) { const a = r() * 2 * Math.PI, rad = 0.40 + gauss(r) * 0.03; pts.push({ x: cl(0.5 + rad * Math.cos(a)), y: cl(0.5 + rad * Math.sin(a)) }); labels.push(1); }
    return { points: pts, labels, nClasses: 2, classNames: ["центр", "кольцо"], xLabel: "признак 1 →", yLabel: "признак 2 ↑" };
  }

  const GEN = {
    exam: (n, s) => twoBlobs(n, s, { centers: [[0.70, 0.68], [0.30, 0.32]], spread: 0.135, names: ["сдал", "не сдал"], xl: "часы подготовки →", yl: "балл за пробник ↑" }),
    credit: (n, s) => twoBlobs(n, s, { centers: [[0.72, 0.70], [0.32, 0.30]], spread: 0.125, names: ["одобрить", "отказать"], xl: "доход →", yl: "кредитный рейтинг ↑" }),
    moons: moons,
    circles: circles,
  };

  window.KnnDatasets = {
    list: [
      { id: "exam", name: "🎓 Экзамен — сдал / не сдал" },
      { id: "credit", name: "💳 Кредит — одобрить / отказать" },
      { id: "moons", name: "🌗 Две луны — изогнутая граница" },
      { id: "circles", name: "🎯 Кольца — центр / кольцо" },
    ],
    generate(id, n, seed) { return (GEN[id] || GEN.exam)(n, seed); },
  };
})();
