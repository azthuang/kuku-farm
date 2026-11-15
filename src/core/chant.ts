const DIGITS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

/** Chinese numeral for 1..81; 10 reads 一十 (chant style). */
export function toChineseNumber(n: number): string {
  if (n < 10) return DIGITS[n];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  if (n < 20 && ones !== 0) return '十' + DIGITS[ones];
  return DIGITS[tens] + '十' + DIGITS[ones];
}

export function questionText(a: number, b: number): string {
  return `${toChineseNumber(a)}乘${toChineseNumber(b)}`;
}

export function chantText(a: number, b: number): string {
  const p = a * b;
  const head = toChineseNumber(a) + toChineseNumber(b);
  return p < 10 ? `${head}得${toChineseNumber(p)}` : `${head}${toChineseNumber(p)}`;
}
