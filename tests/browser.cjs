// Run with Playwright available in NODE_PATH; no production dependency is added.
const {chromium} = require('playwright');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'artifacts');
fs.mkdirSync(out, {recursive:true});
const server = http.createServer((req,res) => {
  const name = req.url === '/' ? 'index.html' : req.url.slice(1);
  const file = path.resolve(root, name);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) {res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html');
  res.end(fs.readFileSync(file));
});
(async () => {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser = await chromium.launch({channel:process.env.PW_CHANNEL || 'msedge', headless:true});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1000}});
    const errors=[];
    const pageCounts={};
    page.on('pageerror', e=>errors.push(e.message));
    // Isolated local fixture: never sign in or contact the production Firebase project.
    await page.route('**/firebase-init.js', route=>route.fulfill({contentType:'text/javascript',body:''}));
    await page.route('**/cloud-sync.js', route=>route.fulfill({contentType:'text/javascript',body:''}));
    const origin=`http://127.0.0.1:${server.address().port}`;
    await page.goto(origin);
    const a={events:[{id:'same-id',day:6,start:'09:00',end:'11:00',title:'Sunday original',memo:'keep memo',category:'work'},{id:'hidden',day:0,start:'10:00',end:'11:00',title:'Hidden Monday',memo:'keep',category:'other'}],todos:[{id:'todo-a',text:'Week A TODO',checked:false}]};
    const b={events:[{id:'same-id',day:0,start:'12:00',end:'14:00',title:'Monday original',memo:'next memo',category:'school'}],todos:[{id:'todo-b',text:'Week B TODO',checked:false}]};
    await page.evaluate(({a,b})=>{
      localStorage.clear();
      localStorage.setItem('wp_settings_v1',JSON.stringify({currentWeekStart:'2026-10-12'}));
      localStorage.setItem('wp_week_v1_2026-10-12',JSON.stringify(a));
      localStorage.setItem('wp_week_v1_2026-10-19',JSON.stringify(b));
    },{a,b});
    await page.reload();
    assert.equal(await page.locator('.pa-daylabel').count(),7);
    await page.locator('#viewStart').fill('2026-10-18');
    await page.locator('#viewStart').dispatchEvent('change');
    for(let n=1;n<=7;n++) {
      await page.selectOption('#viewCount',String(n));
      assert.equal(await page.locator('.pa-daylabel').count(),n);
      assert.equal((await page.evaluate(()=>PaperWeek.getVisibleDates())).length,n);
    }
    await page.selectOption('#viewCount','2');
    assert.match(await page.locator('#printArea').innerText(),/Sunday original/);
    assert.match(await page.locator('#printArea').innerText(),/Monday original/);
    assert.doesNotMatch(await page.locator('#printArea').innerText(),/Hidden Monday/);
    assert.deepEqual(await page.evaluate(()=>PaperWeek.getWeekData('2026-10-12')),a);
    assert.deepEqual(await page.evaluate(()=>PaperWeek.getWeekData('2026-10-19')),b);
    await page.locator('[data-tab="events"]').click();
    await page.locator('[data-week="2026-10-19"] .js-edit-event').click();
    assert.equal(await page.inputValue('#eventMemo'),'next memo');
    await page.fill('#eventTitle','Monday edited');
    await page.click('#eventSubmitBtn');
    assert.equal((await page.evaluate(()=>PaperWeek.getWeekData('2026-10-12'))).events[0].title,'Sunday original');
    assert.equal((await page.evaluate(()=>PaperWeek.getWeekData('2026-10-19'))).events[0].title,'Monday edited');
    await page.locator('[data-week="2026-10-19"] .js-delete-event').click();
    assert.equal((await page.evaluate(()=>PaperWeek.getWeekData('2026-10-19'))).events.length,0);
    await page.fill('#eventTitle','New Monday');
    await page.selectOption('#eventDay','2026-10-19');
    await page.click('#eventSubmitBtn');
    assert.equal((await page.evaluate(()=>PaperWeek.getWeekData('2026-10-19'))).events[0].day,0);
    await page.locator('[data-week="2026-10-19"] .js-edit-event').click();
    await page.selectOption('#eventDay','2026-10-18');
    await page.click('#eventSubmitBtn');
    assert.equal((await page.evaluate(()=>PaperWeek.getWeekData('2026-10-19'))).events.length,0);
    assert.equal((await page.evaluate(()=>PaperWeek.getWeekData('2026-10-12'))).events.length,3);
    await page.locator('[data-tab="todos"]').click();
    await page.selectOption('#todoWeek','2026-10-19');
    await page.locator('.js-toggle-todo').click();
    assert.equal((await page.evaluate(()=>PaperWeek.getWeekData('2026-10-19'))).todos[0].checked,true);
    await page.fill('#todoText','New TODO');
    await page.locator('#todoForm button').click();
    await page.locator('#todoListUI .js-delete-todo').last().click();
    assert.equal((await page.evaluate(()=>PaperWeek.getWeekData('2026-10-19'))).todos.length,1);
    await page.locator('[data-tab="settings"]').click();
    await page.selectOption('#viewCount','1');
    await page.locator('[data-mode="custom"]').click();
    for (const iso of ['2026-10-12','2026-10-15']) {
      await page.fill('#customDate',iso); await page.click('#addDateBtn');
    }
    assert.deepEqual(await page.evaluate(()=>PaperWeek.getVisibleDates()),['2026-10-12','2026-10-15','2026-10-18']);
    await page.click('#addDateBtn');
    assert.match(await page.locator('#dateStatus').innerText(),/選択済み/);
    await page.reload();
    assert.deepEqual(await page.evaluate(()=>PaperWeek.getVisibleDates()),['2026-10-12','2026-10-15','2026-10-18']);
    for(const iso of ['2026-10-19','2026-10-22','2026-11-02','2027-01-01']) {
      await page.fill('#customDate',iso);await page.click('#addDateBtn');
    }
    await page.fill('#customDate','2027-02-01');await page.click('#addDateBtn');
    assert.match(await page.locator('#dateStatus').innerText(),/最大7日/);
    for(const iso of ['2026-10-19','2026-10-22','2026-11-02','2027-01-01']) await page.locator(`#selectedDates [data-date="${iso}"]`).click();
    await page.pdf({path:path.join(out,'custom-dates.pdf'),preferCSSPageSize:true,printBackground:true});
    pageCounts['custom-dates.pdf']=await page.locator('.pa-sheet').count();
    await page.screenshot({path:path.join(out,'desktop.png'),fullPage:true});
    await page.locator('[data-mode="range"]').click();
    // Empty date fixture isolates layout from text density.
    await page.fill('#viewStart','2027-01-01'); await page.locator('#viewStart').dispatchEvent('change');
    let layouts=0;
    for(const orientation of ['landscape','portrait']) {
      await page.locator(`[data-orientation="${orientation}"]`).click();
      for(const template of ['01','02','03']) {
        await page.check(`input[name="template"][value="${template}"]`);
        for(let n=1;n<=7;n++) {
          await page.selectOption('#viewCount',String(n));
          const actual=await page.locator(template==='01'?'.pa-daylabel:not(.is-memo)':'.pa-daycard:not(.is-memocard)').count();
          assert.equal(actual,n);
          for(const level of ['less','more','analog','standard']) {
            await page.locator(`[data-level="${level}"]`).click();
            const boxes=await page.evaluate(()=>Array.from(document.querySelectorAll('.pa-sheet')).map(s=>({h:s.clientHeight,scroll:s.scrollHeight})));
            assert.ok(boxes.every(s=>s.scroll<=s.h+1),JSON.stringify({orientation,template,n,level,boxes}));
          }
          const bounds=await page.evaluate(()=>{
            const area=document.querySelector('#printArea');
            return {width:area.offsetWidth,height:area.offsetHeight,scroll:area.scrollHeight};
          });
          assert.ok(bounds.scroll<=bounds.height+1,JSON.stringify({orientation,template,n,bounds}));
          if([1,2,3,7].includes(n)) {
            const filename=`${orientation}-${template}-${n}.pdf`;
            await page.pdf({path:path.join(out,filename),preferCSSPageSize:true,printBackground:true});
            pageCounts[filename]=await page.locator('.pa-sheet').count();
            assert.equal(pageCounts[filename],1);
          }
          layouts++;
        }
      }
    }
    await page.setViewportSize({width:390,height:844});
    await page.waitForFunction(()=>document.querySelector('#printArea').getBoundingClientRect().width <= document.querySelector('#previewViewport').clientWidth);
    await page.waitForTimeout(300); // Let the existing preview transform transition settle.
    await page.screenshot({path:path.join(out,'mobile.png'),fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true);
    await page.setViewportSize({width:320,height:740});
    await page.waitForFunction(()=>document.querySelector('#printArea').getBoundingClientRect().width <= document.querySelector('#previewViewport').clientWidth);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true);
    await page.emulateMedia({media:'print'});
    assert.equal(await page.locator('.topbar').isVisible(),false);
    assert.equal(await page.locator('.control-pane').isVisible(),false);
    assert.equal(await page.locator('#printArea').isVisible(),true);
    await page.emulateMedia({media:'screen'});
    await page.setViewportSize({width:1440,height:1000});
    await page.locator('[data-orientation="landscape"]').click();
    await page.check('input[name="template"][value="01"]');
    await page.selectOption('#viewCount','2');
    const longTitle='長い予定の全文を保持します。'.repeat(400);
    await page.evaluate(longTitle=>PaperWeek.applyRemoteWeek('2026-12-28',{
      events:[{id:'long',day:4,start:'09:00',end:'09:05',title:longTitle,memo:'本文の最後まで保持',category:'work'},
        {id:'overlap',day:4,start:'09:00',end:'10:00',title:'同時刻の予定',category:'other'},
        {id:'outside',day:5,start:'23:00',end:'23:30',title:'時間外の予定',category:'other'}],
      todos:Array.from({length:80},(_,i)=>({id:'t'+i,text:'TODO '+i+' 全文表示の確認',checked:false}))
    }),longTitle);
    assert.ok(await page.locator('.pa-sheet').count()>1);
    const full=await page.locator('.pa-details-body').allTextContents();
    assert.ok(full.join('').includes(longTitle));
    assert.ok(full.join('').includes('時間外の予定'));
    assert.ok(full.join('').includes('TODO 79'));
    const overflow=await page.evaluate(()=>Array.from(document.querySelectorAll('.pa-details-body')).some(e=>e.scrollHeight>e.clientHeight+1));
    assert.equal(overflow,false);
    const overlap=await page.locator('.pa-event').evaluateAll(nodes=>nodes.map(n=>({left:n.offsetLeft,width:n.offsetWidth})));
    assert.ok(overlap[1].left >= overlap[0].left+overlap[0].width);
    const previewSheets=await page.locator('.pa-sheet').count();
    await page.emulateMedia({media:'print'});
    await page.pdf({path:path.join(out,'overflow-details.pdf'),preferCSSPageSize:true,printBackground:true});
    await page.emulateMedia({media:'screen'});
    fs.writeFileSync(path.join(out,'overflow-pages.json'),JSON.stringify({pages:previewSheets}));
    pageCounts['overflow-details.pdf']=previewSheets;
    fs.writeFileSync(path.join(out,'pdf-pages.json'),JSON.stringify(pageCounts,null,2));
    await page.screenshot({path:path.join(out,'overflow-preview.png'),fullPage:true});
    assert.deepEqual(errors,[]);
    console.log(`PASS: ${layouts*4} layout/handwriting combinations; legacy data; cross-week CRUD/move; TODO CRUD; individual dates; reload; 320/390px mobile; print-only content; 26 PDFs; long-text/overlap/out-of-hours/TODO continuation (${previewSheets} pages)`);
  } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
