
export function normalizeHost(host: string): string {
  const lower = host.trim().toLowerCase();
  if (lower.startsWith("[")) return lower.replace(/\]:\d+$/, "]");
  return lower.replace(/:\d+$/, "");
}

/** A rule is valid if it is `*`, an exact host, or a single-`*.` suffix wildcard. */
export function isValidHostRule(rule: string): boolean {
  if (typeof rule !== "string" || rule.length === 0) return false;
  if (rule === "*") return true;
  if (rule.startsWith("*.")) {
    const suffix = rule.slice(2);
    return suffix.length > 0 && !suffix.includes("*");
  }
  return !rule.includes("*");
}

export function hostMatchesRule(host: string, rule: string): boolean {
  const normalized = normalizeHost(host);
  if (rule === "*") return true;
  if (rule.startsWith("*.")) {
    const dotSuffix = rule.slice(1);
    return normalized.endsWith(dotSuffix) && normalized.length > dotSuffix.length;
  }
  return normalized === rule.toLowerCase();
}

export function hostMatchesAny(host: string, rules: readonly string[]): boolean {
  return rules.some((rule) => hostMatchesRule(host, rule));
}
