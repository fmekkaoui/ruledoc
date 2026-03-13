// @rule(auth.password): Password must be at least 12 characters
export const MIN_PASSWORD_LENGTH = 12;

// @rule(auth.password, warning, AUTH-31): Passwords expire after 90 days for enterprise accounts
export const PASSWORD_EXPIRY_DAYS = 90;
