// quiz.js — FE擬似言語クイズの問題生成
// Gemini作のPython版5パターンを移植し、4択化したもの。

const VAR_NAMES = ["flag", "status", "sw", "cond", "is_valid", "keep_going", "mode"];

const rint = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 正解＋ダミーから重複なしの選択肢を作る。数値の場合は近傍値で不足分を補完。
function makeChoices(correct, distractors, opts = {}) {
  const want = opts.count || 4;
  const out = [];
  const seen = new Set();
  const add = (v) => {
    const s = String(v);
    if (!seen.has(s)) { seen.add(s); out.push(s); }
  };
  add(correct);
  for (const d of distractors) add(d);
  if (opts.numericBase !== undefined) {
    let delta = 1;
    while (out.length < want && delta < 60) {
      add(opts.numericBase + delta);
      add(opts.numericBase - delta);
      delta++;
    }
  }
  return shuffle(out.slice(0, want));
}

// パターン1: if (not flag) の一発判定
function qPattern1() {
  const v = pick(VAR_NAMES);
  const initVal = pick([true, false]);
  const initStr = initVal ? "true" : "false";
  const ans = !initVal ? "10" : "20";
  const q =
    `${v} ← ${initStr}\n` +
    `if (not ${v})\n` +
    `    x ← 10\n` +
    `else\n` +
    `    x ← 20\n` +
    `endif\n\n` +
    `上記プログラムを実行したとき、変数 x の最終的な値はいくつになりますか。`;
  return { question: q, answer: ans, choices: makeChoices(ans, ["10", "20", "0", "30"], { count: 4 }) };
}

// パターン2: 複数変数のリアルタイム連動更新
function qPattern2() {
  const xInit = rint(1, 5), yInit = rint(1, 5), add = rint(1, 3), coeff = rint(2, 4);
  const xNext = yInit + add;
  const yNext = xNext * coeff;
  const ans = String(yNext);
  const q =
    `x ← ${xInit}\n` +
    `y ← ${yInit}\n` +
    `x ← y ＋ ${add}\n` +
    `y ← x × ${coeff}\n\n` +
    `上記プログラムを実行したとき、変数 y の最終的な値はいくつになりますか。`;
  const distract = [xNext, (xInit + add) * coeff, yInit * coeff, xNext + coeff];
  return { question: q, answer: ans, choices: makeChoices(ans, distract, { count: 4, numericBase: yNext }) };
}

// パターン3: 配列のリアルタイム動的書き換え
function qPattern3() {
  const base = rint(1, 5), add = rint(1, 4);
  const B = [base, base + 2, base + 4];
  const Bnew = [B[0], B[0] + add, 0];
  Bnew[2] = Bnew[1] + add;
  const fmt = (a) => `[${a.join(", ")}]`;
  const ans = fmt(Bnew);
  const q =
    `要素数 3 の配列 B の初期値が ${fmt(B)} であり、添字が 1 から始まるとき、` +
    `次のプログラムを実行した後の配列 B の状態として正しいものはどれですか。\n\n` +
    `for (i を 1 から 2 まで 1 ずつ増やす)\n` +
    `    B[i+1] ← B[i] ＋ ${add}\n` +
    `endfor`;
  const wrong1 = [B[0], B[0] + add, B[1] + add];          // 更新前のB[i]を使ってしまうミス
  const wrong2 = [B[0], B[1] + add, B[2] + add];          // 全要素にadd
  const wrong3 = [B[0] + add, B[1] + add, B[2] + add];    // 先頭にもadd
  return { question: q, answer: ans, choices: makeChoices(ans, [fmt(wrong1), fmt(wrong2), fmt(wrong3)], { count: 4 }) };
}

// パターン4: ループによる連続論理反転（性質上2択）
function qPattern4() {
  const v = pick(["flag", "status", "cond", "is_valid", "keep_going", "mode"]);
  const initVal = pick([true, false]);
  const initStr = initVal ? "true" : "false";
  const loops = pick([2, 3, 4]);
  let curr = initVal;
  for (let i = 0; i < loops; i++) curr = !curr;
  const ans = curr ? "true" : "false";
  const q =
    `${v} ← ${initStr}\n` +
    `for (i を 1 から ${loops} まで 1 ずつ増やす)\n` +
    `    ${v} ← not ${v}\n` +
    `endfor\n\n` +
    `上記プログラムを実行したとき、変数 ${v} の最終的な真偽値はどちらになりますか。`;
  return { question: q, answer: ans, choices: shuffle(["true", "false"]) };
}

// パターン5: whileループと終了フラグの境界値
function qPattern5() {
  const v = pick(["is_end", "keep_going", "finished"]);
  const kInit = rint(1, 2), add = rint(2, 3), threshold = rint(4, 6);
  let k = kInit, flag = false;
  while (!flag) {
    k += add;
    if (k > threshold) flag = true;
  }
  const ans = String(k);
  const q =
    `${v} ← false\n` +
    `k ← ${kInit}\n` +
    `while (not ${v})\n` +
    `    k ← k ＋ ${add}\n` +
    `    if (k ＞ ${threshold})\n` +
    `        ${v} ← true\n` +
    `    endif\n` +
    `endwhile\n\n` +
    `上記プログラムを実行したとき、終了直後の変数 k の値はいくつになりますか。`;
  const distract = [k - add, threshold, k + add, k - 2 * add].filter((x) => x > 0);
  return { question: q, answer: ans, choices: makeChoices(ans, distract, { count: 4, numericBase: k }) };
}

const PATTERNS = [qPattern1, qPattern2, qPattern3, qPattern4, qPattern5];

function generateQuestion() {
  return pick(PATTERNS)();
}
