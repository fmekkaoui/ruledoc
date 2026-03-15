// @rule(billing.plans, critical): Free plan limited to 50 items
export function checkPlanLimit() {}

// @rule(billing.trial): Trial lasts 14 days
export function getTrialDuration() {}

// @rule(billing.refunds, warning): Refunds only within 30 days
export function canRefund() {}

// @rule(billing.invoices): Invoices generated monthly
export function generateInvoice() {}

// @rule(billing.tax): Tax calculated based on region
export function calculateTax() {}

// @rule(billing.currency): All amounts stored in cents
export function toCents() {}

// @rule(billing.discounts): Max discount is 50 percent
export function applyDiscount() {}

// @rule(billing.proration): Upgrades are prorated daily
export function prorate() {}

// @rule(billing.dunning): Failed payments retried 3 times
export function retryPayment() {}

// @rule(billing.credits): Credits applied before charging card
export function applyCredits() {}

// @rule(billing.grace): 7-day grace period after failed payment
export function checkGracePeriod() {}
