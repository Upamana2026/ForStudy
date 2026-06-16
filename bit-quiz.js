// bit-quiz.js — FE科目B「ビット操作・スタック」問題の生成
// 「基本情報技術者科目Bビット操作.py」(CLI版) の3パターンを移植し、4択化したもの。
// quiz.js のヘルパ(rint/pick/shuffle/makeChoices)を利用するため、quiz.jsの後に読み込むこと。

// パターン1: mod を使ったビット抽出
function qBit1() {
  const opt = pick([
    { bits: 4, val: 16, name: "下位4ビット" },
    { bits: 3, val: 8, name: "下位3ビット" },
    { bits: 5, val: 32, name: "下位5ビット" },
    { bits: 6, val: 64, name: "下位6ビット" },
  ]);
  const v = pick(["value", "data", "code", "target"]);
  const q =
    `引数で渡された8ビットの整数型変数 ${v} の${opt.name}を抽出し、整数値として返す関数 getBits である。\n\n` +
    `[プログラム]\n` +
    `○整数型: getBits(整数型: ${v})\n` +
    `整数型: result\n` +
    `result ← ${v} mod [ a ]\n` +
    `return result\n\n` +
    `プログラム中の [ a ] に入れる適切な数値はどれか。`;
  const ans = String(opt.val);
  const distract = [opt.bits, opt.val * 2, opt.val / 2 > 0 ? opt.val / 2 : 256];
  return { question: q, answer: ans, choices: makeChoices(ans, distract, { count: 4, numericBase: opt.val }) };
}

// パターン2: 掛け算・割り算によるビットシフト
function qBit2() {
  const shiftType = pick(["left", "right"]);
  const bits = rint(1, 4);
  const val = 2 ** bits;
  let v, q;
  if (shiftType === "left") {
    v = pick(["code", "num", "val", "x"]);
    q =
      `引数で渡された整数型変数 ${v} を左に ${bits} ビットシフトした値（あふれた上位ビットは破棄し、空いた下位ビットには0を挿入）を取得したい。\n` +
      `ビットシフト演算子の代わりに掛け算を用いる場合、プログラム中の [ a ] に入れる適切な数値はどれか。\n\n` +
      `[プログラム]\n` +
      `○整数型: shiftLeft(整数型: ${v})\n` +
      `整数型: result\n` +
      `result ← ${v} × [ a ]\n` +
      `return result`;
  } else {
    v = pick(["code", "num", "val", "x"]);
    q =
      `引数で渡された整数型変数 ${v} の上位ビットを右に ${bits} ビットシフトした値（下位ビットは切り捨て）を取得したい。\n` +
      `ビットシフト演算子の代わりに整数商（div）を用いる場合、プログラム中の [ a ] に入れる適切な数値はどれか。\n\n` +
      `[プログラム]\n` +
      `○整数型: shiftRight(整数型: ${v})\n` +
      `整数型: result\n` +
      `result ← ${v} div [ a ]\n` +
      `return result`;
  }
  const ans = String(val);
  const distract = [bits, val * 2, bits * 2];
  return { question: q, answer: ans, choices: makeChoices(ans, distract, { count: 4, numericBase: val }) };
}

// パターン3: スタックの満杯・空判定の境界値
function qBit3() {
  const size = pick([4, 5, 8, 10]);
  const opType = pick(["push", "pop"]);
  let q, ans, distract;
  if (opType === "push") {
    q =
      `要素数が ${size} である配列 stack と、次に要素を格納する位置を示す変数 stackPos を用いてスタックを表現する。要素番号は1から始まる。\n` +
      `初期状態では stackPos は1である。関数 push は、引数 data をスタックに格納する。\n` +
      `満杯で格納できない場合は false を返す。ただし、配列の領域外を参照してはならない。\n\n` +
      `[プログラム]\n` +
      `○論理型: push(整数型: data)\n` +
      `if ([ a ])\n` +
      `    stack[stackPos] ← data\n` +
      `    stackPos ← stackPos ＋ 1\n` +
      `    return true\n` +
      `else\n` +
      `    return false\n` +
      `endif`;
    ans = `stackPos ≦ ${size}`;
    distract = [`stackPos ＜ ${size}`, `stackPos ≦ ${size + 1}`, `stackPos ＞ 1`];
  } else {
    q =
      `要素数が ${size} である配列 stack と、次に要素を格納する位置を示す変数 stackPos を用いてスタックを表現する。要素番号は1から始まる。\n` +
      `スタックが空のとき、stackPos の値は1である。関数 pop は、スタックから値を取り出して返す。\n` +
      `スタックが空のときは未定義の値を返す。\n\n` +
      `[プログラム]\n` +
      `○整数型: pop()\n` +
      `整数型: popData ← 未定義の値\n` +
      `if ([ a ])\n` +
      `    stackPos ← stackPos − 1\n` +
      `    popData ← stack[stackPos]\n` +
      `endif\n` +
      `return popData`;
    ans = `stackPos ＞ 1`;
    distract = [`stackPos ≧ 1`, `stackPos ＜ ${size}`, `stackPos ≠ 0`];
  }
  return { question: q, answer: ans, choices: makeChoices(ans, distract, { count: 4 }) };
}

const BIT_PATTERNS = [qBit1, qBit2, qBit3];

function generateBitQuestion() {
  return pick(BIT_PATTERNS)();
}
