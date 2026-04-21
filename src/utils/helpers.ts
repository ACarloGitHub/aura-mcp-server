// Utility functions for the MCP server

export function truncateText(text: string, maxLength: number, suffix = "..."): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - suffix.length) + suffix;
}

export function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  return lastDot === -1 ? "" : filename.substring(lastDot).toLowerCase();
}

export function isAbsolutePath(path: string): boolean {
  return path.startsWith("/") || (path.length > 1 && path[1] === ":");
}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+/g, "/");
}
