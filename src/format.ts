export type Row = Array<string | number | null | undefined>;

export function table(headers: string[], rows: Row[]): string {
  const cells = rows.map((row) => headers.map((_, i) => cellText(row[i])));
  const widths = headers.map((h, i) => Math.max(h.length, ...cells.map((row) => row[i].length)));
  const line = (values: string[]) =>
    values
      .map((v, i) => (i === values.length - 1 ? v : v.padEnd(widths[i])))
      .join('  ')
      .trimEnd();
  return [line(headers), line(widths.map((w) => '-'.repeat(w))), ...cells.map(line)].join('\n');
}

function cellText(value: Row[number]): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ');
}

export function formatDate(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString().slice(0, 16).replace('T', ' ') + 'Z';
}

export function percent(value: unknown, digits = 2): string {
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toFixed(digits)}%` : '';
}

export function nameOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'name' in value) return String((value as { name: unknown }).name);
  return '';
}
