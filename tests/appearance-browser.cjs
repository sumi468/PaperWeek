// Disposable browser/storage only; no requests reach the live Firebase project.
const {chromium} = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'artifacts', 'appearance');
fs.mkdirSync(output, {recursive:true});
const server = http.createServer((req,res) => {
  const filename = new URL(req.url,'http://localhost').pathname;
  const file = path.resolve(root, filename === '/' ? 'index.html' : filename.slice(1));
  if (!file.startsWith(root+path.sep) || !fs.existsSync(file)) return res.writeHead(404).end();
  const type = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.png') ? 'image/png' : file.endsWith('.ico') ? 'image/x-icon' : 'text/html';
  res.setHeader('Content-Type',type); res.end(fs.readFileSync(file));
});
async function isolate(page) {
  await page.route('https://**',route=>route.abort());
  for (const file of ['firebase-init.js','cloud-sync.js']) await page.route('**/'+file,route=>route.fulfill({contentType:'text/javascript',body:''}));
}
async function ready(page) { await page.waitForFunction(()=>document.documentElement.dataset.boot==='ready' && !document.getElementById('appSplash')); }
async function theme(page,value) {
  await page.click('[data-tab="settings"]');
  await page.click(`[data-theme-choice="${value}"]`);
  await page.waitForTimeout(280); // Theme surface transitions must settle before color comparison.
}
async function paper(page) {
  return page.locator('#printArea').evaluate(area=>[area,...area.querySelectorAll('*')].map(node=>{
    const s=getComputedStyle(node);
    return [node.className,s.color,s.backgroundColor,s.borderColor,s.fontSize,node.offsetWidth,node.offsetHeight];
  }));
}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser = await chromium.launch({channel:process.env.PW_CHANNEL || 'msedge',headless:true});
  try {
    const origin=`http://127.0.0.1:${server.address().port}`;
    const context=await browser.newContext({viewport:{width:1440,height:1040},colorScheme:'dark',reducedMotion:'no-preference'});
    await context.addInitScript(()=>{
      if (localStorage.getItem('appearance_test_fixture')) return;
      localStorage.setItem('appearance_test_fixture','1');
      localStorage.setItem('wp_settings_v1',JSON.stringify({currentWeekStart:'2026-11-23'}));
      localStorage.setItem('wp_view_v1',JSON.stringify({mode:'range',start:'2026-11-23',count:3}));
      localStorage.setItem('wp_week_v1_2026-11-23',JSON.stringify({events:[
        {id:'class',day:0,title:'数学の演習',start:'09:00',end:'11:00',category:'study',memo:'問題集の復習も忘れずに。'},
        {id:'code',day:1,title:'アプリをつくる',start:'14:00',end:'17:00',category:'private',memo:'アイデアを少しずつ形にする。'}
      ],todos:[{id:'todo',text:'今週の目標を振り返る',checked:false}]}));
    });
    const page=await context.newPage();
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await isolate(page);
    let release;
    const gate=new Promise(resolve=>{release=resolve;});
    await page.route('**/app.js',async route=>{await gate;await route.continue();});
    const navigation=page.goto(origin,{waitUntil:'domcontentloaded'});
    navigation.catch(()=>{}); // The gate may still be closed if an assertion fails.
    await page.locator('#appSplash').waitFor({state:'visible'});
    assert.equal(await page.locator('.splash-wordmark').textContent(),'PaperWeek');
    await page.screenshot({path:path.join(output,'launch-dark.png'),animations:'disabled'});
    release(); await navigation;
    await ready(page);
    assert.equal(await page.getAttribute('html','data-theme'),'dark');
    assert.equal(await page.getAttribute('html','data-theme-preference'),'system');
    assert.equal(await page.getAttribute('#themeToggle','aria-pressed'),'true');
    const stored=await page.evaluate(()=>({settings:localStorage.getItem('wp_settings_v1'),view:localStorage.getItem('wp_view_v1'),weeks:PaperWeek.getAllLocalWeeks()}));
    const darkPaper=await paper(page);
    await page.screenshot({path:path.join(output,'desktop-dark.png'),fullPage:true,animations:'disabled'});
    await theme(page,'light');
    assert.equal(await page.getAttribute('html','data-theme'),'light');
    assert.deepEqual(await paper(page),darkPaper,'screen paper must match exactly in both themes');
    await page.screenshot({path:path.join(output,'desktop-light.png'),fullPage:true,animations:'disabled'});
    await page.emulateMedia({media:'print'});
    const lightPrint=await paper(page);
    assert.equal(await page.locator('#themeToggle').isVisible(),false);
    await page.pdf({path:path.join(output,'light.pdf'),preferCSSPageSize:true,printBackground:true});
    await page.emulateMedia({media:'screen'});
    await theme(page,'dark');
    await page.emulateMedia({media:'print'});
    assert.deepEqual(await paper(page),lightPrint,'print must match exactly in both themes');
    assert.equal(await page.locator('html').evaluate(e=>getComputedStyle(e).colorScheme),'light');
    assert.equal(await page.locator('#printArea').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(255, 255, 255)');
    assert.equal(await page.locator('.topbar').isVisible(),false);
    await page.pdf({path:path.join(output,'dark.pdf'),preferCSSPageSize:true,printBackground:true});
    await page.emulateMedia({media:'screen'});
    await page.reload(); await ready(page);
    assert.equal(await page.getAttribute('html','data-theme'),'dark');
    await page.emulateMedia({colorScheme:'light'});
    assert.equal(await page.getAttribute('html','data-theme'),'dark','explicit choice overrides OS');
    await theme(page,'system');
    assert.equal(await page.getAttribute('html','data-theme'),'light');
    await page.emulateMedia({colorScheme:'dark'});
    await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
    assert.equal(await page.getAttribute('html','data-theme'),'dark','automatic choice follows OS');
    await page.click('#themeToggle');
    assert.equal(await page.evaluate(()=>localStorage.getItem('wp_theme_v1')),'light');
    await page.click('#themeToggle');
    const other=await context.newPage(); await isolate(other); await other.goto(origin); await ready(other);
    await other.click('#themeToggle');
    await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');
    await other.close();
    await theme(page,'dark');
    const unchanged=await page.evaluate(()=>({settings:localStorage.getItem('wp_settings_v1'),view:localStorage.getItem('wp_view_v1'),weeks:PaperWeek.getAllLocalWeeks()}));
    assert.deepEqual(unchanged,stored,'theme must not rewrite settings, dates, events or TODOs');
    await page.click('[data-tab="events"]');
    await page.locator('.js-edit-event').first().click();
    await page.fill('#eventTitle','保存前の予定名');
    await page.fill('#eventMemo','入力途中のメモ');
    await page.click('#themeToggle'); await page.click('#themeToggle');
    assert.equal(await page.inputValue('#eventTitle'),'保存前の予定名');
    assert.equal(await page.inputValue('#eventMemo'),'入力途中のメモ');
    await page.click('#eventCancelBtn');
    for (const [width,height] of [[320,568],[390,844],[844,390]]) {
      await page.setViewportSize({width,height});
      // Cover the larger signed-in header as well as the signed-out header.
      for (const signedIn of [false,true]) {
        await page.evaluate(signedIn=>{
          document.body.classList.add('pw-cloud-enabled');
          document.getElementById('authStateOut').hidden=signedIn;
          document.getElementById('authStateIn').hidden=!signedIn;
        },signedIn);
        for (const tab of ['events','todos','settings','preview']) {
          await page.click(`[data-tab="${tab}"]`);
          assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${width}/${signedIn}/${tab}`);
        }
        for (const selector of ['#themeToggle','#printBtn',signedIn?'#openAccountBtn':'#openLoginBtn']) {
          const box=await page.locator(selector).boundingBox();
          assert.ok(box.width>=44 && box.height>=44,selector+' '+width);
        }
        const brand=await page.locator('.app-title').boundingBox();
        const actions=await page.locator('.topbar-right').boundingBox();
        assert.ok(brand.x+brand.width<=actions.x,`header overlap ${width}/${signedIn}`);
      }
      await page.click('[data-tab="events"]');
      await page.screenshot({path:path.join(output,`mobile-dark-${width}.png`),fullPage:true,animations:'disabled'});
      await page.click('#themeToggle');
      assert.equal(await page.getAttribute('html','data-theme'),'light');
      await page.click('#themeToggle');
    }
    await page.click('#nextWeekBtn');
    assert.ok(await page.locator('#eventListUI').evaluate(e=>e.getAnimations({subtree:true}).length>0),'date change animates the agenda');
    assert.equal(await page.locator('#printArea').evaluate(e=>e.getAnimations({subtree:true}).length),0,'paper never animates');
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.click('[data-tab="settings"]');
    assert.equal(await page.locator('.tab-panel.is-active').evaluate(e=>getComputedStyle(e).animationName),'none');
    await page.waitForFunction(()=>!document.querySelector('#prevWeekBtn').disabled);
    await page.click('#prevWeekBtn');
    assert.equal(await page.locator('#eventListUI').evaluate(e=>e.getAnimations({subtree:true}).length),0);
    assert.deepEqual(errors,[]);
    await context.close();

    // A slow external module cannot hold the splash or theme controls hostage.
    const slow=await browser.newPage({reducedMotion:'reduce'});
    await slow.route('https://**',r=>r.abort());
    await slow.route(/\/(firebase-init|cloud-sync)\.js$/,()=>new Promise(()=>{}));
    await slow.goto(origin,{waitUntil:'commit'});
    await slow.waitForFunction(()=>document.documentElement.dataset.boot==='ready' && !document.getElementById('appSplash'),{},{timeout:2500});
    await slow.click('#themeToggle');
    await slow.close();

    // Appearance is optional: failure to load it leaves the original app usable.
    const fallback=await browser.newPage(); await isolate(fallback);
    await fallback.route('**/appearance.js',r=>r.fulfill({contentType:'text/javascript',body:''}));
    await fallback.goto(origin);
    assert.equal(await fallback.locator('#appSplash').isVisible(),false);
    await fallback.selectOption('#viewCount','1');
    assert.equal(await fallback.locator('.pa-daylabel').count(),1);
    await fallback.close();
    console.log('PASS: dark/light/system, persistence, cross-tab sync, unchanged planner data, identical white paper/print, launch, reduced motion, stalled Firebase, optional-script fallback, mobile layouts and tap targets, date animation');
  } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
