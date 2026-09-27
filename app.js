// app.js：渲染结果
import { classify, nextMark } from "./mark.js";
import { step, close } from "./epochrun.js";

export function render(spec) {
  const events = spec.events || [];
  const first = step({ state: spec.state, events: events, budget: spec.budget, window: spec.window });
  const closed = close({ state: first.state, events: events, window: spec.window });
  const half = Math.ceil(events.length / 2);
  const r1 = step({ state: spec.state, events: events.slice(0, half), budget: spec.budget, window: spec.window });
  const r2 = step({ state: r1.state, events: events.slice(half), budget: spec.budget, window: spec.window });
  const closedTwoRound = close({ state: r2.state, events: events, window: spec.window });
  const replay = step({ state: closed.state, events: events, budget: spec.budget, window: spec.window });
  const full = step({ state: spec.state, events: events, budget: events.length + 1, window: spec.window });
  const fullClosed = close({ state: full.state, events: events, window: spec.window });
  const fingerprint = function (state) {
    return JSON.stringify({ epoch: state.epoch, marks: state.marks, applied: state.applied.length });
  };
  return { advanced: first.advanced, retransmitted: first.retransmitted, gaps: first.gaps,
           handoffs: first.handoffs, expired: first.expired, pending_before: first.pending_before,
           pending_ids: first.pending_ids, catchup: closed.catchup,
           budget_pair_differs: first.advanced !== step({ state: spec.state, events: events, budget: spec.budget + 2, window: spec.window }).advanced,
           two_round_mid_differs: fingerprint(r2.state) !== fingerprint(first.state),
           two_round_closed_equal: fingerprint(closedTwoRound.state) === fingerprint(closed.state),
           replay_new: replay.advanced, judged: first.judged, judged_bound: first.judged_bound,
           full_diff: fingerprint(closed.state) === fingerprint(fullClosed.state) ? 0 : 1,
           count: events.length, tail: classify(0, 0, 4) };
}
