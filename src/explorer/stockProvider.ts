import { Event, EventEmitter, TreeDataProvider, TreeItem, TreeItemCollapsibleState } from 'vscode';
// import { compact, flattenDeep, uniq } from 'lodash';
import globalState from '../globalState';
import { LeekTreeItem } from '../shared/leekTreeItem';
import { defaultFundInfo, SortType, StockCategory } from '../shared/typed';
import { LeekFundConfig } from '../shared/leekConfig';
import StockService from './stockService';
import { events } from '../shared/utils';

export class StockProvider implements TreeDataProvider<LeekTreeItem> {
  private _onDidChangeTreeData: EventEmitter<any> = new EventEmitter<any>();

  readonly onDidChangeTreeData: Event<any> = this._onDidChangeTreeData.event;

  private service: StockService;
  private order: SortType;
  private expandAStock: boolean;
  private expandHKStock: boolean;
  private expandUSStock: boolean;
  private expandBond: boolean;
  private expandCNFuture: boolean;
  private expandOverseaFuture: boolean;
  private expandOverseaIndex: boolean;
  private expandSectorIndices: boolean;

  constructor(service: StockService) {
    this.service = service;
    this.order = LeekFundConfig.getConfig('leek-fund.stockSort') || SortType.NORMAL;
    this.expandAStock = LeekFundConfig.getConfig('leek-fund.expandAStock', true);
    this.expandHKStock = LeekFundConfig.getConfig('leek-fund.expandHKStock', false);
    this.expandUSStock = LeekFundConfig.getConfig('leek-fund.expandUSStock', false);
    this.expandBond = LeekFundConfig.getConfig('leek-fund.expandBond', false);
    this.expandCNFuture = LeekFundConfig.getConfig('leek-fund.expandCNFuture', false);
    this.expandOverseaFuture = LeekFundConfig.getConfig('leek-fund.expandOverseaFuture', false);
    this.expandOverseaIndex = LeekFundConfig.getConfig('leek-fund.expandOverseaIndex', false);
    this.expandSectorIndices = LeekFundConfig.getConfig('leek-fund.expandSectorIndices', false);
    events.on('stockMaReady', () => {
      this.refresh();
    });
  }

  refresh(): any {
    this._onDidChangeTreeData.fire(undefined);
  }

  getChildren(element?: LeekTreeItem | undefined): LeekTreeItem[] | Thenable<LeekTreeItem[]> {
    if (!element) {
      // Root view
      const stockCodes = LeekFundConfig.getConfig('leek-fund.stocks') || [];
      const sectorCodes = LeekFundConfig.getConfig('leek-fund.sectorIndices') || [];
      const allCodes = [...stockCodes, ...sectorCodes];
      // const stockList: string[] = uniq(compact(flattenDeep(stockCodes)));
      return this.service.getData(allCodes, this.order).then(() => {
        return this.getRootNodes();
      });
    } else {
      const resultPromise = Promise.resolve(this.service.stockList || []);
      switch (
        element.id // First-level
      ) {
        case StockCategory.A:
          return this.getAStockNodes(resultPromise);
        case StockCategory.HK:
          return this.getHkStockNodes(resultPromise);
        case StockCategory.US:
          return this.getUsStockNodes(resultPromise);
        case StockCategory.Bond:
          return this.getBondNodes(resultPromise);
        case StockCategory.Future:
          return this.getFutureStockNodes(resultPromise);
        case StockCategory.OverseaFuture:
          return this.getOverseaFutureStockNodes(resultPromise);
        case StockCategory.OverseaIndex:
          return this.getOverseaIndexNodes(resultPromise);
        case StockCategory.Sector:
          return this.getSectorNodes(resultPromise);
        case StockCategory.NODATA:
          return this.getNoDataStockNodes(resultPromise);
        default:
          return [];
        // return this.getChildrenNodesById(element.id);
      }
    }
  }

  getParent(): LeekTreeItem | undefined {
    return undefined;
  }

  getTreeItem(element: LeekTreeItem): TreeItem {
    if (!element.isCategory) {
      return element;
    } else {
      return {
        id: element.id,
        label: element.info.name,
        // tooltip: this.getSubCategoryTooltip(element),
        collapsibleState:
          (element.id === StockCategory.A && this.expandAStock) ||
          (element.id === StockCategory.HK && this.expandHKStock) ||
          (element.id === StockCategory.US && this.expandUSStock) ||
          (element.id === StockCategory.Bond && this.expandBond) ||
          (element.id === StockCategory.Future && this.expandCNFuture) ||
          (element.id === StockCategory.OverseaFuture && this.expandOverseaFuture) ||
          (element.id === StockCategory.OverseaIndex && this.expandOverseaIndex) ||
          (element.id === StockCategory.Sector && this.expandSectorIndices)
            ? TreeItemCollapsibleState.Expanded
            : TreeItemCollapsibleState.Collapsed,
        // iconPath: this.parseIconPathFromProblemState(element),
        command: undefined,
        contextValue: element.contextValue,
      };
    }
  }

