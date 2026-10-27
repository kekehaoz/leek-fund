import axios from 'axios';
import momentTz = require('moment-timezone');
import { LeekFundConfig } from '../../../shared/leekConfig';
import { StockCategory } from '../../../shared/typed';
import { isHoliday } from '../../../shared/utils';
import StockChangesDaemon from '../StockChangesDaemon';

/** 东方财富盘口异动接口 */
const CHANGES_URL = 'https://push2ex.eastmoney.com/getAllStockChanges';
/** 接口固定要求的 ut 参数，缺失会返回 rc:102 */
const UT = '7eea3edcaed734bea9cbfc24409ed989';
/** dpt 取值，与东方财富盘口异动页面保持一致 */
const DPT = 'wz.ztzt';

/** 单次请求条数上限 */
const PAGE_SIZE = 100;
/** 单类型单轮最多翻页数，防止异常时死循环 */
const MAX_PAGES = 5;
/** 首次回填用的大分页，接口实测可放宽到 5000 */
const BACKFILL_PAGE_SIZE = 2000;
/** 首次回填最多翻页数 */
const MAX_BACKFILL_PAGES = 10;
/** 轮询间隔（毫秒） */
const POLL_INTERVAL = 5000;
/** 去重集合容量上限 */
const SEEN_LIMIT = 5000;

/**
 * 异动类型码 -> 名称，取自东方财富盘口异动页面 changes_index.js 的配置表
 */
export const CHANGE_TYPE_NAMES: Record<number, string> = {
  1: '顶级买单',
  2: '顶级卖单',
  4: '封涨停板',
  8: '封跌停板',
  16: '打开涨停板',
  32: '打开跌停板',
  64: '有大买盘',
  128: '有大卖盘',
  256: '机构买单',
  512: '机构卖单',
  8193: '大笔买入',
  8194: '大笔卖出',
  8195: '拖拉机买',
  8196: '拖拉机卖',
  8201: '火箭发射',
  8202: '快速反弹',
  8203: '高台跳水',
  8204: '加速下跌',
  8205: '买入撤单',
  8206: '卖出撤单',
  8207: '竞价上涨',
  8208: '竞价下跌',
  8209: '高开5日线',
  8210: '低开5日线',
  8211: '向上缺口',
  8212: '向下缺口',
  8213: '60日新高',
  8214: '60日新低',
  8215: '60日大幅上涨',
  8216: '60日大幅下跌',
};

/**
 * 参与轮询的类型码：代码表里的全部 30 个。
 * 只按自选股过滤，不按异动类型过滤。
 * 注：1/2/256/512/8195/8196/8205/8206 目前恒返回 data:null（疑似 Level-2 付费项），
 * 留着是为了上游一旦放开就能直接收到，空响应体很小、开销可忽略。
 */
export const ACTIVE_CHANGE_TYPES: number[] = [
  1, 2, 4, 8, 16, 32, 64, 128, 256, 512,
  8193, 8194, 8195, 8196,
  8201, 8202, 8203, 8204, 8205, 8206, 8207, 8208,
  8209, 8210, 8211, 8212, 8213, 8214, 8215, 8216,
];

export type ChangesRow = {
  /** 时间 HHMMSS */
  tm: number;
  /** 6 位股票代码 */
  c: string;
  /** 0=深/北, 1=沪 */
  m: number;
  /** 股票名称 */
  n: string;
  /** 异动类型码 */
  t: number;
  /** 逗号分隔明细，结构随 t 变化 */
  i: string;
};

const fx = (value: number, digits = 2) => (Number.isFinite(value) ? value.toFixed(digits) : '-');

/** 股数格式化 */
function formatShares(value: number): string {
  if (!Number.isFinite(value)) return '-';
  if (Math.abs(value) >= 1e8) return `${(value / 1e8).toFixed(2)}亿股`;
  if (Math.abs(value) >= 1e4) return `${(value / 1e4).toFixed(2)}万股`;
  return `${value.toFixed(0)}股`;
}

