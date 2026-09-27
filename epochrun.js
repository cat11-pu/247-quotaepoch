// epochrun.js：按预算处理一批事件，用尽的预算变成账（pending），收尾再清账
import { classify, nextMark } from "./mark.js";

function codedError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

// 跨轮状态：epoch 世代；marks 各分区水位；applied 已处理事件 id 集合；pending 压账事件
function adoptState(state) {
  const source = state || {};
  return {
    epoch: Number.isSafeInteger(source.epoch) && source.epoch >= 0 ? source.epoch : 0,
    marks: Object.assign({}, source.marks || {}),
    applied: Array.isArray(source.applied) ? source.applied.slice() : [],
    pending: Array.isArray(source.pending) ? source.pending.map((event) => event) : []
  };
}

function validateEvent(event) {
  if (event === null || typeof event !== "object") {
    throw codedError("E_BAD_EVENT", "事件必须是对象");
  }
  if (!isCount(event.id) || !isCount(event.part) || !isCount(event.seq) || !isCount(event.epoch)) {
    throw codedError("E_BAD_EVENT", "事件字段 id/part/seq/epoch 必须是非负整数");
  }
}

// 判定并落一条事件；返回 true 表示水位被推进（含缺口补齐）
function judge(state, event, size, counters) {
  if (event.epoch > state.epoch) {
    state.epoch = event.epoch;
    state.marks = {};
    counters.handoffs += 1;
  } else if (event.epoch < state.epoch) {
    counters.expired += 1;
    return false;
  }

  const key = String(event.part);
  const mark = Number.isSafeInteger(state.marks[key]) ? state.marks[key] : 0;
  const kind = classify(mark, event.seq, size);
  if (kind === "out_of_window") {
    throw codedError("E_OUT_OF_WINDOW",
      "序号 " + event.seq + " 超出分区 " + event.part + " 的乱序窗口（水位 " + mark + "，窗口 " + size + "）");
  }
  if (kind === "retransmit") {
    counters.retransmitted += 1;
    return false;
  }
  if (kind === "gap") {
    counters.gaps += event.seq - mark;
  }
  state.marks[key] = nextMark(mark, event.seq);
  counters.advanced += 1;
  return true;
}

export function step(spec) {
  const incoming = Array.isArray(spec.events) ? spec.events : [];
  const size = Number.isSafeInteger(spec.window) ? spec.window : 0;
  const state = adoptState(spec.state);

  const counters = { advanced: 0, retransmitted: 0, gaps: 0, handoffs: 0, expired: 0 };
  const queue = state.pending.concat(incoming);
  state.pending = [];

  let budget = Number.isFinite(spec.budget) ? Math.floor(spec.budget) : 0;
  let judged = 0;

  for (const event of queue) {
    if (judged >= budget) {
      state.pending.push(event);
      continue;
    }
    validateEvent(event);
    judge(state, event, size, counters);
    if (state.applied.indexOf(event.id) === -1) state.applied.push(event.id);
    judged += 1;
  }

  return {
    state,
    advanced: counters.advanced,
    retransmitted: counters.retransmitted,
    gaps: counters.gaps,
    handoffs: counters.handoffs,
    expired: counters.expired,
    pending_before: state.pending.length,
    pending_ids: state.pending.map((event) => event.id),
    catchup: 0,
    judged,
    judged_bound: queue.length,
    full_diff: 0,
    replay_new: 0,
    window_error_code: "E_OUT_OF_WINDOW"
  };
}

// 收尾：不限预算把账清完
export function close(spec) {
  const size = Number.isSafeInteger(spec.window) ? spec.window : 0;
  const state = adoptState(spec.state);
  const counters = { advanced: 0, retransmitted: 0, gaps: 0, handoffs: 0, expired: 0 };

  const queue = state.pending;
  state.pending = [];
  let catchup = 0;
  for (const event of queue) {
    validateEvent(event);
    if (judge(state, event, size, counters)) catchup += 1;
    if (state.applied.indexOf(event.id) === -1) state.applied.push(event.id);
  }

  return { state, catchup };
}
