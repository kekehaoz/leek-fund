import { ViewColumn } from 'vscode';
import ReusedWebviewPanel from './ReusedWebviewPanel';

// 美债收益率走势：嵌入东方财富 171.{SYMBOL} 行情页
function bondTrend(code: string, name: string, stockCode: string) {
  const symbol = stockCode.replace('bond_', '').toUpperCase();
  // 东方财富 secid 为 171.{SYMBOL}，对应页面 https://quote.eastmoney.com/stock/171.{SYMBOL}.html
  const url = `https://quote.eastmoney.com/stock/171.${symbol}.html`;

  const panel = ReusedWebviewPanel.create(
    'bondTrendWebview',
    `美债收益率走势(${name})`,
    ViewColumn.One,
    { enableScripts: true }
  );

  panel.webview.html = `
  <!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>美债收益率走势</title>
    <style>
    html.vscode-dark, body.vscode-dark, html.vscode-high-contrast, body.vscode-high-contrast {
      filter: invert(100%) hue-rotate(180deg);
    }
    </style>
  </head>
  <body>
    <div style="min-width: 1320px; overflow-x:auto">
    <iframe
      src="${url}"
      frameborder="0"
      style="width: 100%; height: 900px"
    ></iframe>
    </div>
  </body>
</html>
  `;
}

export default bondTrend;
