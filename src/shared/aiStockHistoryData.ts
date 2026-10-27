import axios from 'axios';

export function formatDateYYYYMMDD(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function calcStartDateByRange(base: Date, range: string): Date {
  const y = base.getFullYear();
  const m = base.getMonth();
  const d = base.getDate();
  switch (range) {
    case '1y':
      return new Date(y - 1, m, d);
    case '6m':
      return new Date(y, m - 6, d);
    case '1m':
      return new Date(y, m - 1, d);
    case '1w':
      return new Date(base.getTime() - 7 * 24 * 60 * 60 * 1000);
    case '3m':
    default:
      return new Date(y, m - 3, d);
  }
}

function toSohuCode(stockId: string): string | null {
  if (!stockId || stockId.length < 3) return null;
  const lower = stockId.toLowerCase();
  if (lower.startsWith('sh') || lower.startsWith('sz')) {
    return `cn_${lower.slice(2)}`;
  }
  return null;
}

/** 腾讯 K 线代码规范化：港股数字部分补足 5 位，A 股直接用 sh/sz 前缀 */
function normalizeTencentSymbol(stockId: string): string | null {
  if (!stockId || stockId.length < 3) return null;
  const lower = stockId.toLowerCase();
  if (lower.startsWith('sh') || lower.startsWith('sz')) {
    return lower;
  }
  if (lower.startsWith('hk')) {
    const suffix = stockId.slice(2);
    if (/^\d+$/.test(suffix)) {
      return `hk${suffix.padStart(5, '0')}`;
    }
    if (suffix.length > 0) {
      return `hk${suffix.toUpperCase()}`;
    }
  }
  return null;
}

function rangeToMaxBars(range: string): number {
  switch (range) {
    case '1y':
      return 320;
    case '6m':
      return 160;
    case '1m':
      return 35;
    case '1w':
      return 15;
    case '3m':
    default:
      return 100;
  }
}

async function fetchSohuQfqText(stockId: string, startCompact: string, endCompact: string): Promise<string> {
  const sohuCode = toSohuCode(stockId);
  if (!sohuCode) return '';
  const url = `http://q.stock.sohu.com/hisHq?code=${sohuCode}&start=${startCompact}&end=${endCompact}&stat=1&order=D&period=d&callback=historySearchHandler&rt=jsonp`;
  const response = await axios.get(url, { responseType: 'text' });
  return typeof response === 'string' ? response : (response.data ? String(response.data) : '');
}

function eastMoneyKlinesToCsv(klines: string[]): string {
  if (!klines.length) return '';
  // 东方财富格式: "日期,开盘,收盘,最高,最低,成交量,成交额,振幅,涨跌幅,涨跌额,换手率"
  const lines = ['日期,开盘,收盘,最高,最低,成交量'];
  for (const row of klines) {
    const parts = row.split(',');
    if (parts.length < 6) continue;
    lines.push(`${parts[0]},${parts[1]},${parts[2]},${parts[3]},${parts[4]},${parts[5]}`);
  }
  return lines.length > 1 ? lines.join('\n') : '';
}

/** 东方财富 A 股日 K。沪市 secid 为 1.xxxxxx，深市/北交所为 0.xxxxxx。 */
async function fetchEastMoneyAStockText(
  stockId: string,
  startYmd: string,
  endYmd: string,
  range: string
): Promise<string> {
  const match = /^(sh|sz|bj)(\d+)$/i.exec(stockId);
  if (!match) return '';
  const market = match[1].toLowerCase() === 'sh' ? '1' : '0';
  const maxBars = rangeToMaxBars(range) + 10; // 多取几条保证 MA30 有足够数据
  try {
    const res = await axios.get('https://push2his.eastmoney.com/api/qt/stock/kline/get', {
      params: {
        secid: `${market}.${match[2]}`,
        fields1: 'f1,f2,f3,f4,f5',
        fields2: 'f51,f52,f53,f54,f55,f56',
        klt: 101,
        fqt: 1,
        beg: startYmd.replace(/-/g, ''),
        end: endYmd.replace(/-/g, ''),
        lmt: maxBars,
      },
      headers: { Referer: 'https://finance.eastmoney.com/', 'User-Agent': 'Mozilla/5.0' },
      timeout: 8000,
    });
    return eastMoneyKlinesToCsv(res.data?.data?.klines || []);
  } catch (_) {
    return '';
  }
}

/**
 * 腾讯可用日 K 接口。原 fqkline 地址当前会返回 WAF 501，
 * 这里改用 kline/kline 作为 A 股/港股兜底。
 */
async function fetchTencentKlineText(
  stockId: string,
  startYmd: string,
  endYmd: string,
  range: string
): Promise<string> {
  const sym = normalizeTencentSymbol(stockId);
  if (!sym) return '';
  const maxBars = rangeToMaxBars(range);
  const url = `https://web.ifzq.gtimg.cn/appstock/app/kline/kline?param=${encodeURIComponent(
    `${sym},day,${startYmd},${endYmd},${maxBars}`
  )}`;
  try {
    const res = await axios.get(url, {
      responseType: 'json',
      headers: { Referer: 'https://gu.qq.com/', 'User-Agent': 'Mozilla/5.0' },
      timeout: 8000,
    });
    const symData = res.data?.data?.[sym];
    const day = symData?.day;
    if (!Array.isArray(day) || !day.length) return '';
    const lines = ['日期,开盘,收盘,最高,最低,成交量'];
    for (const row of day) {
      if (!Array.isArray(row) || row.length < 6) continue;
      lines.push(`${row[0]},${row[1]},${row[2]},${row[3]},${row[4]},${row[5]}`);
    }
    return lines.length > 1 ? lines.join('\n') : '';
  } catch (_) {
    return '';
  }
}

/**
 * 东方财富美股日K接口。secid 格式：105.TICKER（NASDAQ）或 106.TICKER（NYSE）。
 * 先尝试 105，若无数据再试 106。
 */
async function fetchEastMoneyUsText(
  ticker: string,
  startYmd: string,
  endYmd: string,
  range: string
): Promise<string> {
  const maxBars = rangeToMaxBars(range) + 10; // 多取几条保证 MA30 有足够数据
  const beg = startYmd.replace(/-/g, '');
  const end = endYmd.replace(/-/g, '');

  const tryFetch = async (mktNum: number): Promise<string> => {
    const secid = `${mktNum}.${ticker.toUpperCase()}`;
    const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get`;
    const res = await axios.get(url, {
      params: { secid, fields1: 'f1,f2,f3,f4,f5', fields2: 'f51,f52,f53,f54,f55,f56', klt: 101, fqt: 1, beg, end, lmt: maxBars },
      headers: { Referer: 'https://finance.eastmoney.com/', 'User-Agent': 'Mozilla/5.0' },
      timeout: 8000,
    });
    return eastMoneyKlinesToCsv(res.data?.data?.klines || []);
  };

  // NASDAQ(105) 优先，失败或无数据再试 NYSE(106)
  try {
    const text = await tryFetch(105);
    if (text) return text;
  } catch (_) {}
  try {
    return await tryFetch(106);
  } catch (_) {}
  return '';
}

/**
 * 获取日线行情文本，用于计算 MA 均线。
 * A 股优先走东方财富前复权接口，港股走腾讯接口，美股走东方财富接口。
 */
export async function fetchRecentQfqTradeDataForAi(
  stockId: string,
  range: string
): Promise<{ text: string; sourceLabel: string }> {
  const now = new Date();
  const startDate = calcStartDateByRange(now, range);
  const startYmd = formatDateYYYYMMDD(startDate);
  const endYmd = formatDateYYYYMMDD(now);
  const startCompact = startYmd.replace(/-/g, '');
  const endCompact = endYmd.replace(/-/g, '');

  const lower = stockId.toLowerCase();
  if (lower.startsWith('sh') || lower.startsWith('sz') || lower.startsWith('bj')) {
    const eastMoneyText = await fetchEastMoneyAStockText(stockId, startYmd, endYmd, range);
    if (eastMoneyText) {
      return { text: eastMoneyText, sourceLabel: '东方财富（A股前复权日线）' };
    }
    const tencentText = await fetchTencentKlineText(stockId, startYmd, endYmd, range);
    return { text: tencentText, sourceLabel: '腾讯财经（A股日线）' };
  }

  if (lower.startsWith('hk')) {
    const text = await fetchTencentKlineText(stockId, startYmd, endYmd, range);
    return { text, sourceLabel: '腾讯财经（港股日线）' };
  }

  if (lower.startsWith('usr_')) {
    const ticker = stockId.slice(4); // 去掉 usr_ 前缀
    const text = await fetchEastMoneyUsText(ticker, startYmd, endYmd, range);
    return { text, sourceLabel: '东方财富（美股日线）' };
  }

  const text = await fetchSohuQfqText(stockId, startCompact, endCompact);
  return { text, sourceLabel: '搜狐财经' };
}
