// Mobile presentation checks. Uses disposable storage and blocks Firebase traffic.
const {chromium} = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
const server = http.createServer((req,res) => {
  const file = path.resolve(root, req.url === "/" ? "index.html" : req.url.slice(1));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return res.writeHead(404).end();
  res.setHeader("Content-Type", file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "text/html");
  res.end(fs.readFileSync(file));
});
(async () => {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({executablePath:process.env.PW_EXECUTABLE_PATH, channel:process.env.PW_CHANNEL, headless:true});
    const origin = "http://127.0.0.1:" + server.address().port;
    for (const width of [320,390,430,760]) {
      const page = await browser.newPage({viewport:{width,height:844}});
      const errors = [];
      page.on("pageerror", e => errors.push(e.message));
      await page.route("https://**", route => route.abort());
      for (const file of ["firebase-init.js","cloud-sync.js"]) await page.route("**/" + file, route => route.fulfill({contentType:"text/javascript",body:""}));
      await page.goto(origin);
      const existing = {events:[
        {id:"original",day:0,title:"長い予定名でも読みやすく表示する確認",start:"09:00",end:"10:00",category:"study",memo:"既存のメモを保持\n<img src=x onerror=alert(1)>",extra:"keep"},
        {id:"next",day:1,title:"翌日の予定",start:"13:00",end:"14:00",category:"other"}
      ],todos:[{id:"todo",text:"既存のTODO",checked:false}]};
      await page.evaluate(existing => {
        localStorage.setItem("wp_settings_v1", JSON.stringify({currentWeekStart:"2026-11-16"}));
        localStorage.setItem("wp_week_v1_2026-11-16", JSON.stringify(existing));
      }, existing);
      await page.reload();
      assert.equal(await page.evaluate(() => document.body.dataset.mobilePanel),"events");
      assert.equal(await page.locator(".preview-pane").isVisible(),false);
      assert.ok(await page.locator("#printArea").evaluate(node => node.offsetWidth > 0));
      assert.equal(await page.locator(".event-day-heading").count(),2);
      assert.equal(await page.locator("#eventEditor").evaluate(node => node.open),false);
      assert.equal(await page.locator("#eventListUI img").count(),0);
      const memo = page.locator('[data-id="original"] .event-memo');
      await memo.locator("summary").click();
      assert.match(await memo.innerText(),/既存のメモを保持/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true);
      for (const button of await page.locator("#controlTabs button, #mobileAddEventBtn, #mobileImportBtn, #eventListUI .item-actions button").all()) {
        const box = await button.boundingBox();
        assert.ok(box && box.height >= 44, "tap target: " + await button.getAttribute("class"));
      }
      await page.click("#mobileAddEventBtn");
      assert.equal(await page.locator("#eventTitle").evaluate(node => node === document.activeElement),true);
      assert.equal(await page.locator("#eventTitle").evaluate(node => getComputedStyle(node).fontSize),"16px");
      await page.fill("#eventTitle","追加の予定");
      await page.click("#eventSubmitBtn");
      assert.equal((await page.evaluate(() => PaperWeek.getWeekData("2026-11-16"))).events.length,3);
      await page.locator("#eventEditor > summary").click();
      await page.locator('[data-id="original"] .js-edit-event').click();
      assert.equal(await page.locator("#eventEditor").evaluate(node => node.open),true);
      await page.fill("#eventTitle","編集した予定");
      await page.click("#eventSubmitBtn");
      const data = await page.evaluate(() => PaperWeek.getWeekData("2026-11-16"));
      assert.equal(data.events[0].extra,"keep");
      assert.equal(data.events[0].memo,existing.events[0].memo);
      assert.deepEqual(data.todos,existing.todos);
      await page.click('[data-tab="todos"]');
      await page.fill("#todoText","追加のTODO");
      await page.locator("#todoForm button").click();
      assert.equal((await page.evaluate(() => PaperWeek.getWeekData("2026-11-16"))).todos.length,2);
      await page.click('[data-tab="preview"]');
      assert.equal(await page.locator(".preview-pane").isVisible(),true);
      assert.equal(await page.locator("#controlTabs").isVisible(),true);
      await page.waitForFunction(() => document.querySelector("#printArea").getBoundingClientRect().width <= document.querySelector("#previewViewport").clientWidth);
      await page.click('[data-tab="events"]');
      await page.emulateMedia({media:"print"});
      assert.equal(await page.locator("#printArea").isVisible(),true);
      assert.equal(await page.locator("#controlTabs").isVisible(),false);
      await page.emulateMedia({media:"screen"});
      await page.click("#mobileImportBtn");
      assert.equal(await page.locator("#importTools").evaluate(node => node.open),true);
      const json = JSON.stringify({format:"paperweek-events",version:1,timeZone:"Asia/Tokyo",events:[{date:"2026-11-16",title:"取り込みテスト",start:"16:00",end:"17:00"}]});
      await page.setInputFiles("#importFile",{name:"mobile.json",mimeType:"application/json",buffer:Buffer.from(json)});
      await page.locator("#importDialog").waitFor({state:"visible"});
      const waiting = page.waitForEvent("download");
      await page.click("#importDownloadBtn");
      assert.equal(fs.readFileSync(await (await waiting).path(),"utf8"),json);
      await page.click("#importCloseBtn");
      assert.equal((await page.evaluate(() => PaperWeek.getWeekData("2026-11-16"))).events.length,3);
      fs.mkdirSync(path.join(root,"artifacts"),{recursive:true});
      await page.screenshot({path:path.join(root,"artifacts","agenda-" + width + ".png"),fullPage:true});
      await page.setViewportSize({width:1280,height:900});
      await page.click('[data-tab="events"]');
      assert.equal(await page.locator(".preview-pane").isVisible(),true);
      assert.equal(await page.locator("#eventEditor").evaluate(node => node.open),true);
      assert.equal(await page.locator("#eventTitle").isVisible(),true);
      assert.deepEqual(errors,[]);
      await page.close();
    }
    console.log("PASS: mobile agenda/navigation, 320/390/430/760px, tap targets, memo, CRUD and data preservation, print from agenda, import download and desktop resize.");
  } finally { if (browser) await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
