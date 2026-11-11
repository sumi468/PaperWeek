// Regression: handwriting space must not silently replace the selected timeline.
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'artifacts', 'timeline');
fs.mkdirSync(output, { recursive: true });
const server = http.createServer((req, res) => {
  const file = path.resolve(root, req.url === '/' ? 'index.html' : req.url.slice(1));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return res.writeHead(404).end();
  res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
  res.end(fs.readFileSync(file));
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route(/\/(firebase-init|cloud-sync)\.js$/, r => r.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const week = {
      events: [20, 9, 15, 11].map(h => ({ id: String(h), day: 6, start: `${h.toString().padStart(2, '0')}:00`, end: `${h.toString().padStart(2, '0')}:05`, title: `${h}時の予定`, category: 'study', memo: '保持するメモ', extra: 'keep' })),
      todos: [{ id: 'todo', text: '保持するTODO', checked: true }]
    };
    await page.evaluate(week => {
      localStorage.setItem('wp_settings_v1', JSON.stringify({ currentWeekStart: '2026-11-09', template: '01', handwrite: 'analog', timeStart: '07:00', timeEnd: '22:00' }));
      localStorage.setItem('wp_view_v1', JSON.stringify({ mode: 'range', start: '2026-11-15', count: 7 }));
      localStorage.setItem('wp_week_v1_2026-11-09', JSON.stringify(week));
    }, week);
    await page.reload();
    async function assertLayout(template, media) {
      const actual = await page.evaluate(() => ({
        checked: document.querySelector('input[name="template"]:checked').value,
        classes: document.querySelector('#printArea').className,
        timeline: document.querySelectorAll('.pa-hourgrid').length,
        cards: document.querySelectorAll('.pa-daycard').length,
        days: Array.from(document.querySelectorAll('.pa-daylabel-date')).map(n => n.textContent),
        events: Array.from(document.querySelectorAll('.pa-event')).map(n => ({
          time: n.querySelector('.pa-event-time').textContent,
          top: n.offsetTop, height: n.offsetHeight, parent: n.parentElement.clientHeight,
          fraction: parseFloat(n.style.top) / 100
        }))
      }));
      assert.equal(actual.checked, template, media);
      assert.ok(actual.classes.includes(`tpl-${template}`), JSON.stringify(actual));
      if (template === '01') {
        assert.ok(actual.timeline > 0, media);
        assert.equal(actual.cards, 0);
        assert.deepEqual(actual.events.map(n => n.time), ['09:00〜09:05', '11:00〜11:05', '15:00〜15:05', '20:00〜20:05']);
        for (const ev of actual.events) {
          assert.ok(ev.parent > 0 && ev.height > 0);
          assert.ok(Math.abs(ev.top - ev.fraction * ev.parent) <= 1, JSON.stringify(ev));
        }
        for (let i = 1; i < actual.events.length; i++) assert.ok(actual.events[i].top > actual.events[i - 1].top);
        assert.ok((await page.locator('.pa-timecol-label').count()) > 0);
        const columns = await page.locator('.pa-timecol').evaluateAll(nodes => nodes.map(column =>
          Array.from(column.querySelectorAll('.pa-timecol-label')).filter(n => !n.hidden).map(n => {
            const r = n.getBoundingClientRect();
            return { text: n.textContent, top: r.top, bottom: r.bottom };
          })
        ));
        for (const labels of columns) {
          assert.equal(labels[0].text, '07:00');
          assert.equal(labels[labels.length - 1].text, '22:00');
          for (let i = 1; i < labels.length; i++) assert.ok(labels[i].top >= labels[i - 1].bottom - 1, `${media}: ${JSON.stringify(labels)}`);
        }
      } else {
        assert.equal(actual.timeline, 0);
        assert.ok(actual.cards > 0);
      }
    }
    // Existing saved settings are repaired on load without a data migration.
    await assertLayout('01', 'restored settings');
    for (const orientation of ['landscape', 'portrait']) {
      await page.locator(`[data-orientation="${orientation}"]`).click();
      for (const count of ['1', '2', '7']) {
        await page.selectOption('#viewCount', count);
        for (const template of ['01', '02', '03']) {
          await page.check(`input[name="template"][value="${template}"]`);
          for (const level of ['less', 'standard', 'more', 'analog']) {
            await page.locator(`[data-level="${level}"]`).click();
            for (const media of ['screen', 'print']) {
              await page.emulateMedia({ media });
              await assertLayout(template, `${orientation}/${count}/${level}/${media}`);
            }
            await page.emulateMedia({ media: 'screen' });
          }
        }
      }
    }
    await page.check('input[name="template"][value="01"]');
    await page.reload();
    await assertLayout('01', 'reload');
    // Settings received through the existing cloud bridge retain the timeline too.
    await page.evaluate(() => PaperWeek.applyRemoteSettings({ template: '01', handwrite: 'analog' }));
    await assertLayout('01', 'cloud settings');
    await page.locator('[data-orientation="landscape"]').click();
    await page.selectOption('#viewCount', '2');
    const details = await page.locator('.pa-details-body').allTextContents();
    const detailText = details.join('');
    assert.ok(detailText.includes('保持するメモ'));
    const positions = ['09:00', '11:00', '15:00', '20:00'].map(time => detailText.indexOf(time));
    assert.ok(positions.every(p => p >= 0));
    assert.deepEqual(positions, positions.slice().sort((a, b) => a - b), detailText);
    assert.deepEqual(await page.evaluate(() => PaperWeek.getWeekData('2026-11-09')), week);
    await page.screenshot({ path: path.join(output, 'timeline.png'), fullPage: true });
    await page.emulateMedia({ media: 'print' });
    await page.pdf({ path: path.join(output, 'timeline.pdf'), preferCSSPageSize: true, printBackground: true });
    assert.deepEqual(errors, []);
    console.log('PASS: 144 template/handwriting/orientation/date/media combinations; saved/cloud settings; chronological positions and continuation; unchanged events, metadata and TODOs');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); server.close(); process.exitCode = 1; });
