const test = require('node:test');
const assert = require('node:assert/strict');
const importer = require('../import-events.js');
const event = {date:'2026-11-09',title:'Meeting',start:'09:00',end:'10:00',sourceId:'example-1'};
const file = events => JSON.stringify({format:'paperweek-events',version:1,timeZone:'Asia/Tokyo',events});

test('validates the complete file before importing; dates, times, size, and version fail explicitly', () => {
  assert.equal(importer.parse('\uFEFF'+file([event])).events[0].category,'other');
  for (const patch of [{date:'2026-02-30'},{date:'1000-01-01'},{title:' '},{start:['09:00']},{start:'9:00'},
    {end:'09:00'},{end:'24:00'},{end:'08:00'},{memo:{}},{memo:'x'.repeat(5001)}, {category:'unknown'}, {sourceId:12}]) {
    assert.throws(()=>importer.parse(file([event,{...event,...patch}])));
  }
  for (const text of ['{',file([]),file(Array(501).fill(event)),file([event]).replace('Asia/Tokyo','unknown'),
    file([event]).replace('"version":1','"version":2'), ' '.repeat(1024*1024+1)]) assert.throws(()=>importer.parse(text));
});

test('add-only merging preserves edits, unknown fields, TODOs and other dates; retries skip duplicates', () => {
  const existing = {'2026-11-09': {events:[{id:'old',day:0,title:'Edited locally',start:'10:00',end:'11:00',memo:'keep',extra:true,importedSourceId:'example-1'}],todos:[{id:'todo',text:'Keep TODO',checked:true}]}};
  const before = JSON.stringify(existing);
  const input = importer.parse(file([event,event,{...event,date:'2026-11-15',sourceId:'sun'},{...event,date:'2026-11-16',sourceId:'mon'}])).events;
  let i=0;
  const result = importer.merge(input,existing,()=>`new-${i++}`);
  assert.equal(JSON.stringify(existing),before);
  assert.equal(result.added,2);
  assert.equal(result.skipped,2);
  assert.deepEqual(result.weeks['2026-11-09'].events[0],existing['2026-11-09'].events[0]);
  assert.deepEqual(result.weeks['2026-11-09'].todos,existing['2026-11-09'].todos);
  assert.equal(result.weeks['2026-11-09'].events[1].day,6);
  assert.equal(result.weeks['2026-11-16'].events[0].day,0);
  const repeated = importer.merge(input,result.weeks,()=>`retry-${i++}`);
  assert.equal(repeated.added,0);
  assert.equal(repeated.skipped,4);
  assert.deepEqual(repeated.weeks,{});
});

test('content duplicates skip even without source IDs; HTML is kept as plain text data', () => {
  const events=importer.parse(file([{...event,sourceId:undefined,title:'<img src=x onerror=alert(1)>'}, {...event,sourceId:undefined,title:'<img src=x onerror=alert(1)>'}])).events;
  let i=0;
  const merged=importer.merge(events,{},()=>String(i++));
  assert.equal(merged.added,1);
  assert.equal(merged.skipped,1);
  assert.equal(merged.weeks['2026-11-09'].events[0].title,events[0].title);
});
