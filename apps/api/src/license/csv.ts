/**
 * Minimal zero-dependency CSV parser (RFC 4180-ish) for the allocation import
 * (ADR-0004 — CSV over an xlsx parser dep, H2). Handles quoted fields with
 * embedded commas, quotes ("") and newlines; trims a trailing blank line and
 * a leading BOM. Not a general CSV library — just enough for the O365 matrix.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  // Strip UTF-8 BOM Excel prepends on export.
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++; // escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      // Close the field/row on LF; swallow a CRLF pair.
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  // Flush the final field/row unless the input ended exactly on a newline.
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
