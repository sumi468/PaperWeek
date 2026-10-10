const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

test('multiple selected weeks subscribe once, update independently, and release removed weeks', () => {
  let selected=['2026-10-12','2026-10-19'];
  const subscriptions=[], received=[], loading=[];
  const context=vm.createContext({
    console, Map, setTimeout, clearTimeout, Promise,
    isConfigured:false, db:{},
    doc:(_db,...parts)=>parts.join('/'),
    onSnapshot:(ref,success,error)=>{
      const entry={ref,success,error,stopped:false};subscriptions.push(entry);
      return ()=>{entry.stopped=true;};
    },
    window:{PaperWeek:{getVisibleWeekISOs:()=>selected.slice(),applyRemoteWeek:(iso,data)=>received.push({iso,data})},
      PaperWeekAuthUI:{showLoading:value=>loading.push(value),hideSyncBanner:()=>{},showSyncBanner:()=>{}}}
  });
  const code=fs.readFileSync(require.resolve('../cloud-sync.js'),'utf8').replace(/^import[\s\S]*?from\s+"[^"]+";\s*/gm,'');
  vm.runInContext(code,context);
  vm.runInContext('settingsLoadedOnce = true; subscribeWeeks("test-user")',context);
  assert.equal(subscriptions.length,2);
  subscriptions[0].success({exists:()=>true,data:()=>({events:[{id:'a'}],todos:[]})});
  assert.equal(vm.runInContext('weekLoadedOnce',context),false);
  subscriptions[1].success({exists:()=>true,data:()=>({events:[{id:'b'}],todos:[]})});
  assert.equal(vm.runInContext('weekLoadedOnce',context),true);
  assert.deepEqual(received.map(x=>x.iso),selected);
  vm.runInContext('subscribeWeeks("test-user")',context);
  assert.equal(subscriptions.length,2);
  selected=['2026-10-19','2026-10-26'];
  vm.runInContext('subscribeWeeks("test-user")',context);
  assert.equal(subscriptions[0].stopped,true);
  assert.equal(subscriptions[1].stopped,false);
  assert.equal(subscriptions.length,3);
  subscriptions[0].success({exists:()=>true,data:()=>({events:[{id:'stale'}]})});
  assert.equal(received.length,2);
  subscriptions[2].success({exists:()=>false});
  subscriptions[1].success({exists:()=>false});
  assert.equal(vm.runInContext('weekLoadedOnce',context),true);
  vm.runInContext('unsubWeek()',context);
  assert.ok(subscriptions.every(x=>x.stopped));
});
