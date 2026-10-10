const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'artifacts', 'regressions');
fs.mkdirSync(output, {recursive:true});
const server = http.createServer((req, res) => {
  const file = path.join(root, req.url === '/' ? 'index.html' : req.url.slice(1));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
  res.end(fs.readFileSync(file));
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    await page.route(/\/(firebase-init|cloud-sync)\.js$/, r => r.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.evaluate(() => {
      localStorage.setItem('wp_settings_v1', JSON.stringify({ currentWeekStart:'2026-10-12', orientation:'landscape', timeStart:'07:00', timeEnd:'22:00' }));
      localStorage.setItem('wp_view_v1', JSON.stringify({ mode:'range', start:'2026-10-12', count:1 }));
      const slots = [[7,10,'数学A'],[10,12,'現代の国語'],[12,13,'昼休憩'],[13,15,'歴史総合'],[15,18,'生物'],[18,19,'夜休憩'],[19,21,'英語コミュニケーション'],[21,22,'数学２']];
      localStorage.setItem('wp_week_v1_2026-10-12', JSON.stringify({events:slots.map(([start,end,title],i)=>({id:String(i),day:0,start:String(start).padStart(2,'0')+':00',end:String(end).padStart(2,'0')+':00',title,category:'study'})),todos:[]}));
    });
    await page.reload();
    for (const count of ['1','2','3','7']) {
      await page.selectOption('#viewCount', count);
      for (const media of ['screen','print']) {
        await page.emulateMedia({ media });
        const clipped = await page.locator('.pa-event').evaluateAll(nodes => nodes.filter(n=>n.scrollHeight>n.clientHeight+1 || n.scrollWidth>n.clientWidth+1).map(n=>n.innerText));
        assert.deepEqual(clipped, [], `${count} days / ${media}`);
        assert.equal(await page.locator('.pa-sheet').count(), 1);
      }
      await page.emulateMedia({media:'screen'});
    }
    await page.selectOption('#viewCount','1');
    await page.emulateMedia({media:'print'});
    await page.pdf({path:path.join(output,'short-events-fixed.pdf'),preferCSSPageSize:true,printBackground:true});
    console.log('PASS: 1/2/3/7 days, screen and print; all eight event labels fit; one A4 sheet');
  } finally { await browser.close(); server.close(); }
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
