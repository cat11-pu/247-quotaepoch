import fs from "node:fs";
import { classify, nextMark } from "./mark.js";
import { step, close } from "./epochrun.js";
import { render } from "./app.js";

// 验收断言：上面每条值收进 emit，最后与期望值逐项比对，不符就非零退出。
const __lines = [];
function emit(label, value) { __lines.push([String(label).replace(/ =$/, ""), value]); }


const spec = JSON.parse(fs.readFileSync(process.argv[2] || "sample/epoch.json", "utf8"));
const events = spec.events || [];
const first = step({ state: spec.state, events: events, budget: spec.budget, window: spec.window });
const closed = close({ state: first.state, events: events, window: spec.window });
const half = Math.ceil(events.length / 2);
const r1 = step({ state: spec.state, events: events.slice(0, half), budget: spec.budget, window: spec.window });
const r2 = step({ state: r1.state, events: events.slice(half), budget: spec.budget, window: spec.window });
const closedTwoRound = close({ state: r2.state, events: events, window: spec.window });
const replay = step({ state: closed.state, events: events, budget: spec.budget, window: spec.window });
const wide = step({ state: spec.state, events: events, budget: spec.budget + 2, window: spec.window });
const full = step({ state: spec.state, events: events, budget: events.length + 1, window: spec.window });
const fullClosed = close({ state: full.state, events: events, window: spec.window });
const fingerprint = function (state) {
  return JSON.stringify({ epoch: state.epoch, marks: state.marks, applied: state.applied.length });
};

emit("推进条数 =", first.advanced);
emit("二档推进条数 =", wide.advanced);
emit("重传条数 =", first.retransmitted);
emit("缺口条数 =", first.gaps);
emit("换手次数 =", first.handoffs);
emit("过期条数 =", first.expired);
emit("收尾前压账条数 =", first.pending_before);
emit("收尾补齐条数 =", closed.catchup);
emit("两个预算档推进不同 =", first.advanced !== wide.advanced);
emit("拆两轮中间态不同 =", fingerprint(r2.state) !== fingerprint(first.state));
emit("拆两轮收尾态一致 =", fingerprint(closedTwoRound.state) === fingerprint(closed.state));
emit("重放新增推进 =", replay.advanced);
emit("工作计数未超上界 =", first.judged <= first.judged_bound);
emit("与全量对照差异 =", fingerprint(closed.state) === fingerprint(fullClosed.state) ? 0 : 1);


// ---- 异常路径探针：真调用实现，看它报出什么码（不是从样例里抄）----
try {
  step({ state: { epoch: 1, marks: { 1: 3 }, applied: [] }, events: [{ id: 1, part: 1, seq: 99, epoch: 1 }], budget: 5, window: 4 });
  emit("乱序超窗写错的错误码", "没有报错");
} catch (error) {
  emit("乱序超窗写错的错误码", error && error.code ? error.code : String(error.message));
}
try {
  step({ state: { epoch: 1, marks: {}, applied: [] }, events: [{ id: 1, part: 1, seq: -1, epoch: 1 }], budget: 5, window: 4 });
  emit("事件写错的错误码", "没有报错");
} catch (error) {
  emit("事件写错的错误码", error && error.code ? error.code : String(error.message));
}


// ---- 期望值（参考模型算出，与题面给的验收数值一致）----
const EXPECTED = {
  "推进条数": 7,
  "二档推进条数": 8,
  "重传条数": 1,
  "缺口条数": 2,
  "换手次数": 1,
  "过期条数": 0,
  "收尾前压账条数": 2,
  "收尾补齐条数": 1,
  "两个预算档推进不同": true,
  "拆两轮中间态不同": true,
  "拆两轮收尾态一致": true,
  "重放新增推进": 0,
  "工作计数未超上界": true,
  "与全量对照差异": 0,
  "乱序超窗写错的错误码": "E_OUT_OF_WINDOW",
  "事件写错的错误码": "E_BAD_EVENT"
};
// 有的值在收进来之前已经 stringify 过，比较前先试着解析回来，避免类型错配把正确实现判成不过。
function __same(got, want) {
  if (typeof got === "string") {
    try { const parsed = JSON.parse(got); if (JSON.stringify(parsed) === JSON.stringify(want)) return true; } catch (error) { /* 不是 JSON 就按原文比 */ }
  }
  return JSON.stringify(got) === JSON.stringify(want);
}
let __bad = 0;
for (const [label, want] of Object.entries(EXPECTED)) {
  const found = __lines.find((pair) => pair[0] === label);
  if (!found) { __bad += 1; console.log("缺失验收项 " + label); continue; }
  const got = found[1];
  if (__same(got, want)) { console.log("一致 " + label + " = " + JSON.stringify(got)); }
  else { __bad += 1; console.log("不一致 " + label + " 期望 " + JSON.stringify(want) + " 实际 " + JSON.stringify(got)); }
}

// ---- 七条机检断言（真算、真调；任何一条不成立都算验收失败）----
function probeCode(specForProbe) {
  try {
    step(specForProbe);
    return null; // 真调却没报错，判失败
  } catch (error) {
    return error && error.code ? error.code : null;
  }
}
const machineChecks = [
  ["两档预算推进不同", first.advanced !== wide.advanced],
  ["拆两轮中间态不同而收尾态一致",
    fingerprint(r2.state) !== fingerprint(first.state)
      && fingerprint(closedTwoRound.state) === fingerprint(closed.state)],
  ["重放不再推进", replay.advanced === 0],
  ["工作计数不超事件条数", first.judged <= events.length],
  ["与全量对照为零", fingerprint(closed.state) === fingerprint(fullClosed.state) && first.full_diff === 0],
  ["收尾前账大于零且收尾后归零",
    first.pending_before > 0
      && Array.isArray(closed.state.pending) && closed.state.pending.length === 0],
  ["状态型异常探针真调",
    probeCode({ state: { epoch: 1, marks: { 1: 3 }, applied: [] },
      events: [{ id: 1, part: 1, seq: 99, epoch: 1 }], budget: 5, window: 4 }) === "E_OUT_OF_WINDOW"
      && probeCode({ state: { epoch: 1, marks: {}, applied: [] },
        events: [{ id: 1, part: 1, seq: -1, epoch: 1 }], budget: 5, window: 4 }) === "E_BAD_EVENT"]
];
for (const [name, ok] of machineChecks) {
  if (ok) { console.log("机检通过 " + name); }
  else { __bad += 1; console.log("机检失败 " + name); }
}

console.log("验收项 " + (Object.keys(EXPECTED).length - __bad) + "/" + Object.keys(EXPECTED).length + " 通过");
process.exit(__bad === 0 ? 0 : 1);
