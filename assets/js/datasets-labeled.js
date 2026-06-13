/* Размеченные датасеты для supervised-визуализаций (деревья, форест, kNN…).
   Возвращают {points:[{x,y}], labels:[int], nClasses}. Координаты в [0,1]. */
(function () {
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(r, m, sd) {
    let u = 0, v = 0;
    while (u === 0) u = r();
    while (v === 0) v = r();
    return m + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  const clamp = (x) => Math.max(0.05, Math.min(0.95, x));
  const P = (x, y) => ({ x: clamp(x), y: clamp(y) });

  // Две луны: верхняя дуга — класс 0, нижняя — класс 1.
  function moons(n, r) {
    const pts = [], labels = [], half = Math.floor(n / 2);
    for (let i = 0; i < half; i++) {
      const t = Math.PI * (i / half);
      pts.push(P(0.30 + 0.34 * Math.cos(t) + gauss(r, 0, 0.02), 0.60 - 0.34 * Math.sin(t) + gauss(r, 0, 0.02)));
      labels.push(0);
    }
    for (let i = 0; i < n - half; i++) {
      const t = Math.PI * (i / (n - half));
      pts.push(P(0.50 + 0.34 * Math.cos(t) + gauss(r, 0, 0.02), 0.42 + 0.34 * Math.sin(t) + gauss(r, 0, 0.02)));
      labels.push(1);
    }
    return { points: pts, labels, nClasses: 2 };
  }

  // Кольца: центральный диск — класс 0, внешнее кольцо — класс 1.
  function circles(n, r) {
    const pts = [], labels = [], inner = Math.floor(n * 0.45);
    for (let i = 0; i < inner; i++) {
      const a = r() * 2 * Math.PI, rad = 0.17 * Math.sqrt(r());
      pts.push(P(0.5 + rad * Math.cos(a), 0.5 + rad * Math.sin(a))); labels.push(0);
    }
    for (let i = 0; i < n - inner; i++) {
      const a = r() * 2 * Math.PI, rad = 0.40 + gauss(r, 0, 0.025);
      pts.push(P(0.5 + rad * Math.cos(a), 0.5 + rad * Math.sin(a))); labels.push(1);
    }
    return { points: pts, labels, nClasses: 2 };
  }

  // XOR: диагональные квадранты — один класс, антидиагональ — другой.
  function xor(n, r) {
    const c = [[0.30, 0.30, 0], [0.70, 0.70, 0], [0.30, 0.70, 1], [0.70, 0.30, 1]];
    const pts = [], labels = [];
    for (let i = 0; i < n; i++) {
      const k = c[i % 4];
      pts.push(P(gauss(r, k[0], 0.085), gauss(r, k[1], 0.085))); labels.push(k[2]);
    }
    return { points: pts, labels, nClasses: 2 };
  }

  // Две переплетённые спирали — по классу на рукав.
  function spiral(n, r) {
    const pts = [], labels = [], per = Math.floor(n / 2), TURN = 3.1 * Math.PI;
    for (let arm = 0; arm < 2; arm++) {
      for (let i = 0; i < per; i++) {
        const t = (i / per) * TURN;
        const rad = 0.03 + (t / TURN) * 0.42, ang = t + arm * Math.PI;
        pts.push(P(0.5 + rad * Math.cos(ang) + gauss(r, 0, 0.012), 0.5 + rad * Math.sin(ang) + gauss(r, 0, 0.012)));
        labels.push(arm);
      }
    }
    return { points: pts, labels, nClasses: 2 };
  }

  // Три гауссовых пятна — три класса.
  function blobs3(n, r) {
    const c = [[0.28, 0.34], [0.72, 0.30], [0.50, 0.72]];
    const pts = [], labels = [];
    for (let i = 0; i < n; i++) {
      const k = i % 3;
      pts.push(P(gauss(r, c[k][0], 0.075), gauss(r, c[k][1], 0.075))); labels.push(k);
    }
    return { points: pts, labels, nClasses: 3 };
  }

  const GEN = { moons, circles, xor, spiral, blobs3 };

  window.LabeledDatasets = {
    list: [
      { id: "moons",   name: "Две луны" },
      { id: "circles", name: "Кольца (вложенные)" },
      { id: "xor",     name: "XOR" },
      { id: "spiral",  name: "Спираль" },
      { id: "blobs3",  name: "Пятна (3 класса)" },
    ],
    generate(id, n, seed) { return (GEN[id] || moons)(n, rng(seed)); },
  };
})();
