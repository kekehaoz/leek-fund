import { throttle } from 'lodash';
import { OutputChannel, StatusBarAlignment, StatusBarItem, window } from 'vscode';
import { LeekFundConfig } from '../../shared/leekConfig';
import StockChangesDaemon, { StockChangesServerInterface } from './StockChangesDaemon';

export default class StockChangesOutputServer implements StockChangesServerInterface {
  changesBarItem: StatusBarItem | undefined;
  public op: OutputChannel | undefined;
  public changesCount: number = 0;

  isEnableOutput: boolean = false;
  changesCache: string[] = [];
  unregisterServer: (() => void) | undefined;

  constructor() {
    this.isEnableOutput = LeekFundConfig.getConfig('data-lens.stock-changes');
    this.updateChangesBarItem = throttle(this.updateChangesBarItem, 1000);
    this.setup();
  }

  setup() {
    if (this.isEnableOutput) {
      this.op = window.createOutputChannel('韭菜盒子 - 盘口异动');
      this.changesBarItem = window.createStatusBarItem(StatusBarAlignment.Right, 3);
      this.changesBarItem.text = `📈 ${this.changesCount}`;
      this.changesBarItem.command = 'data-lens.stock-changes-show';
      this.changesBarItem.show();
      this.unregisterServer = StockChangesDaemon.registerServer(this);
    }
  }

  reload() {
    const _enable: boolean = LeekFundConfig.getConfig('data-lens.stock-changes');
    if (this.isEnableOutput !== _enable) {
      this.isEnableOutput = _enable;
      if (!_enable) {
        this.destroy();
      } else {
        this.setup();
      }
    }
  }

  destroy() {
    this.changesCount = 0;
    this.changesCache.length = 0;
    this.unregisterServer?.();
    this.unregisterServer = undefined;
    this.op?.dispose();
    this.op = undefined;
    this.changesBarItem?.dispose();
    this.changesBarItem = undefined;
  }

  print(changes: string) {
    if (!this.isEnableOutput) return;
    this.changesCount++;
    this.changesCache.push(changes);
    this.changesCache = this.changesCache.slice(-5);
    this.updateChangesBarItem();
    this.op?.appendLine(`${changes}\r\n-----------------------------`);
  }

  updateChangesBarItem() {
    if (this.changesBarItem) {
      this.changesBarItem.text = `📈 ${this.changesCount}`;
      this.changesBarItem.tooltip = `${this.changesCache.join(
        '\r\n-----------------------------\r\n'
      )}`;
      this.changesBarItem.show();
    }
  }

  showOutput() {
    this.op?.show();
    this.changesCount = 0;
    if (this.changesBarItem) {
      this.changesBarItem.text = `📈 ${this.changesCount}`;
      this.changesBarItem.show();
    }
  }
}
