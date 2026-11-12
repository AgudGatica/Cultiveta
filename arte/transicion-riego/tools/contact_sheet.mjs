// Hoja de contactos: junta cuadros PNG (con transparencia) sobre un damero y los numera.
// Uso: node tools/contact_sheet.mjs <carpeta png> <salida.png> [columnas=12] [ancho miniatura=150] [cuadros "1,4,7" o "all"]
import { chromium } from 'playwright';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [dir, out, colsArg = '12', widthArg = '150', framesArg = 'all'] = process.argv.slice(2);
const cols = +colsArg, tw = +widthArg;
let files = readdirSync(dir).filter((f) => /_\d{4}\.png$/.test(f)).sort();
if (framesArg !== 'all') {
  const want = new Set(framesArg.split(',').map(Number));
  files = files.filter((f) => want.has(+f.match(/_(\d{4})\.png$/)[1]));
}
const cells = files.map((f) => {
  const n = +f.match(/_(\d{4})\.png$/)[1];
  const src = 'data:image/png;base64,' + readFileSync(path.join(dir, f)).toString('base64');
  return `<figure><img src="${src}"><figcaption>${n}</figcaption></figure>`;
}).join('');
const html = `<body><style>
body{margin:0;padding:10px;background:#1b1420;display:grid;grid-template-columns:repeat(${cols},${tw}px);gap:8px;width:max-content;font:700 13px system-ui;color:#fff}
figure{margin:0}
img{width:${tw}px;display:block;border:1px solid #000;background:repeating-conic-gradient(#F4845F 0 25%,#F7B267 0 50%) 0 0/24px 24px}
figcaption{text-align:center;padding:2px 0}
</style>${cells}</body>`;
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ deviceScaleFactor: 1 });
await page.setContent(html);
await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
const el = await page.$('body');
writeFileSync(out, await el.screenshot({ type: 'png' }));
console.log('hoja', out, files.length, 'cuadros');
await browser.close();
