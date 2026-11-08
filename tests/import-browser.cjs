// Isolated browser test; no production sign-in or Firebase traffic.
const {chromium}=require('playwright');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
  const file=path.resolve(root,req.url==='/'?'index.html':req.url.slice(1));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');
  res.end(fs.readFileSync(file));
});
const payload=JSON.stringify({format:'paperweek-events',version:1,timeZone:'Asia/Tokyo',events:[
  {date:'2026-11-09',title:'<img src=x onerror=alert(1)>',start:'19:00',end:'20:30',memo:'keep memo',sourceId:'one'},
  {date:'2026-11-16',title:'Next week',start:'10:00',end:'11:00',sourceId:'two'}
]});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    browser=await chromium.launch({executablePath:process.env.PW_EXECUTABLE_PATH,channel:process.env.PW_CHANNEL,headless:true});
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://**',route=>route.abort());
    for(const file of ['firebase-init.js','cloud-sync.js']) await page.route('**/'+file,route=>route.fulfill({contentType:'text/javascript',body:''}));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const original={events:[{id:'original',day:1,title:'Existing',start:'11:00',end:'12:00',memo:'unchanged',extra:42}],todos:[{id:'todo',text:'Keep TODO',checked:true}]};
    await page.evaluate(original=>{
      localStorage.setItem('wp_week_v1_2026-11-09',JSON.stringify(original));
      localStorage.setItem('wp_settings_v1',JSON.stringify({currentWeekStart:'2026-11-09'}));
    },original);
    await page.reload();
    await page.click('[data-tab="events"]');
    async function choose(content=payload) {
      await page.setInputFiles('#importFile',{name:'events.json',mimeType:'application/json',buffer:Buffer.from(content)});
      await page.locator('#importDialog').waitFor({state:'visible'});
    }
    await choose();
    assert.match(await page.locator('#importSummary').innerText(),/2件.*Asia\/Tokyo/);
    assert.equal(await page.locator('#importPreview img').count(),0);
    assert.match(await page.locator('#importPreview').innerText(),/<img src=x/);
    await page.click('#importCloseBtn');
    assert.deepEqual(await page.evaluate(()=>PaperWeek.getWeekData('2026-11-09')),original);
    await choose();
    // Default account destination must not silently save on device when signed out.
    await page.click('#importConfirmBtn');
    assert.match(await page.locator('#importDialogStatus').innerText(),/ログイン/);
    assert.deepEqual(await page.evaluate(()=>PaperWeek.getWeekData('2026-11-09')),original);
    await page.selectOption('#importDestination','device');
    await page.click('#importConfirmBtn');
    await page.waitForFunction(()=>document.querySelector('#importConfirmBtn').hidden);
    assert.match(await page.locator('#importStatus').innerText(),/2件.*重複0件/);
    let week=await page.evaluate(()=>PaperWeek.getWeekData('2026-11-09'));
    assert.deepEqual(week.events[0],original.events[0]);
    assert.deepEqual(week.todos,original.todos);
    assert.equal(week.events[1].memo,'keep memo');
    assert.equal((await page.evaluate(()=>PaperWeek.getWeekData('2026-11-16'))).events.length,1);
    await page.click('#importCloseBtn');
    await choose();await page.selectOption('#importDestination','device');await page.click('#importConfirmBtn');
    await page.waitForFunction(()=>document.querySelector('#importConfirmBtn').hidden);
    assert.match(await page.locator('#importStatus').innerText(),/0件.*重複2件/);
    await page.click('#importCloseBtn');
    await page.reload();await page.click('[data-tab="events"]');
    assert.equal((await page.evaluate(()=>PaperWeek.getWeekData('2026-11-09'))).events.length,2);
    // Entire invalid files are rejected without writing their otherwise valid rows.
    await page.setInputFiles('#importFile',{name:'invalid.json',mimeType:'application/json',buffer:Buffer.from(payload.replace('2026-11-16','2026-02-30'))});
    await page.waitForFunction(()=>document.querySelector('#importStatus').textContent.includes('日付'));
    assert.equal(await page.locator('#importDialog:visible').count(),0);
    // Roll back earlier weeks on local quota failure.
    await page.evaluate(()=>{
      window.originalSet=Storage.prototype.setItem;
      Storage.prototype.setItem=function(key,value){if(key==='wp_week_v1_2026-11-30') throw new DOMException('quota','QuotaExceededError');return window.originalSet.call(this,key,value);};
    });
    await choose(payload.replaceAll('2026-11-09','2026-11-23').replaceAll('2026-11-16','2026-11-30'));
    await page.selectOption('#importDestination','device');await page.click('#importConfirmBtn');
    await page.waitForFunction(()=>document.querySelector('#importDialogStatus').textContent.includes('空き容量'));
    assert.equal(await page.evaluate(()=>localStorage.getItem('wp_week_v1_2026-11-23')),null);
    await page.evaluate(()=>{Storage.prototype.setItem=window.originalSet;});
    await page.click('#importCloseBtn');
    // Account mode calls the cloud adapter and remains retryable on network errors.
    await page.evaluate(()=>{
      window.PaperWeekCloud={getImportAccount:()=>({uid:'user',email:'user@example.test'}),importEvents:async()=>{throw {code:'unavailable'};}};
    });
    await choose();await page.click('#importConfirmBtn');
    await page.waitForFunction(()=>document.querySelector('#importDialogStatus').textContent.includes('通信状態'));
    assert.equal(await page.locator('#importConfirmBtn').isVisible(),true);
    await page.evaluate(()=>{window.PaperWeekCloud.importEvents=async events=>{window.imported=events;return {added:2,skipped:0};};});
    await page.click('#importConfirmBtn');
    await page.waitForFunction(()=>document.querySelector('#importConfirmBtn').hidden);
    assert.equal(await page.evaluate(()=>window.imported.length),2);
    assert.match(await page.locator('#importStatus').innerText(),/アカウントに保存/);
    // Narrow viewport preview remains within the screen.
    await page.click('#importCloseBtn');
    await page.setViewportSize({width:390,height:844});
    await choose();
    const box=await page.locator('#importDialog').boundingBox();
    assert.ok(box.x>=0 && box.x+box.width<=390);
    fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});
    await page.screenshot({path:path.join(root,'artifacts/import-mobile.png'),fullPage:true});
    await page.setViewportSize({width:1440,height:1000});
    await page.screenshot({path:path.join(root,'artifacts/import-desktop.png'),fullPage:true});
    assert.deepEqual(errors,[]);
    console.log('Import browser checks passed: preview, cancel, local/account saves, retry, duplicates, persistence, validation, rollback, 390px.');
  } finally {if(browser) await browser.close();server.close();}
})().catch(err=>{console.error(err);process.exitCode=1;});
