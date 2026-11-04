import axios from 'axios';
import { decodeHTML } from 'entities';
import { formatDateTime } from '../../../shared/utils';
import FlashNewsDaemon from '../FlashNewsDaemon';
import NewsFlushServiceAbstractClass from '../NewsFlushServiceAbstractClass';

type WallstreetcnLiveItem = {
  id: number;
  display_time: number;
  title?: string;
  content_text?: string;
  content_more?: string;
  uri?: string;
};

const LIVE_URL = 'https://api-one-wscn.awtmt.com/apiv1/content/lives';
const POLL_INTERVAL = 60000;
const ERROR_RETRY_INTERVAL = 60000;
const PAGE_SIZE = 30;
const MAX_SEEN_IDS = 2000;

function stripHtml(content = ''): string {
  return decodeHTML(
    content
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

/**
 * 华尔街见闻 7x24 全球快讯。
 * 接口每次返回最新一页，按 id 去重后按时间正序输出。
 */
export default class WallstreetcnFlushService extends NewsFlushServiceAbstractClass {
  private isStop = false;
  private pollingTimer: NodeJS.Timeout | undefined;
  private seenIds = new Set<number>();

  constructor(readonly daemon: FlashNewsDaemon) {
    super(daemon);
    console.log('初始化 华尔街见闻快讯 服务');
    this.polling();
  }

  private async polling() {
    if (this.isStop) return;
    let nextDelay = POLL_INTERVAL;

    try {
      const res = await axios.get(LIVE_URL, {
        params: {
          channel: 'global-channel',
          client: 'pc',
          limit: PAGE_SIZE,
        },
        headers: {
          Referer: 'https://wallstreetcn.com/live/global',
        },
        timeout: 10000,
      });

      if (res.data?.code === 20000) {
        const items: WallstreetcnLiveItem[] = res.data.data?.items || [];
        const freshItems = items
          .filter((item) => item.id && !this.seenIds.has(item.id))
          .sort((a, b) => a.display_time - b.display_time);

        freshItems.forEach((item) => {
          this.seenIds.add(item.id);
          this.printItem(item);
        });
        this.trimSeenIds();
      }
    } catch (err) {
      console.error('华尔街见闻快讯轮询失败', err);
      nextDelay = ERROR_RETRY_INTERVAL;
    } finally {
      if (!this.isStop) {
        this.pollingTimer = setTimeout(() => this.polling(), nextDelay);
      }
    }
  }

  private printItem(item: WallstreetcnLiveItem) {
    const title = stripHtml(item.title);
    const content = stripHtml(item.content_text);
    const contentMore = stripHtml(item.content_more);
    const text = [title, content, contentMore]
      .filter((part, index, parts) => part && parts.indexOf(part) === index)
      .join('\r\n');

    if (!text) return;

    const time = formatDateTime(new Date(item.display_time * 1000));
    const uri = item.uri || `https://wallstreetcn.com/livenews/${item.id}`;
    this.print(`${text}\r\n[华尔街见闻 - ${time}] ${uri}`, {
      type: 'wallstreetcn',
      data: item,
      time: item.display_time * 1000,
    });
  }

  private trimSeenIds() {
    if (this.seenIds.size <= MAX_SEEN_IDS) return;
    const ids = Array.from(this.seenIds);
    this.seenIds = new Set(ids.slice(ids.length - MAX_SEEN_IDS));
  }

  destroy(): void {
    console.log('销毁 华尔街见闻快讯 服务');
    this.isStop = true;
    this.pollingTimer && clearTimeout(this.pollingTimer);
    this.pollingTimer = undefined;
  }
}
