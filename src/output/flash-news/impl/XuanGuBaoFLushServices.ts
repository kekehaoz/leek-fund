import FlashNewsDaemon from '../FlashNewsDaemon';
import NewsFlushServiceAbstractClass from '../NewsFlushServiceAbstractClass';
import axios from 'axios';
import { formatDateTime } from '../../../shared/utils';

type XuanGuBaoMessage = {
  title: string;
  summary: string;
  impact: number;
  bkj_infos?: Array<{ id: string; name: string }>;
  all_stocks?: Array<{ name: string; symbol: string }>;
  subj_ids?: string[];
  created_at: number;
  id: string;
};

type XuanGuBaoApiMessage = {
  Id: string;
  Title: string;
  Summary: string;
  Content?: string;
  Impact: number;
  BkjInfoArr?: Array<{ Id: string; Name: string }>;
  AllStocks?: Array<{ Name: string; Symbol: string }>;
  SubjIds?: string[];
  CreatedAtInSec: number;
};

const NEWS_FLASH_URL = 'https://api.xuangubao.com.cn/api/pc/msgs';
const POLL_INTERVAL = 60000;
const ERROR_RETRY_INTERVAL = 60000;
const PAGE_SIZE = 30;
const MAX_SEEN_IDS = 2000;

export default class XuanGuBaoFlushService extends NewsFlushServiceAbstractClass {
  isStop: boolean = false;
  subjectIds: number[] = [9, 10, 723, 35, 469];
  pollingTimer: NodeJS.Timeout | undefined;
  seenIds = new Set<string>();

  constructor(readonly daemon: FlashNewsDaemon) {
    super(daemon);
    console.log('初始化 选股宝快讯 服务');
    this.polling();
  }

  async polling() {
    if (this.isStop) return;
    let nextDelay = POLL_INTERVAL;

    try {
      const res = await axios.get(NEWS_FLASH_URL, {
        params: {
          limit: PAGE_SIZE,
          subjids: this.subjectIds.join(','),
        },
        headers: {
          Referer: 'https://xuangubao.cn/',
        },
        timeout: 10000,
      });

      const messages: XuanGuBaoApiMessage[] = res.data?.NewMsgs || [];
      const freshMessages = messages
        .filter((msg) => msg.Id && !this.seenIds.has(msg.Id))
        .sort((a, b) => a.CreatedAtInSec - b.CreatedAtInSec);

      freshMessages.forEach((msg) => {
        this.seenIds.add(msg.Id);
        this._print(this.normalizeMessage(msg));
      });
      this.trimSeenIds();
    } catch (err) {
      console.error('选股宝快讯轮询失败', err);
      nextDelay = ERROR_RETRY_INTERVAL;
    } finally {
      if (!this.isStop) {
        this.pollingTimer = setTimeout(this.polling.bind(this), nextDelay);
      }
    }
  }

  private normalizeMessage(msg: XuanGuBaoApiMessage): XuanGuBaoMessage {
    return {
      title: msg.Title || '',
      summary: msg.Summary || msg.Content || '',
      impact: Number(msg.Impact) || 0,
      bkj_infos: (msg.BkjInfoArr || []).map((item) => ({
        id: item.Id,
        name: item.Name,
      })),
      all_stocks: (msg.AllStocks || []).map((stock) => ({
        name: stock.Name,
        symbol: stock.Symbol,
      })),
      subj_ids: msg.SubjIds || [],
      created_at: msg.CreatedAtInSec,
      id: msg.Id,
    };
  }

  private trimSeenIds() {
    if (this.seenIds.size <= MAX_SEEN_IDS) return;
    const ids = Array.from(this.seenIds);
    this.seenIds = new Set(ids.slice(ids.length - MAX_SEEN_IDS));
  }

  _print(msg: XuanGuBaoMessage) {
    let impact = '';
    let bkjStr = '';
    if (msg.impact !== 0) {
      impact = msg.impact === 1 ? '【利多 🚀️ 】' : '【利空 🍜️ 】';
    }

    if (msg.bkj_infos?.length) {
      bkjStr = `相关板块：${msg.bkj_infos.map((bkj) => `[${bkj.name}]`).join(' - ')}\r\n`;
    }

    this.print(
      `${msg.title} ${impact} \r\n${msg.summary}\r\n${bkjStr}[选股宝 - ${formatDateTime(
        new Date(msg.created_at * 1000)
      )}]`,
      {
        type: 'xgb',
        data: msg,
        time: msg.created_at * 1000,
      }
    );
  }
  destroy(): void {
    console.log('销毁 选股宝快讯 服务');
    this.pollingTimer && clearTimeout(this.pollingTimer);
    this.pollingTimer = undefined;
    this.isStop = true;
  }
}
