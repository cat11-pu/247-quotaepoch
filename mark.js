// mark.js：一条事件的判定（基线：一律给推进）
export function classify(mark, seq, size) {
  return "advance";
}

export function nextMark(mark, seq) {
  return seq + 1;
}
