export interface InstructionWrap {
  instruction: string;
  body: string;
}

/**
 * Wrap a tool result with an inline instruction prefix.
 * Concatenates the instruction on the first line and the body on the rest.
 * If both are empty, returns an empty string.
 */
export function wrapWithInstruction(text: string, instruction: string): string {
  const instr = instruction.trim();
  const body = text ?? "";
  if (!instr) return body;
  return `[INSTRUCTION: ${instr}]\n\n${body}`;
}

/**
 * Apply LIMITS-aware truncation to a snippet before wrapping.
 */
export function truncateSnippet(s: string, max: number): string {
  if (!s) return s;
  if (s.length <= max) return s;
  const cut = Math.max(0, max - 3);
  return s.substring(0, cut) + "...";
}
