/**
 * Map snake_case keys to camelCase for API responses.
 */

const MAPS = {
  // Object-level map
  user_record: {
    password_hash: undefined, // strip out
  },
};

/**
 * Convert a single row (snake_case → camelCase), stripping excluded keys.
 * @param {object} row - DB row with snake_case keys
 * @returns {object} camelCase-safe object
 */
function rowToCamel(row) {
  const result = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === null || value === undefined) {
      result[toCamel(key)] = null;
      continue;
    }
    if (typeof value === 'string' && key.endsWith('_at')) {
      // Already ISO-8601 string from SQLite; normalise to upper-case Z variant
      result[toCamel(key)] = normaliseUtc(value);
      continue;
    }
    result[toCamel(key)] = value;
  }
  return result;
}

/**
 * Convert an array of DB rows to camelCase.
 */
function rowsToCamel(rows) {
  return rows.map(rowToCamel);
}

/**
 * One-word snake_to_camel conversion.
 */
function toCamel(str) {
  // Simple known-field mapping first
  const fieldMap = {
    user_id: 'userId',
    created_at: 'createdAt',
    updated_at: 'updatedAt',
    due_date: 'dueDate',
    password_hash: 'passwordHash',
  };
  if (fieldMap[str]) return fieldMap[str];
  // Fallback: snake_case → camelCase
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * Normalise an ISO-8601 timestamp that may contain milliseconds with trailing zeros.
 * SQLite strftime gives e.g. "2026-11-03T08:00:00.000Z" which is fine, but we
 * ensure consistent format if timestamps come from other sources.
 */
function normaliseUtc(ts) {
  if (!ts) return ts;
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  return d.toISOString();
}

module.exports = { rowToCamel, rowsToCamel };
