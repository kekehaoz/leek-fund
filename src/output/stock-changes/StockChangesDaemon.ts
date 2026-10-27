import EastmoneyChangesService from './impl/EastmoneyChangesService';

let instance: StockChangesDaemon | undefined;

export default class StockChangesDaemon {
  public depServers = new Set<StockChangesServerInterface>();
  public caches: any[][] = [];
  public changesService: EastmoneyChangesService | undefined;

  isDestroy = false;

  constructor() {
    this.initService();
  }

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

  static registerServer(dep: StockChangesServerInterface) {
    if (!instance) {
      instance = new StockChangesDaemon();
    }

    instance.depServers.add(dep);
    instance.caches.reverse().forEach((params) => {
      return dep.print.apply(dep, [params[0], params[1]]);
    });

    if (instance.isDestroy) {
      instance.initService();
    }
    return function cancelServer() {
      instance?.depServers.delete(dep);
      instance?.tryDestroy();
    };
  }

  initService() {
    this.changesService = new EastmoneyChangesService(this);
    this.isDestroy = false;
  }

  print(changes: string, source?: { type: string; data: any; time: number }) {
    this.caches.unshift([changes, source]);
    this.caches = this.caches.slice(0, 100);
    this.depServers.forEach((dep) => {
      dep.print(changes, source);
    });
  }

  tryDestroy() {
    if (this.depServers.size < 1) {
      this.destroy();
    }
  }

  /**
   * 销毁
   */
  destroy() {
    this.caches.length = 0;
    this.changesService?.destroy();
    this.changesService = undefined;
    this.isDestroy = true;
  }

  reload() {}
}

/**
 * 具体服务的接口方法
 */
export interface StockChangesServerInterface {
  print: (content: string, source?: any) => void;
  destroy: () => void;
}
