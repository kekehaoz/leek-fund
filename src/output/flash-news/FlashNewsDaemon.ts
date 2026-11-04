import Jin10FlushService from './impl/Jin10FlushService';
import WallstreetcnFlushService from './impl/WallstreetcnFlushService';
import XuanGuBaoFlushService from './impl/XuanGuBaoFLushServices';
import NewsFlushServiceAbstractClass, {
  FlashNewsServerInterface,
} from './NewsFlushServiceAbstractClass';

let instance: FlashNewsDaemon | undefined;
const BUFFER_QUIET_WINDOW = 3000;
const BUFFER_MAX_WAIT = 8000;

type PendingNews = {
  news: string;
  source?: { type: string; data: any; time: number };
  time: number;
  sequence: number;
};

export default class FlashNewsDaemon {
  public depServers = new Set<FlashNewsServerInterface>();
  public flushServices = new Set<NewsFlushServiceAbstractClass>();
  public caches: any[][] = [];
  private pendingNews: PendingNews[] = [];
  private flushTimer: NodeJS.Timeout | undefined;
  private maxWaitTimer: NodeJS.Timeout | undefined;
  private sequence = 0;

  isDestroy = false;

  static KillAllServer() {
    if (instance) {
      instance.depServers.forEach((dep) => {
        dep.destroy();
        instance?.depServers.delete(dep);
      });
      instance.destroy();
      instance = undefined;
    }
  }

  static registerServer(dep: FlashNewsServerInterface) {
    if (!instance) {
      instance = new FlashNewsDaemon();
    }

    instance.depServers.add(dep);
    instance.caches.slice().reverse().forEach((params) => {
      return dep.print.apply(dep, [params[0], params[1]]);
    });

    if (!instance.flushServices.size) {
      instance.initServices();
    }
    return function cancelServer() {
      instance?.depServers.delete(dep);
      instance?.tryDestroy();
    };
  }

  initServices() {
    this.flushServices.add(new Jin10FlushService(this));
    this.flushServices.add(new XuanGuBaoFlushService(this));
    this.flushServices.add(new WallstreetcnFlushService(this));
    this.isDestroy = false;
  }

  print(news: string, source?: { type: string; data: any; time: number }) {
    this.pendingNews.push({
      news,
      source,
      time: source?.time || Date.now(),
      sequence: this.sequence++,
    });
    this.scheduleFlush();
  }

  private scheduleFlush() {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => this.flushPending(), BUFFER_QUIET_WINDOW);

    if (!this.maxWaitTimer) {
      this.maxWaitTimer = setTimeout(() => this.flushPending(), BUFFER_MAX_WAIT);
    }
  }

  private flushPending() {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    if (this.maxWaitTimer) clearTimeout(this.maxWaitTimer);
    this.flushTimer = undefined;
    this.maxWaitTimer = undefined;

    const batch = this.pendingNews.splice(0);
    if (!batch.length) return;

    batch
      .sort((a, b) => a.time - b.time || a.sequence - b.sequence)
      .forEach(({ news, source }) => this.emit(news, source));
  }

  private emit(news: string, source?: { type: string; data: any; time: number }) {
    this.caches.unshift([news, source]);
    this.caches = this.caches.slice(0, 100);
    this.depServers.forEach((dep) => {
      dep.print(news, source);
    });
  }

  tryDestroy() {
    if (this.depServers.size < 1) {
      this.destroy();
      instance = undefined;
    }
  }

  /**
   * 销毁
   */
  destroy() {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    if (this.maxWaitTimer) clearTimeout(this.maxWaitTimer);
    this.flushTimer = undefined;
    this.maxWaitTimer = undefined;
    this.pendingNews.length = 0;
    this.caches.length = 0;
    this.flushServices.forEach((service) => {
      service.destroy();
    });
    this.flushServices.clear();
    this.isDestroy = true;
  }

  reload() {}
}
