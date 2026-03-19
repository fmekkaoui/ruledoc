// @rule(billing.refunds, critical): Refunds must be requested within 30 days of purchase
export const REFUND_WINDOW_DAYS = 30;

// @rule(billing.usage, warning): Users exceeding 80% of their plan limit receive a warning email
export const USAGE_WARNING_THRESHOLD = 0.8;
