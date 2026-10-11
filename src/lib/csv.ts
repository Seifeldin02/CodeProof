/**
 * Builds a CSV that opens correctly in spreadsheet tools.
 *
 * Candidate names and repository paths are text a third party chose. A cell that
 * starts with `=`, `+`, `-`, `@`, a tab or a carriage return is treated as a
 * formula by Excel and Sheets, so those cells are prefixed with an apostrophe to
 * keep them as text.
 */

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function csvCell(value: string | number): string {
  const text = String(value);
  const safe = FORMULA_PREFIX.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** A byte-order mark lets Excel read Arabic text as UTF-8. */
export function toCsv(rows: ReadonlyArray<ReadonlyArray<string | number>>): string {
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
