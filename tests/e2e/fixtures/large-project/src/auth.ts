// @rule(auth.session): Session expires after 24 hours
export function isSessionValid() {}

// @rule(auth.password, warning): Minimum 8 characters required
export function validatePassword() {}

// @rule(auth.mfa): MFA required for admin accounts
export function requireMFA() {}

// @rule(auth.lockout, critical): Account locked after 5 failed attempts
export function checkLockout() {}

// @rule(auth.tokens): Refresh tokens valid for 30 days
export function checkRefreshToken() {}

// @rule(auth.oauth): OAuth tokens refreshed automatically
export function refreshOAuth() {}

// @rule(auth.roles): Role hierarchy admin > editor > viewer
export function checkRole() {}

// @rule(auth.permissions): Permissions checked on every request
export function checkPermissions() {}

// @rule(auth.api-keys): API keys hashed with SHA-256
export function hashApiKey() {}

// @rule(auth.rate-limit): Auth endpoints rate limited to 10 req/min
export function rateLimit() {}

// @rule(auth.sso): SSO sessions inherit IdP timeout
export function checkSSO() {}
