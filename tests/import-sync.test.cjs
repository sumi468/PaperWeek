const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const importer = require('../import-events.js');
const events = importer.parse(JSON.stringify({format:'paperweek-events',version:1,timeZone:'Asia/Tokyo',events:[{date:'2026-11-16',title:'Imported',start:'09:00',end:'10:00',sourceId:'remote-import'}]})).events;

function setup(runTransaction, setDoc = async()=>{}) {
  const cached=[], statuses=[];
  const context = vm.createContext({console, setTimeout, clearTimeout, crypto:require('node:crypto').webcrypto,
    isConfigured:false, db:{}, runTransaction, setDoc, serverTimestamp:()=>1,
    doc:(_db,...parts)=>parts.join('/'),
    window:{PaperWeekImport:importer,PaperWeek:{applyRemoteWeek:(iso,data)=>cached.push({iso,data})},
      PaperWeekAuthUI:{showSaveStatus:value=>statuses.push(value)}}});
  const code=fs.readFileSync(require.resolve('../cloud-sync.js'),'utf8').replace(/^import[\s\S]*?from\s+"[^"]+";\s*/gm,'');
  vm.runInContext(code,context);
  vm.runInContext('currentUser={uid:"user",email:"user@example.test"};settingsLoadedOnce=true;weekLoadedOnce=true;',context);
  return {context,cached,statuses,import:()=>context.window.PaperWeekCloud.importEvents(events)};
}

test('imports unseen weeks from latest cloud state and recomputes on transaction retry', async () => {
  const writes=[];
  const todo={id:'todo',text:'Cloud only',checked:true};
  const env=setup(async (_db,callback)=>{
    for (let attempt=0;attempt<2;attempt++) {
      let read=false;
      const result=await callback({
        get:async ref=>{read=true;assert.equal(ref,'users/user/weeks/2026-11-16');return {exists:()=>true,data:()=>({events:attempt?[{id:'other-device',title:'New remote edit',day:0,start:'12:00',end:'13:00'}]:[],todos:[todo]})};},
        set:(ref,data)=>{assert.equal(read,true);writes.push(data);}
      });
      if(attempt) return result;
    }
  });
  const result=await env.import();
  assert.equal(result.added,1);
  assert.equal(writes[1].events.length,2);
  assert.equal(writes[1].events[0].id,'other-device');
  assert.deepEqual(writes[1].todos,[todo]);
  assert.equal(env.cached.length,1);
  assert.equal(env.cached[0].data.events.length,2);
});

test('flushes pending edits before transaction so delayed saves cannot erase the import', async () => {
  const order=[];
  const env=setup(async()=>{order.push('transaction');return {weeks:{},added:0,skipped:1};},async()=>{order.push('edit');});
  vm.runInContext('debouncedSaveWeek("2026-11-16",{events:[{id:"pending"}],todos:[]})',env.context);
  await env.import();
  assert.deepEqual(order,['edit','transaction']);
});

test('cloud failure never claims local success and permits retry; logged-out imports are rejected', async () => {
  const env=setup(async()=>{throw Object.assign(new Error('offline'),{code:'unavailable'});});
  await assert.rejects(env.import(),/offline/);
  assert.equal(env.cached.length,0);
  assert.equal(env.statuses.at(-1),'error');
  vm.runInContext('currentUser=null',env.context);
  await assert.rejects(env.import(),/ログイン/);
});

test('a pending edit failure aborts import before the transaction', async () => {
  let transaction=false;
  const env=setup(async()=>{transaction=true;},async()=>{throw new Error('save failed');});
  vm.runInContext('debouncedSaveWeek("2026-11-16",{events:[],todos:[]})',env.context);
  await assert.rejects(env.import(),/save failed/);
  assert.equal(transaction,false);
});
