const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const dates = require('../dates.js');
const server = http.createServer((req, res) => {
  const file = path.resolve(root, req.url === '/' ? 'index.html' : req.url.slice(1));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
  res.end(fs.readFileSync(file));
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel:'msedge', headless:true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route(/\/(firebase-init|cloud-sync)\.js$/, r => r.fulfill({contentType:'text/javascript',body:''}));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    for (const mode of ['range','custom']) {
      for (const start of ['2026-11-29','2026-12-31']) {
        await page.evaluate(({mode,start}) => {
          localStorage.setItem('wp_view_v1',JSON.stringify({mode,start,count:1,dates:[start]}));
          const api = window.PaperWeekDates;
          for (const iso of [start,api.add(start,1)]) {
            const week = api.week(iso);
            const key = 'wp_week_v1_'+week;
            const data = JSON.parse(localStorage.getItem(key) || '{"events":[],"todos":[]}');
            if (!data.events.some(ev => ev.id === iso)) data.events.push({id:iso,day:api.day(iso),title:'Navigation test '+iso,start:'09:00',end:'10:00',category:'other',memo:'Keep this memo'});
            localStorage.setItem(key,JSON.stringify(data));
          }
        }, {mode,start});
        await page.reload();
        await page.setViewportSize({width:1280,height:900});
        const next = dates.add(start,1);
        const original = await page.evaluate(() => PaperWeek.getAllLocalWeeks());
        // A burst is one navigation, including at a week/year boundary.
        await page.evaluate(() => { for(let i=0;i<30;i++) document.querySelector('#nextWeekBtn').click(); });
        assert.deepEqual(await page.evaluate(() => PaperWeek.getVisibleDates()),[next]);
        assert.ok((await page.locator('#eventListUI').innerText()).includes('Navigation test '+next));
        await page.waitForFunction(() => !document.querySelector('#nextWeekBtn').disabled);
        assert.equal(await page.getAttribute('#nextWeekBtn','aria-label'),'次の日');
        assert.match(await page.locator('#mobileWeekRange').innerText(), new RegExp(`${dates.parse(next).getMonth()+1}月${dates.parse(next).getDate()}日`));
        await page.reload();
        assert.deepEqual(await page.evaluate(() => PaperWeek.getVisibleDates()),[next]);
        await page.click('#prevWeekBtn');
        assert.deepEqual(await page.evaluate(() => PaperWeek.getVisibleDates()),[start]);
        await page.waitForFunction(() => !document.querySelector('#nextWeekBtn').disabled);
        // Repeated deliberate clicks still work and never get stuck disabled.
        for(let i=1;i<=5;i++) {
          await page.click('#nextWeekBtn');
          assert.deepEqual(await page.evaluate(() => PaperWeek.getVisibleDates()),[dates.add(start,i)]);
          await page.waitForFunction(() => !document.querySelector('#nextWeekBtn').disabled);
        }
        assert.deepEqual(await page.evaluate(() => PaperWeek.getAllLocalWeeks()), original);
      }
    }
    await page.setViewportSize({width:390,height:844});
    await page.click('#nextWeekBtn');
    assert.equal(await page.locator('.pa-daylabel').count(),1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true);
    assert.deepEqual(errors,[]);
    console.log('PASS: single-day range/custom navigation, week/year boundaries, reload, 30-click bursts, repeated navigation, mobile, data unchanged');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); server.close(); process.exitCode=1; });
