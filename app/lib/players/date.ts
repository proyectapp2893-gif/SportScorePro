/** Normalize roster birth dates to the API's canonical YYYY-MM-DD format. */
export function normalizePlayerBirthDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  const source = String(value ?? '').trim();
  if (!source) return '';
  const numeric = Number(source);
  if (Number.isFinite(numeric) && numeric > 1 && numeric < 80000 && !/^\d{4}$/.test(source) && !/^\d{8}$/.test(source)) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(numeric) * 86400000);
    if (!Number.isNaN(date.getTime())) return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  }
  const valid = (year: number, month: number, day: number) => {
    const date = new Date(year, month - 1, day);
    return year >= 1900 && year <= new Date().getFullYear() && month >= 1 && month <= 12 && day >= 1 && day <= 31 && date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  };
  const candidates: Array<[number, number, number]> = [];
  const separated = source.match(/^(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})$/);
  const digits = source.replace(/\D/g, '');
  if (separated) {
    const first = Number(separated[1]); const second = Number(separated[2]); const third = Number(separated[3]);
    if (separated[1].length === 4) candidates.push([first, second, third], [first, third, second]);
    else if (separated[3].length === 4) candidates.push([third, second, first], [third, first, second]);
  } else if (digits.length === 8) {
    candidates.push([Number(digits.slice(4)), Number(digits.slice(2, 4)), Number(digits.slice(0, 2))], [Number(digits.slice(0, 4)), Number(digits.slice(4, 6)), Number(digits.slice(6))]);
  }
  const result = candidates.find(([year, month, day]) => valid(year, month, day));
  return result ? `${String(result[0]).padStart(4, '0')}-${String(result[1]).padStart(2, '0')}-${String(result[2]).padStart(2, '0')}` : '';
}