/** 金额格式化，入参单位为元 */
function formatAmount(value: number): string {
  if (!Number.isFinite(value)) return '-';
  if (Math.abs(value) >= 1e8) return `${(value / 1e8).toFixed(2)}亿`;
  if (Math.abs(value) >= 1e4) return `${(value / 1e4).toFixed(0)}万`;
  return `${value.toFixed(0)}元`;
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)}%`;
}

/**
 * 拼接单条异动的明细。i 字段结构随类型变化：
 * - sl 类（64/128/8193/8194）：量, 价格, 涨跌幅, 成交额
 * - 4/8：价格, 量, 价格, 涨跌幅
 * - 16/32：价格, 涨跌幅
 * - 8213/8214：价格, 现价, 涨跌幅
 * - change 类（8201~8216）：涨速, 价格, 涨跌幅
 */
function formatDetail(type: number, raw: string): string {
  const parts = String(raw || '').split(',');
  const num = (index: number) => Number(parts[index]);

  if (type === 64 || type === 128 || type === 8193 || type === 8194) {
    return `价 ${fx(num(1))}  ${formatPercent(num(2))}  量 ${formatShares(num(0))}  额 ${formatAmount(num(3))}`;
  }
  if (type === 4 || type === 8) {
    return `价 ${fx(num(0))}  量 ${formatShares(num(1))}  ${formatPercent(num(3))}`;
  }
  if (type === 16 || type === 32) {
    return `价 ${fx(num(0))}  ${formatPercent(num(1))}`;
  }
  if (type === 8213 || type === 8214) {
    return `价 ${fx(num(0))}  现价 ${fx(num(1))}  ${formatPercent(num(2))}`;
  }
  return `涨速 ${formatPercent(num(0))}  价 ${fx(num(1))}  ${formatPercent(num(2))}`;
}

/** 单条异动 -> 一行输出文本 */
export function formatChangesRow(row: ChangesRow): string {
  const name = CHANGE_TYPE_NAMES[row.t] ?? `未知异动(${row.t})`;
  const tm = String(row.tm).padStart(6, '0');
  const time = `${tm.slice(0, 2)}:${tm.slice(2, 4)}:${tm.slice(4)}`;
  return `[${time}] ${name}  ${row.n}  ${formatDetail(row.t, row.i)}`;
}

/**
 * 东方财富盘口异动轮询服务。
 * 仅输出自选股（leek-fund.stocks 中的 A 股）相关的异动。
 */
export default class EastmoneyChangesService {
  private timer: NodeJS.Timeout | undefined;
  private isStop = false;
  private isPolling = false;
  /** 每个类型已上报过的最新时间，用于增量翻页 */
  private lastTmByType = new Map<number, number>();
  /** 已输出过的事件，防止翻页边界重复 */
  private seenKeys = new Set<string>();

  constructor(readonly daemon: StockChangesDaemon) {
    console.log('初始化 东财盘口异动 服务');
    this.schedule(0);
  }

  /** 自选股中的 A 股代码集合（6 位数字） */
  private getWatchCodes(): Set<string> {
    const stocks: string[] = LeekFundConfig.getConfig('leek-fund.stocks') || [];
    return new Set(
      stocks.filter((code) => /^(sh|sz|bj)\d{6}$/i.test(code)).map((code) => code.slice(2))
    );
  }

  /** A 股是否在交易时段（含集合竞价），非交易日不轮询 */
  private isAShareTradingTime(): boolean {
    if (isHoliday(StockCategory.A, 'Asia/Shanghai')) return false;
    const now = momentTz().tz('Asia/Shanghai');
    const hm = now.hours() * 100 + now.minutes();
    return (hm >= 915 && hm <= 1135) || (hm >= 1255 && hm <= 1505);
  }

  private schedule(delay: number) {
    if (this.isStop) return;
    this.timer = setTimeout(() => this.run(), delay);
  }

  private async run() {
    try {
      if (this.isAShareTradingTime()) {
        await this.poll();
      }
    } catch (err) {
      console.error('东财盘口异动轮询失败', err);
    } finally {
      this.schedule(POLL_INTERVAL);
    }
  }

  private async poll() {
    if (this.isPolling) return;
    const watchCodes = this.getWatchCodes();
    if (!watchCodes.size) return;
    this.isPolling = true;
    try {
      const results = await Promise.allSettled(
        ACTIVE_CHANGE_TYPES.map((type) => this.fetchType(type))
      );
      const rows: ChangesRow[] = [];
      results.forEach((result) => {
        if (result.status === 'fulfilled') rows.push(...result.value);
      });
      // 同一轮内按时间正序输出，阅读更贴近时间轴
      rows.sort((a, b) => a.tm - b.tm);
      rows.forEach((row) => this.report(row, watchCodes));
    } finally {
      this.isPolling = false;
    }
  }

  private async fetchPage(type: number, page: number, size = PAGE_SIZE): Promise<any> {
    const res = await axios.get(CHANGES_URL, {
      params: { type, ut: UT, pageindex: page, pagesize: size, dpt: DPT },
      timeout: 10000,
    });
    return res.data?.data;
  }

  private async fetchType(type: number): Promise<ChangesRow[]> {
    const rows = this.lastTmByType.has(type)
      ? await this.fetchIncremental(type)
      : await this.fetchBackfill(type);

    const newest = rows.reduce((max, row) => Math.max(max, row.tm), 0);
    if (newest) {
      this.lastTmByType.set(type, Math.max(newest, this.lastTmByType.get(type) ?? 0));
    }
    return rows;
  }

  /**
   * 首次启用：回填当日全部异动。
   * 接口实测单页可放宽到 2000 条，全天 20 个类型一次回填约 0.3 秒。
   */
  private async fetchBackfill(type: number): Promise<ChangesRow[]> {
    const rows: ChangesRow[] = [];
    for (let page = 0; page < MAX_BACKFILL_PAGES; page++) {
      const data = await this.fetchPage(type, page, BACKFILL_PAGE_SIZE);
      const list: ChangesRow[] = data?.allstock || [];
      if (!list.length) break;
      rows.push(...list);
      if (rows.length >= (data?.tc ?? 0)) break;
    }
    return rows;
  }

  /**
   * 增量：按时间倒序翻页，直到触达上一轮已见过的区间。
   */
  private async fetchIncremental(type: number): Promise<ChangesRow[]> {
    const lastTm = this.lastTmByType.get(type) ?? 0;
    const rows: ChangesRow[] = [];

    for (let page = 0; page < MAX_PAGES; page++) {
      const data = await this.fetchPage(type, page);
      const list: ChangesRow[] = data?.allstock || [];
      if (!list.length) break;
      rows.push(...list);
      if (list[list.length - 1].tm < lastTm) break;
      if (list.length < PAGE_SIZE) break;
      if (rows.length >= (data?.tc ?? 0)) break;
    }
    return rows;
  }

  private report(row: ChangesRow, watchCodes: Set<string>) {
    if (!watchCodes.has(row.c)) return;
    const key = `${row.tm}-${row.c}-${row.t}`;
    if (this.seenKeys.has(key)) return;
    this.seenKeys.add(key);
    if (this.seenKeys.size > SEEN_LIMIT) {
      this.seenKeys = new Set([...this.seenKeys].slice(-SEEN_LIMIT / 2));
    }
    this.daemon.print(formatChangesRow(row), {
      type: 'eastmoney-changes',
      data: row,
      time: Date.now(),
    });
  }

  destroy(): void {
    console.log('销毁 东财盘口异动 服务');
    this.isStop = true;
    this.timer && clearTimeout(this.timer);
    this.timer = undefined;
    this.lastTmByType.clear();
    this.seenKeys.clear();
  }
}
