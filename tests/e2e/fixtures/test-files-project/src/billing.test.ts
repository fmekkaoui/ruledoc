// @rule(billing.test-only): This rule should be excluded
import { checkPlanLimit } from "./billing";

test("checkPlanLimit", () => {
  expect(checkPlanLimit(10)).toBe(true);
});
