// @rule(billing.plans, critical): Free plan is limited to 100 API requests per day
export const FREE_PLAN_DAILY_LIMIT = 100;

// @rule(billing.plans, critical): Pro plan allows up to 10,000 API requests per day
export const PRO_PLAN_DAILY_LIMIT = 10_000;

// @rule(billing.plans, BILL-47): Trial period lasts 14 days with full Pro features
export const TRIAL_PERIOD_DAYS = 14;
