// aquarium.js — ドット絵の水槽（描画・遊泳・給餌）。メダカ＋金魚5種に対応。

const Aquarium = (() => {
  const PX = 6; // 1ドットの大きさ(px)
  let ctx, W, H;
  let fish = [];
  let critters = []; // ドジョウ・タニシ・タナゴ（魚とは独立。アプリを開いている間ずっと滞在）
  let food = [];
  let bubbles = [];
  let marimos = []; // 水底のマリモ。app側が48時間のTTLを管理し、表示する位置リストを渡す
  let gather = null; // クリックで発生する一時的な集合点 { x, y, t(残りフレーム) }
  let raf = null;

  const CRITTER_SPECIES = ["dojo", "tanishi", "tanago"];

  let passers = []; // アリゲーターガー・シーラカンス・ミドリガメ（魚の後ろを横切って画面外へ去る）
  const PASSER_SPECIES = ["gar", "coelacanth", "turtle"];

  // 成長段階ごとの基本サイズ（セル単位）: 稚魚→小→中→成魚
  // 成魚の最大サイズは従来の半分程度に縮小（成長の大小関係は維持）
  const SIZE = [
    { hw: 1, hh: 1, tail: 1 },
    { hw: 2, hh: 1, tail: 1 },
    { hw: 2, hh: 2, tail: 2 },
    { hw: 3, hh: 2, tail: 2 },
  ];

  // 種類ごとの見た目設定（speed: メダカ=1 を基準とした遊泳速度の倍率）
  const SPECIES = {
    medaka:   { c1: "#f0962e", c2: "#cf7016", c3: "#ffd58a", tcol: "#f7b65a", shape: "slim",  tail: "fan",    eye: "normal", speed: 1 },
    demekin:  { c1: "#34333c", c2: "#17171c", c3: "#46454f", tcol: "#2a2933", shape: "round", tail: "double", eye: "tele", speed: 0.5 },
    comet:    { c1: "#ef5a23", c2: "#c23c12", c3: "#ffd0a0", tcol: "#f47a45", shape: "slim",  tail: "long",   eye: "normal", speed: 2 },
    panda:    { c1: "#f0f0f3", c2: "#1b1b22", c3: "#ffffff", tcol: "#d8d8de", shape: "round", tail: "double", eye: "tele", pattern: "panda", speed: 0.5 },
    pingpong: { c1: "#ff8b3d", c2: "#d96a20", c3: "#fff0d8", tcol: "#ffb066", shape: "ball",  tail: "short",  eye: "normal", speed: 0.7 },
    ranchu:   { c1: "#e34b2a", c2: "#b3361b", c3: "#ff9a6a", tcol: "#ef7a52", shape: "round", tail: "short",  eye: "normal", wen: true, speed: 1.2 },
  };

  function init(canvas) {
    ctx = canvas.getContext("2d");
    W = canvas.width;
    H = canvas.height;
    ctx.imageSmoothingEnabled = false;
    bubbles = Array.from({ length: 10 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      s: 0.3 + Math.random() * 0.5,
    }));

    // 水槽をタップ／クリックすると、その場所に魚が一時的に集まる
    canvas.addEventListener("pointerdown", (e) => {
      const rect = canvas.getBoundingClientRect();
      gather = {
        x: (e.clientX - rect.left) * (W / rect.width),
        y: (e.clientY - rect.top) * (H / rect.height),
        t: 150, // 約2.5秒間あつまる
      };
    });

    if (!raf) loop();
  }

  function newFishObj(species) {
    return {
      x: 30 + Math.random() * (W - 60),
      y: H * 0.3 + Math.random() * H * 0.4,
      vx: (Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 0.4),
      vy: 0,
      dir: 1,
      stage: 0,
      species: species || "medaka",
      phase: Math.random() * 6.28,
    };
  }

  // specs: [{stage:0..3, species:'medaka'|...}, ...] 1要素=1匹
  function setPopulation(specs) {
    const target = specs.length;
    while (fish.length < target) fish.push(newFishObj(specs[fish.length] && specs[fish.length].species));
    while (fish.length > target) fish.pop();
    specs.forEach((s, i) => {
      fish[i].stage = s.stage;
      fish[i].species = s.species || "medaka";
    });
  }

  function feed(n = 1) {
    for (let i = 0; i < n; i++) {
      food.push({ x: 20 + Math.random() * (W - 40), y: -4 - i * 10, vy: 0.4 + Math.random() * 0.3 });
    }
  }

  function put(cx, cy, color) {
    ctx.fillStyle = color;
    ctx.fillRect(cx * PX, cy * PX, PX, PX);
  }

  function drawTail(bx, by, dir, rx, ry, s, sp) {
    const col = sp.tcol;
    const base = bx - dir * rx; // 体の後端
    if (sp.tail === "fan") {
      for (let k = 1; k <= s.tail; k++) {
        const hh = Math.max(0, s.hh - (k - 1));
        for (let j = -hh; j <= hh; j++) put(base - dir * k, by + j, col);
      }
    } else if (sp.tail === "short") {
      const len = Math.max(1, s.tail - 1);
      for (let k = 1; k <= len; k++) {
        const hh = Math.max(0, ry - 1 - (k - 1));
        for (let j = -hh; j <= hh; j++) put(base - dir * k, by + j, col);
      }
    } else if (sp.tail === "long") {
      const len = s.tail + 3;
      for (let k = 1; k <= len; k++) {
        const hh = Math.max(1, ry + 1 - Math.floor(k * 0.4));
        const yo = Math.round(Math.sin(k * 0.9));
        for (let j = -hh; j <= hh; j++) put(base - dir * k, by + j + yo, col);
      }
    } else if (sp.tail === "double") {
      const len = s.tail + 1;
      for (let k = 1; k <= len; k++) {
        const spread = k;
        put(base - dir * k, by - spread, col);
        put(base - dir * k, by - spread + 1, col);
        put(base - dir * k, by + spread, col);
        put(base - dir * k, by + spread - 1, col);
      }
    }
  }

  function drawFish(f) {
    const s = SIZE[f.stage] || SIZE[0];
    const sp = SPECIES[f.species] || SPECIES.medaka;
    const dir = f.dir;
    const bx = Math.round(f.x / PX);
    const by = Math.round(f.y / PX);

    // 形状による体の半径
    let rx = s.hw, ry = s.hh;
    if (sp.shape === "round") ry = s.hh + 1;
    else if (sp.shape === "ball") { rx = s.hw; ry = Math.max(2, s.hw - 1); }

    drawTail(bx, by, dir, rx, ry, s, sp);

    // 胴体（楕円）
    for (let i = -rx; i <= rx; i++) {
      for (let j = -ry; j <= ry; j++) {
        const e = (i / (rx + 0.3)) ** 2 + (j / (ry + 0.3)) ** 2;
        if (e <= 1) {
          let c = sp.c1;
          if (j > 0) c = sp.c3;       // お腹側を明るく
          if (e > 0.78) c = sp.c2;    // 縁を濃く
          put(bx + i, by + j, c);
        }
      }
    }

    // パンダ模様（頭側と尾側を黒く）
    if (sp.pattern === "panda") {
      for (let i = -rx; i <= rx; i++) {
        for (let j = -ry; j <= ry; j++) {
          const e = (i / (rx + 0.3)) ** 2 + (j / (ry + 0.3)) ** 2;
          if (e <= 1 && (i * dir > rx - 2 || i * dir < -rx + 2)) put(bx + i, by + j, sp.c2);
        }
      }
    }

    // ランチュウの肉瘤（頭の上のこぶ）
    if (sp.wen) {
      const hx = dir * (rx - 1);
      put(bx + hx, by - ry, sp.c2);
      put(bx + hx - dir, by - ry, sp.c2);
    }

    // 目
    const eyeX = bx + dir * (rx - 1);
    const eyeY = by - Math.max(0, ry - 1);
    if (sp.eye === "tele") {
      put(eyeX, eyeY, "#e8e8ee");        // 飛び出した白目
      put(eyeX + dir, eyeY, "#e8e8ee");
      put(eyeX + dir, eyeY, "#101014");  // 瞳
    } else {
      put(eyeX, eyeY, "#2a2118");
    }
  }

  function drawScenery() {
    ctx.fillStyle = "#3a5a2a";
    for (let x = 0; x < W; x += PX) {
      const tall = ((x / PX) | 0) % 3 === 0;
      const h = tall ? PX * 2 : PX;
      ctx.fillRect(x, H - h, PX, h);
    }
    ctx.fillStyle = "#2f8f4a";
    for (let i = 0; i < 9; i++) ctx.fillRect(W - 30 + (i % 2) * PX, H - PX * 2 - i * PX, PX, PX);
    ctx.fillStyle = "#2f7f8f";
    for (let i = 0; i < 7; i++) ctx.fillRect(28 - (i % 2) * PX, H - PX * 2 - i * PX, PX, PX);
  }

  // --- マリモ（水底に居座る緑の藻玉。app側がTTLを管理し位置を渡す） ---

  // list: [{ id, fx(0..1の横位置) }, ...]。既存の見た目（半径）はidで引き継ぐ
  function setMarimos(list) {
    const next = [];
    for (const m of (list || [])) {
      const prev = marimos.find((e) => e.id === m.id);
      if (prev) { prev.fx = m.fx; next.push(prev); }
      else next.push({ id: m.id, fx: m.fx, r: 3 + Math.floor(Math.random() * 3) });
    }
    marimos = next;
  }

  function drawMarimo(m) {
    const r = m.r;
    const cx = Math.round((m.fx * W) / PX);
    const cy = Math.round(H / PX) - 2 - r; // 砂利の上に乗せる
    for (let i = -r; i <= r; i++) {
      for (let j = -r; j <= r; j++) {
        const e = (i * i + j * j) / (r * r + 0.5);
        if (e <= 1) {
          let c = "#3f7a3a";
          if (e > 0.72) c = "#2c5526";                 // 縁を濃く
          else if (((i + j + 80) % 2) === 0) c = "#54a049"; // ふさふさのハイライト
          put(cx + i, cy + j, c);
        }
      }
    }
  }

  function update() {
    if (gather && --gather.t <= 0) gather = null;
    for (const b of bubbles) {
      b.y -= b.s;
      if (b.y < -4) { b.y = H + 4; b.x = Math.random() * W; }
    }
    for (const p of food) p.y += p.vy;

    for (const f of fish) {
      const spd = (SPECIES[f.species] || SPECIES.medaka).speed || 1;
      let nf = null, nd = 1e9;
      for (const p of food) {
        const d = (p.x - f.x) ** 2 + (p.y - f.y) ** 2;
        if (d < nd) { nd = d; nf = p; }
      }
      if (gather) {
        // クリックされた場所へ集まる（餌より強い引力）
        const dx = gather.x - f.x, dy = gather.y - f.y;
        const dist = Math.hypot(dx, dy) || 1;
        f.vx += (dx / dist) * 0.13;
        f.vy += (dy / dist) * 0.13;
      } else if (nf) {
        const dx = nf.x - f.x, dy = nf.y - f.y;
        const dist = Math.hypot(dx, dy) || 1;
        f.vx += (dx / dist) * 0.07;
        f.vy += (dy / dist) * 0.07;
        if (dist < 8) food.splice(food.indexOf(nf), 1);
      } else {
        f.phase += 0.02;
        f.vy += Math.sin(f.phase) * 0.02 - (f.y - H * 0.5) * 0.0006;
        if (Math.abs(f.vx) < 0.3) f.vx += (Math.random() - 0.5) * 0.12;
      }
      f.vx = Math.max(-1.7, Math.min(1.7, f.vx * 0.96));
      f.vy = Math.max(-1.3, Math.min(1.3, f.vy * 0.94));
      f.x += f.vx * spd;
      f.y += f.vy * spd;
      if (f.x < 18) { f.x = 18; f.vx = Math.abs(f.vx); }
      if (f.x > W - 18) { f.x = W - 18; f.vx = -Math.abs(f.vx); }
      if (f.y < 28) { f.y = 28; f.vy = Math.abs(f.vy); }
      if (f.y > H - 16) { f.y = H - 16; f.vy = -Math.abs(f.vy); }
      if (Math.abs(f.vx) > 0.05) f.dir = f.vx > 0 ? 1 : -1;
    }
    for (let i = food.length - 1; i >= 0; i--) if (food[i].y > H - PX) food.splice(i, 1);
    updateCritters();
    updatePassers();
  }

  // --- 生き物（ドジョウ・タニシ・タナゴ） ---

  function newCritter(species) {
    const c = { species, phase: Math.random() * 6.28, dir: Math.random() < 0.5 ? -1 : 1 };
    if (species === "tanishi") {
      c.x = 30 + Math.random() * (W - 60);
      c.y = H - 10;                              // 底を這う
      c.spd = 0.06 + Math.random() * 0.05;
    } else if (species === "dojo") {
      c.x = 30 + Math.random() * (W - 60);
      c.y = H - 22;                              // 底付近を泳ぐ
      c.vx = c.dir * (0.3 + Math.random() * 0.3);
    } else {                                     // tanago: 中層を泳ぐ
      c.x = 30 + Math.random() * (W - 60);
      c.y = H * 0.35 + Math.random() * H * 0.3;
      c.vx = (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.4);
      c.vy = 0;
    }
    return c;
  }

  function addCritter(species) {
    if (!CRITTER_SPECIES.includes(species)) return;
    critters.push(newCritter(species));
  }

  function updateCritters() {
    for (const c of critters) {
      c.phase += 0.08;
      if (c.species === "tanishi") {
        c.x += c.dir * c.spd;
        c.y = H - 10;
        if (c.x < 16) { c.x = 16; c.dir = 1; }
        if (c.x > W - 16) { c.x = W - 16; c.dir = -1; }
      } else if (c.species === "dojo") {
        if (Math.random() < 0.005) c.vx = -c.vx;     // たまに向きを変える
        c.vx = Math.max(-0.9, Math.min(0.9, c.vx));
        c.x += c.vx;
        c.y = H - 22 + Math.sin(c.phase * 0.5) * 6;   // 底に沿ってゆるく上下
        if (c.x < 18) { c.x = 18; c.vx = Math.abs(c.vx); }
        if (c.x > W - 18) { c.x = W - 18; c.vx = -Math.abs(c.vx); }
        if (Math.abs(c.vx) > 0.05) c.dir = c.vx > 0 ? 1 : -1;
      } else {                                        // tanago: メダカ風の遊泳
        c.vy += Math.sin(c.phase) * 0.02 - (c.y - H * 0.45) * 0.0006;
        if (Math.abs(c.vx) < 0.3) c.vx += (Math.random() - 0.5) * 0.1;
        c.vx = Math.max(-1.4, Math.min(1.4, c.vx * 0.97));
        c.vy = Math.max(-1.0, Math.min(1.0, c.vy * 0.95));
        c.x += c.vx;
        c.y += c.vy;
        if (c.x < 18) { c.x = 18; c.vx = Math.abs(c.vx); }
        if (c.x > W - 18) { c.x = W - 18; c.vx = -Math.abs(c.vx); }
        if (c.y < 30) { c.y = 30; c.vy = Math.abs(c.vy); }
        if (c.y > H - 18) { c.y = H - 18; c.vy = -Math.abs(c.vy); }
        if (Math.abs(c.vx) > 0.05) c.dir = c.vx > 0 ? 1 : -1;
      }
    }
  }

  function drawDojo(c) {
    const bx = Math.round(c.x / PX), by = Math.round(c.y / PX), dir = c.dir;
    const L = 8;
    for (let i = -L; i <= L; i++) {
      const front = i * dir;                          // 頭側で +、尾側で -
      const wig = Math.round(Math.sin(c.phase + i * 0.5) * 1.3);
      const yy = by + wig;
      const thin = front > L - 3 || front < -L + 1;   // 口先と尾は細く
      put(bx + i, yy, "#9c7a44");
      if (!thin) {
        put(bx + i, yy - 1, "#6e5226");               // 背
        put(bx + i, yy + 1, "#c4a060");               // 腹
        if (((i + 99) % 3) === 0) put(bx + i, yy, "#5a3f1c"); // 斑点
      }
    }
    const hx = bx + dir * L;
    const hy = by + Math.round(Math.sin(c.phase + L * 0.5) * 1.3);
    put(hx, hy, "#2a2118");          // 目
    put(hx + dir, hy, "#6e5226");    // 口先
    put(hx + dir, hy + 1, "#6e5226"); // ひげ
    put(hx + dir, hy - 1, "#6e5226"); // ひげ
  }

  function drawTanishi(c) {
    const bx = Math.round(c.x / PX), by = Math.round(c.y / PX), dir = c.dir;
    for (let i = -2; i <= 2; i++) put(bx + i, by + 1, "#b9a98c"); // 足
    put(bx - dir * 3, by + 1, "#cdbfa6");                          // 前に伸びる足
    put(bx + dir * 2, by, "#8a7a5e");                              // 触角
    const shell = [
      [0, -3], [1, -3], [-1, -2], [0, -2], [1, -2], [2, -2],
      [-2, -1], [-1, -1], [0, -1], [1, -1], [2, -1],
      [-2, 0], [-1, 0], [0, 0], [1, 0],
    ];
    for (const [sx, sy] of shell) put(bx + sx, by + sy, "#6b5436");
    put(bx, by - 2, "#8a6e44");      // うずまきハイライト
    put(bx + 1, by - 1, "#8a6e44");
    put(bx - 1, by - 1, "#4d3c24");
  }

  function drawTanago(c) {
    const bx = Math.round(c.x / PX), by = Math.round(c.y / PX), dir = c.dir;
    const rx = 3, ry = 2;
    const base = bx - dir * rx;                       // 尾びれ
    for (let k = 1; k <= 2; k++) {
      const hh = Math.max(0, ry - (k - 1));
      for (let j = -hh; j <= hh; j++) put(base - dir * k, by + j, "#8fb8c8");
    }
    for (let i = -rx; i <= rx; i++) {                 // 胴体
      for (let j = -ry; j <= ry; j++) {
        const e = (i / (rx + 0.3)) ** 2 + (j / (ry + 0.3)) ** 2;
        if (e <= 1) {
          let col = "#cfe0e8";
          if (j < 0) col = "#3a6e8a";                 // 背
          if (j > 0) col = "#eef4f7";                 // 腹
          if (e > 0.78) col = "#2f5a72";              // 縁
          if (j === 0 && i * dir < 1) col = "#e0788f"; // 婚姻色の帯
          put(bx + i, by + j, col);
        }
      }
    }
    put(bx + dir * (rx - 1), by - 1, "#16161c");      // 目
  }

  function drawCritter(c) {
    if (c.species === "tanishi") drawTanishi(c);
    else if (c.species === "dojo") drawDojo(c);
    else drawTanago(c);
  }

  // --- 通過する大型生物（ガー・シーラカンス・カメ） ---

  // 1回の呼び出しで「1種のみ」を選び、その1種を1〜複数匹だけ横切らせる
  function spawnPassers() {
    const species = PASSER_SPECIES[Math.floor(Math.random() * PASSER_SPECIES.length)];
    const dir = Math.random() < 0.5 ? 1 : -1;                  // 進行方向（左右どちらか）
    let count = 1;                                             // たいてい1匹、たまに2〜3匹
    if (Math.random() < 0.4) count++;
    if (Math.random() < 0.15) count++;
    const margin = 120;
    for (let k = 0; k < count; k++) {
      const startX = dir === 1 ? -margin - k * 80 : W + margin + k * 80; // 列をなして登場
      passers.push({
        species,
        dir,
        x: startX,
        y: H * 0.28 + Math.random() * H * 0.42,               // 中層〜やや下を通過
        vx: dir * (0.8 + Math.random() * 0.5),
        phase: Math.random() * 6.28,
      });
    }
  }

  function updatePassers() {
    const margin = 140;
    for (const p of passers) {
      p.phase += 0.1;
      p.x += p.vx;
      p.y += Math.sin(p.phase) * 0.3;                          // ゆったり上下
    }
    // 画面外へ去ったものを除去
    passers = passers.filter((p) => p.x > -margin && p.x < W + margin);
  }

  function drawGar(p) {
    const bx = Math.round(p.x / PX), by = Math.round(p.y / PX), dir = p.dir;
    const rx = 11, ry = 2;
    // 尾びれ
    for (let k = 1; k <= 4; k++) {
      const hh = Math.max(1, ry + 1 - Math.floor(k * 0.4));
      for (let j = -hh; j <= hh; j++) put(bx - dir * (rx + k), by + j, "#4a5a3a");
    }
    // 細長い胴体
    for (let i = -rx; i <= rx; i++) {
      const taper = 1 - Math.abs(i) / (rx + 2);
      const th = Math.max(0, Math.round(ry * taper));
      for (let j = -th; j <= th; j++) {
        let c = "#7c8a5e";
        if (j < 0) c = "#4a5a3a";                              // 背
        if (j >= th) c = "#c2c8a8";                            // 腹
        put(bx + i, by + j, c);
      }
      if (((i + 50) % 4) === 0 && th > 0) put(bx + i, by, "#2e3a22"); // 斑点
    }
    // 長い吻（くちばし状の口）＋歯
    const sx = bx + dir * rx;
    for (let k = 1; k <= 5; k++) {
      put(sx + dir * k, by, "#6e7c52");
      put(sx + dir * k, by + 1, "#5a6644");
    }
    put(sx + dir * 2, by + 2, "#e8e8e0");                      // 歯
    put(sx + dir * 4, by + 2, "#e8e8e0");
    put(bx + dir * (rx - 2), by - 1, "#161610");              // 目
  }

  function drawCoelacanth(p) {
    const bx = Math.round(p.x / PX), by = Math.round(p.y / PX), dir = p.dir;
    const rx = 9, ry = 5;
    // 三つ又の特徴的な尾びれ
    for (let k = 1; k <= 4; k++) {
      put(bx - dir * (rx + k), by - 1, "#3a566a");
      put(bx - dir * (rx + k), by, "#2f4757");
      put(bx - dir * (rx + k), by + 1, "#3a566a");
    }
    put(bx - dir * (rx + 5), by, "#2f4757");                   // 中央の突起
    // ずんぐりした胴体
    for (let i = -rx; i <= rx; i++) {
      for (let j = -ry; j <= ry; j++) {
        const e = (i / (rx + 0.3)) ** 2 + (j / (ry + 0.3)) ** 2;
        if (e <= 1) {
          let c = "#4a6b82";
          if (j > 1) c = "#7fa0b5";                            // 腹
          if (e > 0.8) c = "#33505f";                          // 縁
          if (((i * 3 + j * 5 + 40) % 7) === 0) c = "#d8e4ec"; // 白い斑点
          put(bx + i, by + j, c);
        }
      }
    }
    // ローブ状の対びれ（足のように突き出る）
    put(bx + dir * 2, by + ry + 1, "#3a566a");
    put(bx + dir * 2, by + ry + 2, "#2f4757");
    put(bx - dir * 3, by + ry + 1, "#3a566a");
    put(bx + dir * 3, by - ry - 1, "#3a566a");                 // 背びれ
    put(bx + dir * (rx - 2), by - 1, "#e8e8ee");              // 目（白）
    put(bx + dir * (rx - 2), by - 1, "#101014");              // 瞳
  }

  function drawTurtle(p) {
    const bx = Math.round(p.x / PX), by = Math.round(p.y / PX), dir = p.dir;
    const rx = 7, ry = 4;
    // 甲羅（ドーム状）
    for (let i = -rx; i <= rx; i++) {
      for (let j = -ry; j <= 1; j++) {
        const e = (i / (rx + 0.3)) ** 2 + (j / (ry + 0.3)) ** 2;
        if (e <= 1) {
          let c = "#4f7a3a";
          if (e > 0.78) c = "#355626";                         // 甲羅の縁
          if (((i + 20) % 3 === 0) && j < 0) c = "#3a6029";    // 甲羅の模様
          put(bx + i, by + j, c);
        }
      }
    }
    // 腹甲（下側を明るく）
    for (let i = -rx + 2; i <= rx - 2; i++) put(bx + i, by + 2, "#c7b06a");
    // 頭（進行方向へ）＋赤い斑点（ミドリガメの特徴）
    const hx = bx + dir * (rx + 1);
    put(hx, by, "#4f7a3a");
    put(hx + dir, by, "#5c8a44");
    put(hx, by - 1, "#d23b2b");                                // 耳の赤い線
    put(hx + dir, by - 1, "#101014");                          // 目
    // 四肢（ひれ足）
    put(bx + dir * (rx - 2), by + 3, "#5c8a44");
    put(bx + dir * (rx - 1), by + 3, "#5c8a44");
    put(bx - dir * (rx - 2), by + 3, "#5c8a44");
    put(bx - dir * (rx - 1), by + 3, "#5c8a44");
    // 尾
    put(bx - dir * (rx + 1), by + 1, "#4f7a3a");
  }

  function drawPasser(p) {
    if (p.species === "gar") drawGar(p);
    else if (p.species === "coelacanth") drawCoelacanth(p);
    else drawTurtle(p);
  }

  function draw() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#1b6ea8");
    g.addColorStop(1, "#0d3f63");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "rgba(255,255,255,0.22)";
    for (const b of bubbles) ctx.fillRect(Math.round(b.x / PX) * PX, Math.round(b.y / PX) * PX, PX, PX);

    drawScenery();
    for (const m of marimos) drawMarimo(m); // 水底に居座るマリモ

    for (const p of passers) drawPasser(p); // 魚より先に描く＝金魚たちの後ろを通過

    ctx.fillStyle = "#caa06a";
    for (const p of food) ctx.fillRect(Math.round(p.x / PX) * PX, Math.round(p.y / PX) * PX, PX, PX);

    for (const f of fish) drawFish(f);
    for (const c of critters) drawCritter(c);
  }

  function loop() {
    update();
    draw();
    raf = requestAnimationFrame(loop);
  }

  return { init, setPopulation, feed, addCritter, spawnPassers, setMarimos };
})();
