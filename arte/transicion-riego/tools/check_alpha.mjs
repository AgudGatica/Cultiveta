// Comprueba en Chrome que el WebM conserva la transparencia: lo reproduce de corrido (como la app),
// lee píxeles con un canvas y los compara con el PNG maestro del mismo cuadro.
// Uso: node tools/check_alpha.mjs <carpeta render> <mobile|desktop> [url|blob] [seek]
import { chromium } from 'playwright';
import http from 'node:http';
import { readFileSync, existsSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';

const [dir, fmt, how = 'blob', seek = ''] = process.argv.slice(2);
const root = path.resolve(dir);
const types = { '.webm': 'video/webm', '.png': 'image/png', '.mp4': 'video/mp4' };
const server = http.createServer((req, res) => {
  if (req.url === '/') { res.setHeader('content-type', 'text/html'); res.end('<body style="margin:0;background:#ff00ff"></body>'); return; }
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(root) || !existsSync(p)) { res.statusCode = 404; res.end('no'); return; }
  const size = statSync(p).size;
  res.setHeader('content-type', types[path.extname(p)] || 'application/octet-stream');
  res.setHeader('accept-ranges', 'bytes');
  const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
  if (m) {
    const a = +m[1], b = m[2] ? +m[2] : size - 1;
    res.statusCode = 206;
    res.setHeader('content-range', `bytes ${a}-${b}/${size}`);
    res.end(readFileSync(p).subarray(a, b + 1));
  } else res.end(readFileSync(p));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--autoplay-policy=no-user-gesture-required'] });
let exit = 0;
try {
  const page = await browser.newPage({ viewport: { width: 540, height: 540 } });
  page.on('crash', () => console.log('LA PÁGINA SE CAYÓ'));
  page.on('console', (m) => { if (m.type() === 'error') console.log('consola:', m.text()); });
  await page.goto(base + '/');
  const report = await page.evaluate(async ({ fmt, how, seek }) => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto';
    v.src = how === 'blob' ? URL.createObjectURL(await (await fetch(`/riego-${fmt}.webm`)).blob()) : `/riego-${fmt}.webm`;
    v.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;object-fit:contain';
    document.body.append(v);
    const t0 = Date.now();
    while (v.readyState < 2 && !v.error && Date.now() - t0 < 15000) await wait(50);
    if (v.error || v.readyState < 2) return { error: v.error ? v.error.message : 'no cargó' };
    const W = v.videoWidth, H = v.videoHeight, S = 4;          // se compara a 1/4 de tamaño
    const cw = W / S, ch = H / S;
    const c = document.createElement('canvas'); c.width = cw; c.height = ch;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const out = { como: how, duration: v.duration, w: W, h: H, canPlay: v.canPlayType('video/webm; codecs="vp9"'), frames: [] };
    const want = [1, 4, 10, 15, 20, 24, 28, 34, 41, 46, 47, 48];
    const got = new Map();
    const grab = (frame) => { ctx.clearRect(0, 0, cw, ch); ctx.drawImage(v, 0, 0, cw, ch); got.set(frame, ctx.getImageData(0, 0, cw, ch).data); };

    if (seek) {
      for (const frame of want) {
        v.currentTime = (frame - 0.5) / 24;
        const t1 = Date.now();
        while (v.seeking && Date.now() - t1 < 8000) await wait(20);
        await wait(150);
        grab(frame);
      }
    } else {
      v.playbackRate = 0.25;
      await new Promise((resolve) => {
        const onFrame = (_now, meta) => {
          const frame = Math.round(meta.mediaTime * 24) + 1;
          if (want.includes(frame) && !got.has(frame)) grab(frame);
          if (!v.ended) v.requestVideoFrameCallback(onFrame);
        };
        v.requestVideoFrameCallback(onFrame);
        v.onended = () => resolve();
        setTimeout(resolve, 20000);
        v.play();
      });
      out.terminó = v.ended;
    }

    const pc = document.createElement('canvas'); pc.width = cw; pc.height = ch;
    const pctx = pc.getContext('2d', { willReadFrequently: true });
    for (const frame of want) {
      const vid = got.get(frame);
      if (!vid) { out.frames.push({ frame, falta: true }); continue; }
      const img = new Image(); img.src = `/${fmt}/png/riego_${fmt}_${String(frame).padStart(4, '0')}.png`; await img.decode();
      pctx.clearRect(0, 0, cw, ch); pctx.drawImage(img, 0, 0, cw, ch);
      const png = pctx.getImageData(0, 0, cw, ch).data;
      let transp = 0, pTransp = 0, aDiff = 0, cDiff = 0, cN = 0;
      for (let i = 0; i < vid.length; i += 4) {
        const a = vid[i + 3], pa = png[i + 3];
        if (a < 8) transp++;
        if (pa < 8) pTransp++;
        aDiff += Math.abs(a - pa);
        if (a > 250 && pa > 250) { cDiff += Math.abs(vid[i] - png[i]) + Math.abs(vid[i + 1] - png[i + 1]) + Math.abs(vid[i + 2] - png[i + 2]); cN++; }
      }
      const n = vid.length / 4;
      out.frames.push({ frame, transparenteVideo: +(transp / n * 100).toFixed(1), transparentePng: +(pTransp / n * 100).toFixed(1),
        difAlfa: +(aDiff / n).toFixed(2), difColor: cN ? +(cDiff / cN / 3).toFixed(2) : null });
    }
    v.pause(); v.currentTime = 14.5 / 24; await wait(500);
    return out;
  }, { fmt, how, seek });
  console.log(JSON.stringify(report));
  writeFileSync(path.join(root, `alpha-${fmt}.png`), await page.screenshot({ type: 'png' }));
} catch (e) {
  console.log('ERROR:', String(e.message).split('\n')[0]);
  exit = 1;
} finally {
  await browser.close().catch(() => {});
  server.close();
}
process.exit(exit);
