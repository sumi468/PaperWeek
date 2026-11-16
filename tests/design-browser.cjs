// Layout and interaction regressions for the polished phone UI. No live Firebase access.
const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,req.url==='/'?'index.html':req.url.slice(1));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return res.writeHead(404).end();
 res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');
 res.end(fs.readFileSync(file));
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:process.env.PW_EXECUTABLE_PATH,channel:process.env.PW_CHANNEL,headless:true});
 try{
  for(const [width,height] of [[320,568],[360,640],[390,844],[430,932],[760,844],[844,390]]){
   const mobile=width<=760||(width<=980&&height<=500);
   const page=await browser.newPage({viewport:{width,height},locale:'ja-JP',reducedMotion:'reduce'});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('https://**',route=>route.abort());
   for(const file of ['firebase-init.js','cloud-sync.js'])await page.route('**/'+file,route=>route.fulfill({contentType:'text/javascript',body:''}));
   await page.goto('http://127.0.0.1:'+server.address().port);
   await page.evaluate(()=>{
    document.body.classList.add('pw-cloud-enabled');
    document.getElementById('authStateOut').hidden=true;
    document.getElementById('authStateIn').hidden=false;
    document.getElementById('authEmailLabel').textContent='long-account-address@example.test';
   });
   for(const tab of ['events','todos','settings']){
    await page.click('[data-tab="'+tab+'"]');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,tab+' '+width);
   }
   if(mobile){
    for(const button of await page.locator('#topbarAuth button:visible, #topbarAuth input:visible, .topbar .icon-btn, #todayBtn, #printBtn').all()){
     const box=await button.boundingBox();
     assert.ok(box.width>=44&&box.height>=44,'touch target '+await button.getAttribute('id'));
    }
    await page.fill('#viewStart','2026-12-28');await page.dispatchEvent('#viewStart','change');
    await page.selectOption('#viewCount','7');
    assert.match(await page.locator('#mobileWeekRange').innerText(),/2027年1月3日/);
    assert.match(await page.locator('#mobileWeekRange').getAttribute('aria-label'),/2026\/12\/28/);
    await page.selectOption('#viewCount','1');
    assert.match(await page.locator('#mobileWeekRange').innerText(),/1日間/);
    await page.click('[data-mode="custom"]');
    await page.fill('#customDate','2027-01-03');await page.click('#addDateBtn');
    assert.match(await page.locator('#mobileWeekRange').innerText(),/選択した2日間/);
   }
   await page.click('[data-tab="events"]');
   if(mobile)assert.match(await page.locator('#mobileEventCount').innerText(),/0件/);
   const payload=JSON.stringify({format:'paperweek-events',version:1,timeZone:'Asia/Tokyo',events:[{date:'2026-11-16',title:'長い予定名でも内容を確認できる予定表のデザイン確認',start:'09:00',end:'10:30',memo:'長いメモも省略せずに確認できます。\n'.repeat(30)}]});
   await page.setInputFiles('#importFile',{name:'design.json',mimeType:'application/json',buffer:Buffer.from(payload)});
   await page.locator('#importDialog').waitFor({state:'visible'});
   const dialog=await page.locator('#importDialog').boundingBox();
   assert.ok(dialog.x>=0&&dialog.y>=0&&dialog.x+dialog.width<=width&&dialog.y+dialog.height<=height,JSON.stringify({width,height,dialog}));
   await page.locator('.import-event-memo > summary').click();
   assert.match(await page.locator('.import-event-memo p').innerText(),/省略せずに/);
   await page.click('#importConfirmBtn');
   assert.equal(await page.locator('#importDialogStatus').getAttribute('data-state'),'error');
   await page.selectOption('#importDestination','device');
   await page.click('#importConfirmBtn');
   await page.waitForFunction(()=>document.querySelector('#importConfirmBtn').hidden);
   assert.equal(await page.locator('#importDialogStatus').getAttribute('data-state'),'success');
   await page.click('#importCloseBtn');
   assert.equal((await page.evaluate(()=>PaperWeek.getWeekData('2026-11-16'))).events.length,1);
   if(mobile){
    assert.match(await page.locator('#mobileEventCount').innerText(),/1件/);
    await page.locator('.js-edit-event').click();
    await page.waitForFunction(()=>document.querySelector('#eventEditorLabel').textContent==='予定を編集');
    await page.click('#eventCancelBtn');
    await page.waitForFunction(()=>document.querySelector('#eventEditorLabel').textContent==='予定を追加');
    await page.click('[data-tab="todos"]');
    await page.fill('#todoText','大きなチェック領域の確認');await page.locator('#todoForm button').click();
    const checkbox=page.locator('.todo-check');const box=await checkbox.boundingBox();
    assert.ok(box.width>=44&&box.height>=44);
    await checkbox.click();assert.equal(await page.locator('.js-toggle-todo').isChecked(),true);
   }
   assert.deepEqual(errors,[]);
   fs.mkdirSync(path.join(root,'artifacts','design'),{recursive:true});
   await page.screenshot({path:path.join(root,'artifacts','design',width+'x'+height+'.png'),fullPage:true});
   await page.close();
  }
  console.log('PASS: six phone/tablet/landscape sizes, touch targets, empty state, single/custom/year-crossing periods, long-memo dialog, import error/success, editor labels, TODO check area, reduced motion.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
