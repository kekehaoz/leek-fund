export interface TrendLineValues {
  whiteLine: number | null;
  yellowLine: number | null;
}

export function calculateEma(values: number[], period: number): number[] {
  if (!values.length) return [];
  if (!Number.isInteger(period) || period <= 0) {
    throw new Error(`EMA period must be a positive integer, received ${period}`);
  }

  const alpha = 2 / (period + 1);
  const result = [values[0]];
  for (let index = 1; index < values.length; index += 1) {
    result.push(alpha * values[index] + (1 - alpha) * result[index - 1]);
  }
  return result;
}

function calculateSma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const recentValues = values.slice(-period);
  return recentValues.reduce((total, value) => total + value, 0) / period;
}

export function calculateZhiXingTrendLines(closes: number[]): TrendLineValues {
  if (!closes.length) {
    return { whiteLine: null, yellowLine: null };
  }

  const firstEma = calculateEma(closes, 10);
  const secondEma = calculateEma(firstEma, 10);
  const whiteLine = secondEma[secondEma.length - 1];
  const yellowPeriods = [14, 28, 57, 114];
  const [ma14, ma28, ma57, ma114] = yellowPeriods.map((period) =>
    calculateSma(closes, period)
  );
  const yellowLine =
    ma14 === null || ma28 === null || ma57 === null || ma114 === null
      ? null
      : (ma14 + ma28 + ma57 + ma114) / 4;

  return {
    whiteLine,
    yellowLine,
  };
}
