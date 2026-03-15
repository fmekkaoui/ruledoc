// @rule(billing.plans): Free plan limited to 50 items
export function checkPlanLimit(count: number) {
  return count <= 50;
}
