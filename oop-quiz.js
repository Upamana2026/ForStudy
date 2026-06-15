// oop-quiz.js — FE科目B「オブジェクト指向」問題の生成
// Gemini作のPython版5パターンを移植し、4択化したもの。
// quiz.js のヘルパ(rint/pick/shuffle/makeChoices)を利用するため、quiz.jsの後に読み込むこと。

const CLASS_TEMPLATES = [
  { name: "Player", f1: "hp", f2: "mp", m1: "damage", m2: "heal" },
  { name: "Car", f1: "gas", f2: "speed", m1: "drive", m2: "refuel" },
  { name: "Robot", f1: "battery", f2: "power", m1: "action", m2: "charge" },
  { name: "Bank", f1: "balance", f2: "id", m1: "withdraw", m2: "deposit" },
];

// パターン1: 基本的なインスタンス化とドット記法（計算）
function qOop1() {
  const t = pick(CLASS_TEMPLATES);
  const v1 = rint(40, 80), v2 = rint(5, 20);
  const ans = String(v1 + v2);
  const q =
    `クラス ${t.name} には、整数型のメンバ変数 ${t.f1} が定義されている。\n` +
    `次のプログラムを実行したとき、obj.${t.f1} の値は最終的にいくつになりますか。\n\n` +
    `obj ← new ${t.name}()\n` +
    `obj.${t.f1} ← ${v1}\n` +
    `obj.${t.f1} ← obj.${t.f1} ＋ ${v2}`;
  const distract = [v1, v2, v1 - v2];
  return { question: q, answer: ans, choices: makeChoices(ans, distract, { count: 4, numericBase: v1 + v2 }) };
}

// パターン2: 参照の代入の罠（同じ実体を指す）
function qOop2() {
  const t = pick(CLASS_TEMPLATES);
  const v1 = rint(50, 100), v2 = rint(10, 40);
  const ans = String(v2); // obj2を書き換えるとobj1も同じ実体なのでv2になる
  const q =
    `クラス ${t.name} には、整数型のメンバ変数 ${t.f1} が定義されている。\n` +
    `次のプログラムを実行したとき、obj1.${t.f1} の値は最終的にいくつになりますか。\n\n` +
    `obj1 ← new ${t.name}()\n` +
    `obj1.${t.f1} ← ${v1}\n` +
    `obj2 ← obj1\n` +
    `obj2.${t.f1} ← ${v2}`;
  const distract = [v1, v1 + v2, v1 - v2];
  return { question: q, answer: ans, choices: makeChoices(ans, distract, { count: 4, numericBase: v2 }) };
}

// パターン3: メソッド呼び出し（引数なしの内部更新・減算）
function qOop3() {
  const t = pick(CLASS_TEMPLATES);
  const v1 = rint(10, 30), v2 = rint(5, 15);
  const ans = String(v1 - v2);
  const q =
    `クラス ${t.name} には、整数型のメンバ変数 ${t.f1} が定義されている。\n` +
    `また、呼び出されると ${t.f1} の値を ${v2} 減少させるメソッド ${t.m1}() が定義されている。\n` +
    `次のプログラムを実行したとき、obj.${t.f1} の値は最終的にいくつになりますか。\n\n` +
    `obj ← new ${t.name}()\n` +
    `obj.${t.f1} ← ${v1}\n` +
    `call obj.${t.m1}()`;
  const distract = [v1, v2, v1 + v2];
  return { question: q, answer: ans, choices: makeChoices(ans, distract, { count: 4, numericBase: v1 - v2 }) };
}

// パターン4: メソッド呼び出し（引数ありの内部更新・加算）
function qOop4() {
  const t = pick(CLASS_TEMPLATES);
  const v1 = rint(20, 50), v2 = rint(10, 30);
  const ans = String(v1 + v2);
  const q =
    `クラス ${t.name} には、整数型のメンバ変数 ${t.f1} が定義されている。\n` +
    `また、引数で受け取った数値を ${t.f1} に加算するメソッド ${t.m2}(value) が定義されている。\n` +
    `次のプログラムを実行したとき、obj.${t.f1} の値は最終的にいくつになりますか。\n\n` +
    `obj ← new ${t.name}()\n` +
    `obj.${t.f1} ← ${v1}\n` +
    `call obj.${t.m2}(${v2})`;
  const distract = [v1, v2, v1 - v2];
  return { question: q, answer: ans, choices: makeChoices(ans, distract, { count: 4, numericBase: v1 + v2 }) };
}

// パターン5: コンストラクタによる初期化（newの引数）
function qOop5() {
  const t = pick(CLASS_TEMPLATES);
  const v1 = rint(100, 200), v2 = rint(10, 50);
  const ans = String(v1); // 第1引数がf1の初期値
  const q =
    `クラス ${t.name} のコンストラクタは、第1引数に ${t.f1} の初期値を、` +
    `第2引数に ${t.f2} の初期値を受け取って設定するよう定義されている。\n` +
    `次のプログラムを実行したとき、obj.${t.f1} の値は最終的にいくつになりますか。\n\n` +
    `obj ← new ${t.name}(${v1}, ${v2})`;
  const distract = [v2, v1 + v2, v1 - v2];
  return { question: q, answer: ans, choices: makeChoices(ans, distract, { count: 4, numericBase: v1 }) };
}

const OOP_PATTERNS = [qOop1, qOop2, qOop3, qOop4, qOop5];

function generateOOPQuestion() {
  return pick(OOP_PATTERNS)();
}
