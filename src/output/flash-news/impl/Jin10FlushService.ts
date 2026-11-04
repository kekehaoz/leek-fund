import axios from 'axios';
import FlashNewsDaemon from '../FlashNewsDaemon';
import NewsFlushServiceAbstractClass from '../NewsFlushServiceAbstractClass';

type Jin10ApiItem = {
  id: string;
  type: number;
  time: string;
  important?: number;
  channel?: number[];
  data?: {
    content?: string;
    pic?: string;
    title?: string;
    lock?: boolean;
    country?: string;
    time_period?: string;
    name?: string;
    actual?: string;
    unit?: string;
  };
};

const LIVE_URL = 'https://flash-api.jin10.com/get_flash_list';
const POLL_INTERVAL = 60000;
const ERROR_RETRY_INTERVAL = 60000;
const MAX_SEEN_IDS = 2000;

export default class Jin10FlushService extends NewsFlushServiceAbstractClass {
  private isDone: boolean = false;
  private pollingTimer: NodeJS.Timeout | undefined;
  private seenIds = new Set<string>();

  constructor(readonly daemon: FlashNewsDaemon) {
    super(daemon);
    console.log('初始化 金十快讯 服务');
    this.polling();
  }

  private async polling() {
    if (this.isDone) return;
    let nextDelay = POLL_INTERVAL;

    try {
      const res = await axios.get(LIVE_URL, {
        headers: {
          'x-app-id': 'bVBF4FyRTn5NJF5n',
          'x-version': '1.0.0',
          Referer: 'https://flash.jin10.com/',
        },
        timeout: 10000,
      });

      if (res.data?.status === 200) {
        const items: Jin10ApiItem[] = res.data.data || [];
        const freshItems = items
          .filter((item) => item.id && !this.seenIds.has(item.id))
          .sort((a, b) => a.time.localeCompare(b.time));

        freshItems.forEach((item) => {
          this.seenIds.add(item.id);
          this.printItem(item);
        });
        this.trimSeenIds();
      }
    } catch (err) {
      console.error('金十快讯轮询失败', err);
      nextDelay = ERROR_RETRY_INTERVAL;
    } finally {
      if (!this.isDone) {
        this.pollingTimer = setTimeout(() => this.polling(), nextDelay);
      }
    }
  }

  private printItem(item: Jin10ApiItem) {
    const detail = item.data || {};
    if (detail.lock && !detail.content) return;
    if (!(item.channel || []).some((channel) => channel === 1 || channel === 5)) return;

    const contentSuffix = `（https://flash.jin10.com/detail/${item.id}）\r\n[金十快讯 - ${item.time}]`;
    let content = '';

    if (item.type === 0) {
      content = this.formatContent(detail.content || detail.title || '');
    } else if (item.type === 1) {
      const { country, time_period, name, actual, unit } = detail;
      content = `${country || ''}${time_period || ''}${name || ''}:${actual || ''}${unit || ''}`;
    }

    if (!content) return;

    this.print(`${content}${contentSuffix}`, {
      type: 'jin10',
      data: {
        type: item.type,
        time: item.time,
        id: item.id,
        action: 1,
        channel: item.channel,
        important: item.important,
        data: detail,
      },
      time: new Date(item.time.replace(/-/g, '/')).getTime(),
    });
  }

  private trimSeenIds() {
    if (this.seenIds.size <= MAX_SEEN_IDS) return;
    const ids = Array.from(this.seenIds);
    this.seenIds = new Set(ids.slice(ids.length - MAX_SEEN_IDS));
  }

  destroy() {
    console.log('销毁 金十 快讯服务');
    this.isDone = true;
    this.pollingTimer && clearTimeout(this.pollingTimer);
    this.pollingTimer = undefined;
  }

  pause() {}

  private formatContent(content: string) {
    let result = content.replace(/<br\/>/gi, '\r\n　　').replace(/(<([^>]+)>)/gi, '');
    if (result[0] === '【') {
      result = result.replace('】', '】\r\n　　');
    } else {
      result = '　　' + result;
    }
    return result;
  }
}
