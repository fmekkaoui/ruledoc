// @rule(users.signup): Email verification required within 48 hours
export function checkVerification() {}

// @rule(users.profile): Display name max 50 characters
export function validateDisplayName() {}

// @rule(users.avatar): Avatars resized to 256x256
export function resizeAvatar() {}

// @rule(users.deletion, critical): Account deletion has 30-day recovery window
export function deleteAccount() {}

// @rule(users.export): GDPR data export within 72 hours
export function exportData() {}

// @rule(users.merge): Account merge preserves older account data
export function mergeAccounts() {}

// @rule(users.dedup): Duplicate emails blocked at signup
export function checkDuplicate() {}

// @rule(users.onboarding): Onboarding flow required for new accounts
export function startOnboarding() {}

// @rule(users.preferences): Preferences stored per-device
export function savePreferences() {}

// @rule(users.timezone): Timezone auto-detected from browser
export function detectTimezone() {}

// @rule(users.locale): Locale defaults to en-US
export function setLocale() {}
