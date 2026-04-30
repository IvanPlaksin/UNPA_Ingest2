export function generateSessionId() {
  return 'sess-' + Math.random().toString(36).slice(2, 10);
}
