// @rule(auth.session): Session expires after 24 hours
export function isSessionValid(createdAt: Date) {
  const hours = (Date.now() - createdAt.getTime()) / 3600000;
  return hours < 24;
}

// @rule(auth.password, warning): Minimum 8 characters required
export function validatePassword(password: string) {
  return password.length >= 8;
}
