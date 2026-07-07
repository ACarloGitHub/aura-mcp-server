const DANGEROUS_PATTERNS: { name: string; regex: RegExp }[] = [
  { name: "rm -rf /",               regex: /\brm\s+(-[rRfF]+\s+)*\/(?:\s|$)/ },
  { name: "format drive",           regex: /\bformat\s+([A-Z]:|\/dev\/)/i },
  { name: "del recursive root",     regex: /\bdel\s+(\/f|\/s|\/q).*?[A-Z]:\\/i },
  { name: "mkfs on device",         regex: /\bmkfs(\.\w+)?\s+\/dev\// },
  { name: "dd writing to device",   regex: /\bdd\s+.*\bof=\/dev\// },
];

export type SafetyResult = { ok: true } | { ok: false; reason: string; pattern: string };

export function checkCommandSafety(command: string): SafetyResult {
  if (typeof command !== "string") {
    return { ok: false, reason: "Command must be a string.", pattern: "(not-a-string)" };
  }
  for (const p of DANGEROUS_PATTERNS) {
    if (p.regex.test(command)) {
      return {
        ok: false,
        reason: `Command matches deny-list pattern: ${p.name}. Set AURA_DISABLE_EXEC_DENYLIST=1 to override (not recommended).`,
        pattern: p.name,
      };
    }
  }
  return { ok: true };
}
