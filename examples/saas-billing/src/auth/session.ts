// @rule(auth.session, critical): Session expires after 24 hours of inactivity
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

// @rule(auth.session, warning, AUTH-12): Maximum 3 concurrent sessions per user
export const MAX_CONCURRENT_SESSIONS = 3;
