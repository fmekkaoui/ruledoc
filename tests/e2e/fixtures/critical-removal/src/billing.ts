// @rule(billing.refunds, info): Refunds only within 30 days
export function canRefund(purchaseDate: Date) {
  const days = (Date.now() - purchaseDate.getTime()) / 86400000;
  return days <= 30;
}
