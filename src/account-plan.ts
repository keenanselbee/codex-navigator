/** Accept bounded Codex plan identifiers without exposing arbitrary native metadata. */
const reserved = new Set(['__proto__', 'constructor', 'prototype']);

export function accountPlan(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 64) return;
  const plan = value.toLowerCase();
  return /^[a-z][a-z0-9_]{0,63}$/.test(plan) && !reserved.has(plan) ? plan : undefined;
}
