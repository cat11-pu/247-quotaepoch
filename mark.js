// mark.js：一条事件的判定（按水位与乱序窗口）
//   mark   —— 该分区当前水位（下一个期望序号）
//   seq    —— 事件序号
//   size   —— 乱序窗口
//   返回 "advance"（含按缺口补齐）/ "retransmit" / "gap" / "out_of_window"
export function classify(mark, seq, size) {
  if (seq < mark) return "retransmit";
  if (seq >= mark + size) return "out_of_window";
  if (seq > mark) return "gap";
  return "advance";
}

export function nextMark(mark, seq) {
  return seq + 1;
}
