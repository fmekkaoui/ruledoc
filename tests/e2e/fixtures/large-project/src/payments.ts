// @rule(payments.stripe): Stripe is the primary payment processor
export function processStripe() {}

// @rule(payments.webhook): Webhooks verified with signature
export function verifyWebhook() {}

// @rule(payments.idempotency): All payment operations are idempotent
export function ensureIdempotent() {}

// @rule(payments.retry): Failed webhooks retried with exponential backoff
export function retryWebhook() {}

// @rule(payments.pci, critical): Card numbers never stored in our database
export function checkPCI() {}

// @rule(payments.3ds): 3D Secure required for transactions over 100 EUR
export function check3DS() {}

// @rule(payments.settlement): Settlement occurs T+2 business days
export function settle() {}

// @rule(payments.chargebacks, warning): Chargebacks auto-flagged for review
export function flagChargeback() {}

// @rule(payments.limits): Single transaction limit is 10000 USD
export function checkLimit() {}

// @rule(payments.audit): All transactions logged for audit trail
export function logTransaction() {}

// @rule(payments.currency): Multi-currency via exchange rate service
export function convertCurrency() {}
