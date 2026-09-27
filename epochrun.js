// epochrun.js：世代水位工作台的批处理
// state：{ epoch, marks: { part: 水位 }, applied: [已判定过的事件 id], pending: [压账事件] }
import { classify, nextMark } from "./mark.js";

function makeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isInt(value) {
  return typeof value === "number" && Number.isInteger(value);
}

function validateEvent(event) {
  if (event === null || typeof event !== "object") {
    throw makeError("E_BAD_EVENT", "事件必须是对象");
  }
  if (!isInt(event.id) || !isInt(event.part) || !isInt(event.seq) || !isInt(event.epoch)) {
    throw makeError("E_BAD_EVENT", "事件字段不合法：id/part/seq/epoch 必须都是整数");
  }
  if (event.part < 0 || event.seq < 0 || event.epoch < 0) {
    throw makeError("E_BAD_EVENT", "事件字段不合法：part/seq/epoch 不能为负");
  }
}

function cloneState(state) {
  const source = state || {};
  return {
    epoch: isInt(source.epoch) ? source.epoch : 0,
    marks: Object.assign({}, source.marks || {}),
    applied: Array.isArray(source.applied) ? source.applied.slice() : [],
    pending: Array.isArray(source.pending) ? source.pending.map(function (event) { return Object.assign({}, event); }) : []
  };
}

function run(spec, unlimited) {
  const state = cloneState(spec.state);
  const events = Array.isArray(spec.events) ? spec.events : [];
  const window = Math.max(0, Number(spec.window) || 0);
  const budget = unlimited ? Infinity : Math.max(0, Number(spec.budget) || 0);

  const stats = { advanced: 0, retransmitted: 0, gaps: 0, handoffs: 0, expired: 0, judged: 0 };
  const appliedSet = new Set(state.applied);

  // 先把上一轮压在账上的事件放回队首，保持到账顺序。
  const queue = state.pending.concat(events);
  state.pending = [];

  for (const event of queue) {
    if (appliedSet.has(event.id)) {
      continue; // 已判定过，重放不重复记账、不花预算
    }
    validateEvent(event);
    if (!unlimited && stats.judged >= budget) {
      state.pending.push(event);
      continue;
    }
    stats.judged += 1;
    appliedSet.add(event.id);

    if (event.epoch > state.epoch) {
      state.epoch = event.epoch;
      state.marks = {};
      stats.handoffs += 1;
    } else if (event.epoch < state.epoch) {
      stats.expired += 1;
      continue;
    }

    const part = event.part;
    const mark = Object.prototype.hasOwnProperty.call(state.marks, part) ? state.marks[part] : 0;
    const kind = classify(mark, event.seq, window);
    if (kind === "retransmit") {
      stats.retransmitted += 1;
    } else if (kind === "out_of_window") {
      throw makeError("E_OUT_OF_WINDOW",
        "序号 " + event.seq + " 超出乱序窗口（水位 " + mark + "，窗口 " + window + "）");
    } else {
      if (kind === "gap") {
        stats.gaps += event.seq - mark;
      }
      state.marks[part] = nextMark(mark, event.seq);
      stats.advanced += 1;
    }
  }

  state.applied = Array.from(appliedSet);
  return {
    state: state,
    advanced: stats.advanced,
    retransmitted: stats.retransmitted,
    gaps: stats.gaps,
    handoffs: stats.handoffs,
    expired: stats.expired,
    pending_before: 0,
    pending_ids: [],
    catchup: 0,
    judged: stats.judged,
    judged_bound: events.length
  };
}

export function step(spec) {
  const source = spec || {};
  const carried = Array.isArray(source.state && source.state.pending) ? source.state.pending : [];
  const result = run(source, false);
  result.pending_before = result.state.pending.length;
  result.pending_ids = result.state.pending.map(function (event) { return event.id; });
  result.judged_bound = (Array.isArray(source.events) ? source.events.length : 0) + carried.length;
  return result;
}

export function close(spec) {
  const source = spec || {};
  const result = run(source, true);
  return {
    state: result.state,
    catchup: result.advanced,
    advanced: result.advanced,
    retransmitted: result.retransmitted,
    gaps: result.gaps,
    handoffs: result.handoffs,
    expired: result.expired,
    judged: result.judged,
    pending_ids: result.state.pending.map(function (event) { return event.id; })
  };
}
