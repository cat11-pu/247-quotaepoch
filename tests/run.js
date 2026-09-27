import assert from "node:assert";
import { classify, nextMark } from "../mark.js";
import { step, close } from "../epochrun.js";
import { render } from "../app.js";

let failed = 0;
function check(name, fn) {
  try { fn(); console.log("ok " + name); } catch (e) { failed += 1; console.log("FAIL " + name + " :: " + e.message); }
}

check("classify returns a kind", () => {
  assert.strictEqual(typeof classify(0, 0, 4), "string");
});

check("nextMark returns a number", () => {
  assert.strictEqual(typeof nextMark(0, 0), "number");
});

check("step returns a state", () => {
  assert.strictEqual(typeof step({ state: { epoch: 1, marks: {}, applied: [] }, events: [], budget: 1, window: 4 }).state, "object");
});

check("close returns a state", () => {
  assert.strictEqual(typeof close({ state: { epoch: 1, marks: {}, applied: [] }, events: [], window: 4 }).state, "object");
});

check("render exposes budget flag", () => {
  assert.strictEqual(typeof render({ state: { epoch: 1, marks: {}, applied: [] }, events: [], budget: 1, window: 4 }).budget_pair_differs, "boolean");
});

console.log("5 cases, " + failed + " failed");
process.exit(failed === 0 ? 0 : 1);
