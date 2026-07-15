import { ViewColumn } from 'vscode';
import ReusedWebviewPanel from './ReusedWebviewPanel';

function overseaIndexTrend(code: string, name: string, stockCode: string) {
  const symbol = stockCode.replace('oi_', '').toUpperCase();
  const url = `https://quote.eastmoney.com/gb/zs${symbol}.html`;

  const panel = ReusedWebviewPanel.create(
    'overseaIndexTrendWebview',
    `海外指数走势(${name})`,
    ViewColumn.One,
    { enableScripts: true }
  );

  panel.webview.html = `
  <!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>海外指数走势</title>
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

export default overseaIndexTrend;
