// epochrun.js：按预算处理并留账（基线：一律给空表）
import { classify, nextMark } from "./mark.js";

export function step(spec) {
  return { state: spec.state || { epoch: 0, marks: {}, applied: [] }, advanced: 0, retransmitted: 0,
           gaps: 0, handoffs: 0, expired: 0, pending_before: 0, catchup: 0,
           pending_ids: [], judged: 0, judged_bound: 0, full_diff: 0, replay_new: 0,
           window_error_code: "E_OUT_OF_WINDOW" };
}

export function close(spec) {
  return { state: spec.state, catchup: 0 };
}