  getRootNodes(): LeekTreeItem[] {
    const nodes = [
      new LeekTreeItem(
        Object.assign({ contextValue: 'category' }, defaultFundInfo, {
          id: StockCategory.A,
          name: `${StockCategory.A}${
            globalState.aStockCount > 0 ? `(${globalState.aStockCount})` : ''
          }`,
        }),
        undefined,
        true
      ),
      new LeekTreeItem(
        Object.assign({ contextValue: 'category' }, defaultFundInfo, {
          id: StockCategory.HK,
          name: `${StockCategory.HK}${
            globalState.hkStockCount > 0 ? `(${globalState.hkStockCount})` : ''
          }`,
        }),
        undefined,
        true
      ),
      new LeekTreeItem(
        Object.assign({ contextValue: 'category' }, defaultFundInfo, {
          id: StockCategory.US,
          name: `${StockCategory.US}${
            globalState.usStockCount > 0 ? `(${globalState.usStockCount})` : ''
          }`,
        }),
        undefined,
        true
      ),
      new LeekTreeItem(
        Object.assign({ contextValue: 'category' }, defaultFundInfo, {
          id: StockCategory.Bond,
          name: `${StockCategory.Bond}${
            globalState.bondCount > 0 ? `(${globalState.bondCount})` : ''
          }`,
        }),
        undefined,
        true
      ),
      new LeekTreeItem(
        Object.assign({ contextValue: 'category' }, defaultFundInfo, {
          id: StockCategory.Future,
          name: `${StockCategory.Future}${
            globalState.cnfStockCount > 0 ? `(${globalState.cnfStockCount})` : ''
          }`,
        }),
        undefined,
        true
      ),
      new LeekTreeItem(
        Object.assign({ contextValue: 'category' }, defaultFundInfo, {
          id: StockCategory.OverseaFuture,
          name: `${StockCategory.OverseaFuture}${
            globalState.hfStockCount > 0 ? `(${globalState.hfStockCount})` : ''
          }`,
        }),
        undefined,
        true
      ),
      new LeekTreeItem(
        Object.assign({ contextValue: 'category' }, defaultFundInfo, {
          id: StockCategory.OverseaIndex,
          name: `${StockCategory.OverseaIndex}${
            globalState.overseaIndexCount > 0 ? `(${globalState.overseaIndexCount})` : ''
          }`,
        }),
        undefined,
        true
      ),
      new LeekTreeItem(
        Object.assign({ contextValue: 'sectorCategory' }, defaultFundInfo, {
          id: StockCategory.Sector,
          name: `${StockCategory.Sector}${
            globalState.sectorCount > 0 ? `(${globalState.sectorCount})` : ''
          }`,
        }),
        undefined,
        true
      ),
    ];
    // 显示接口不支持的股票，避免用户老问为什么添加了股票没反应
    if (globalState.noDataStockCount) {
      nodes.push(
        new LeekTreeItem(
          Object.assign({ contextValue: 'category' }, defaultFundInfo, {
            id: StockCategory.NODATA,
            name: `${StockCategory.NODATA}(${globalState.noDataStockCount})`,
          }),
          undefined,
          true
        )
      );
    }
    return nodes;
  }
  getAStockNodes(stocks: Promise<LeekTreeItem[]>): Promise<LeekTreeItem[]> {
    const aStocks: Promise<LeekTreeItem[]> = stocks.then((res: LeekTreeItem[]) => {
      const arr = res.filter((item: LeekTreeItem) => /^(sh|sz|bj)/.test(item.type || ''));
      return arr;
    });

    return aStocks;
  }
  getHkStockNodes(stocks: Promise<LeekTreeItem[]>): Promise<LeekTreeItem[]> {
    return stocks.then((res: LeekTreeItem[]) =>
      res.filter((item: LeekTreeItem) => /^(hk)/.test(item.type || ''))
    );
  }
  getUsStockNodes(stocks: Promise<LeekTreeItem[]>): Promise<LeekTreeItem[]> {
    return stocks.then((res: LeekTreeItem[]) =>
      res.filter((item: LeekTreeItem) => /^(usr_)/.test(item.type || ''))
    );
  }
  getBondNodes(stocks: Promise<LeekTreeItem[]>): Promise<LeekTreeItem[]> {
    return stocks.then((res: LeekTreeItem[]) =>
      res.filter((item: LeekTreeItem) => /^(bond)/.test(item.type || ''))
    );
  }
  getFutureStockNodes(stocks: Promise<LeekTreeItem[]>): Promise<LeekTreeItem[]> {
    return stocks.then((res: LeekTreeItem[]) =>
      res.filter((item: LeekTreeItem) => /^(nf_)/.test(item.type || ''))
    );
  }
  getOverseaFutureStockNodes(stocks: Promise<LeekTreeItem[]>): Promise<LeekTreeItem[]> {
    return stocks.then((res: LeekTreeItem[]) =>
      res.filter((item: LeekTreeItem) => /^(hf_)/.test(item.type || ''))
    );
  }
  getOverseaIndexNodes(stocks: Promise<LeekTreeItem[]>): Promise<LeekTreeItem[]> {
    return stocks.then((res: LeekTreeItem[]) =>
      res.filter((item: LeekTreeItem) => /^(oi)/.test(item.type || ''))
    );
  }
  getSectorNodes(stocks: Promise<LeekTreeItem[]>): Promise<LeekTreeItem[]> {
    return stocks.then((res: LeekTreeItem[]) =>
      res.filter((item: LeekTreeItem) => /^(bk)/.test(item.type || ''))
    );
  }
  getNoDataStockNodes(stocks: Promise<LeekTreeItem[]>): Promise<LeekTreeItem[]> {
    return stocks.then((res: LeekTreeItem[]) => {
      return res.filter((item: LeekTreeItem) => {
        return /^(nodata)/.test(item.type || '');
      });
    });
  }

  changeOrder(): void {
    let order = this.order as number;
    order += 1;
    if (order > 1) {
      this.order = SortType.DESC;
    } else if (order === 1) {
      this.order = SortType.ASC;
    } else if (order === 0) {
      this.order = SortType.NORMAL;
    }
    LeekFundConfig.setConfig('leek-fund.stockSort', this.order);
    this.refresh();
  }
}
