import Axios from 'axios';
import { decode } from 'iconv-lite';
import Log from './log';

export interface SinaSectorData {
  code: string;
  name: string;
  stockCount: number;
  avgPrice: number;
  changePercent: number;
  changeAmount: number;
  volume: number;
  amount: number;
  leadStock: string;
  leadStockPrice: number;
  leadStockChange: number;
}

const SINA_INDUSTRY_URL = 'https://vip.stock.finance.sina.com.cn/q/view/newSinaHy.php';
const SINA_CONCEPT_URL = 'https://vip.stock.finance.sina.com.cn/q/view/newFLJK.php?param=class';

let sinaSectorCache: Map<string, SinaSectorData> = new Map();
let lastFetchTime = 0;
const CACHE_TTL = 5 * 60 * 1000;

export async function fetchSinaSectors(): Promise<Map<string, SinaSectorData>> {
  const now = Date.now();
  if (sinaSectorCache.size > 0 && now - lastFetchTime < CACHE_TTL) {
    return sinaSectorCache;
  }

  const result = new Map<string, SinaSectorData>();

  try {
    const [industryRes, conceptRes] = await Promise.all([
      Axios.get(SINA_INDUSTRY_URL, {
        responseType: 'arraybuffer',
        timeout: 10000,
        transformResponse: [(data) => decode(data, 'GBK')],
      }),
      Axios.get(SINA_CONCEPT_URL, {
        responseType: 'arraybuffer',
        timeout: 10000,
        transformResponse: [(data) => decode(data, 'GBK')],
      }),
    ]);

    parseSinaResponse(industryRes.data, 'industry', result);
    parseSinaResponse(conceptRes.data, 'concept', result);

    sinaSectorCache = result;
    lastFetchTime = now;
    Log.info(`Sina sectors fetched: ${result.size} items`);
  } catch (err) {
    Log.error(`fetchSinaSectors error: ${err}`);
  }

  return result;
}

function parseSinaResponse(
  rawData: string,
  type: 'industry' | 'concept',
  result: Map<string, SinaSectorData>
) {
  try {
    const jsonStr = rawData.split('=')[1]?.replace(/;$/, '');
    if (!jsonStr) return;

    const data = JSON.parse(jsonStr);
    for (const [sinaCode, value] of Object.entries(data)) {
      const parts = (value as string).split(',');
      if (parts.length < 11) continue;

      const item: SinaSectorData = {
        code: sinaCode,
        name: parts[1],
        stockCount: parseInt(parts[2], 10),
        avgPrice: parseFloat(parts[3]),
        changePercent: parseFloat(parts[4]),
        changeAmount: parseFloat(parts[5]),
        volume: parseInt(parts[6], 10),
        amount: parseFloat(parts[7]),
        leadStock: parts[8],
        leadStockPrice: parseFloat(parts[9]),
        leadStockChange: parseFloat(parts[10]),
      };
      result.set(sinaCode, item);
    }
  } catch (err) {
    Log.error(`parseSinaResponse ${type} error: ${err}`);
  }
}

export function getSinaSectorByName(name: string): SinaSectorData | undefined {
  for (const item of sinaSectorCache.values()) {
    if (item.name === name || item.name.includes(name) || name.includes(item.name)) {
      return item;
    }
  }
  return undefined;
}

export function getSinaSectorByCode(sinaCode: string): SinaSectorData | undefined {
  return sinaSectorCache.get(sinaCode);
}
