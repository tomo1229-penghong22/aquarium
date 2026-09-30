// 魚の種類と、種ごとのデータ(サイズ・速さ・適温・色・説明文など)。ほかのモジュールに依存しない。
/* ---------------- 魚の種類 ---------------- */
export const SPECIES = {
  neon:  { name:"ネオンテトラ",         len:38, speed:62, school:0.9, zone:[0.30,0.72], opt:[22.5,26.5], max:30, def:12, wag:0.28, wagRate:1.3, alpha:0.8, variants:1 },
  rummy: { name:"ラミーノーズテトラ",   len:42, speed:66, school:0.95,zone:[0.25,0.65], opt:[24,28],     max:20, def:0,  wag:0.28, wagRate:1.3, alpha:0.8, variants:1 },
  guppy: { name:"グッピー",             len:30, speed:48, school:0.25,zone:[0.06,0.50], opt:[22,28],     max:15, def:5,  wag:0.34, wagRate:1.0, alpha:0.86, variants:4 },
  platy: { name:"プラティ",             len:44, speed:44, school:0.2, zone:[0.15,0.62], opt:[21,27],     max:12, def:3,  wag:0.26, wagRate:1.0, alpha:0.9, variants:3 },
  angel: { name:"エンゼルフィッシュ",   len:60, speed:30, school:0.05,zone:[0.20,0.60], opt:[24,29],     max:6,  def:2,  wag:0.16, wagRate:0.7, alpha:0.84, variants:2 },
  cory:  { name:"コリドラス・パンダ",   len:40, speed:34, school:0.3, zone:[0.9,1.0],   opt:[21,26],     max:12, def:4,  wag:0.3,  wagRate:1.4, alpha:0.9, variants:1 },
};
export const ORDER = ["neon","rummy","guppy","platy","angel","cory"];
export const GUPPY_COL = [["#ff6a2a","#ffd24a"],["#2c6fe0","#8fd8ff"],["#d8262e","#ff9a8a"],["#7b3fd0","#43c0e8"]];
export const PLATY_COL = [{b:"#e0412b",t:"#c93320"},{b:"#f39a2a",t:"#222222"},{b:"#f2c533",t:"#eab22a"}];

/* ---- ポップアップ用のデータ(種ごとの説明文と拡大時の体長) ---- */
export const NOTES = {
  neon: "青いラインは、うろこの中の小さな結晶が光を反射して輝く構造色です。群れで泳ぐのが好きです。",
  rummy: "赤い鼻先は、体調や水質が合っているときほど鮮やかになるといわれます。",
  guppy: "オスは大きな尾びれが自慢です。品種によって色も模様もさまざまです。",
  platy: "丈夫で人なつこく、水面に落ちた餌もよくつつきます。",
  angel: "長いひれを広げて、ゆったりと優雅に泳ぐシクリッドの仲間です。",
  cory: "底の砂をつつく働き者です。目をくるっと回す、いわゆる「ウインク」をします。",
};
export const POP_L = { neon: 150, rummy: 148, guppy: 104, platy: 136, angel: 66, cory: 146 };
