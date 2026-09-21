const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates whether a string is a well-formed UUID v4 / v1.
 */
export function isValidUuid(id?: unknown): boolean {
  if (typeof id !== "string") return false;
  return UUID_REGEX.test(id.trim());
}

/**
 * Validates ISO / standard date string (YYYY-MM-DD).
 */
export function isValidDateString(dateStr?: unknown): boolean {
  if (typeof dateStr !== "string") return false;
  const match = /^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim());
  if (!match) return false;
  const date = new Date(dateStr.trim());
  return !isNaN(date.getTime());
}
