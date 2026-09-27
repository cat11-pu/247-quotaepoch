// mark.js：按水位判定一条事件的类别
//   advance       序号正好接在水位上，推进
//   retransmit    序号落在水位之前，重传
//   gap           序号领先水位但还在乱序窗口内，按缺口记账并推进
//   out_of_window 序号不小于水位加窗口，乱序超窗
export function classify(mark, seq, size) {
  const base = Number.isFinite(Number(mark)) ? Number(mark) : 0;
  const window = Math.max(0, Number.isFinite(Number(size)) ? Number(size) : 0);
  if (seq < base) return "retransmit";
  if (seq >= base + window) return "out_of_window";
  if (seq > base) return "gap";
  return "advance";
}

export function nextMark(mark, seq) {
  return seq + 1;
}
