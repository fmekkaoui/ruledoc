// @rule(billing.plans, critical): Free plan limited to 50 items
export function checkPlanLimit(count: number) {
  return count <= 50;
}

// @rule(billing.trial): Trial lasts 14 days
export function getTrialDuration() {
  return 14;
}

// @rule(billing.refunds, warning, BILL-42): Refunds only within 30 days
export function canRefund(purchaseDate: Date) {
  const days = (Date.now() - purchaseDate.getTime()) / 86400000;
  return days <= 30;
}
