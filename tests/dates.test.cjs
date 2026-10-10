const test = require('node:test');
const assert = require('node:assert/strict');
const d = require('../dates.js');

test('legacy default remains a Monday-to-Sunday week', () => {
  assert.deepEqual(d.visible(d.normalize(null, '2026-10-12')), ['2026-10-12','2026-10-13','2026-10-14','2026-10-15','2026-10-16','2026-10-17','2026-10-18']);
});
test('all counts, year/leap/month boundaries and week ownership', () => {
  for (let count = 1; count <= 7; count++) assert.equal(d.visible(d.normalize({ start:'2026-12-30',count }, '2026-10-12')).length, count);
  assert.equal(d.add('2026-12-31', 1), '2027-01-01');
  assert.equal(d.add('2024-02-28', 1), '2024-02-29');
  assert.equal(d.add('2026-02-28', 1), '2026-03-01');
  assert.equal(d.week('2026-10-18'), '2026-10-12');
  assert.equal(d.week('2026-10-19'), '2026-10-19');
  assert.equal(d.day('2026-10-18'), 6);
});
test('individual dates are validated, deduplicated and sorted', () => {
  const v = d.normalize({mode:'custom', dates:['2026-10-18','bad','2026-10-12','2026-10-12','2026-02-30','2026-10-15']}, '2026-10-12');
  assert.deepEqual(d.visible(v), ['2026-10-12','2026-10-15','2026-10-18']);
  assert.equal(d.normalize({dates:[],count:0}, '2026-10-12').count, 7);
  assert.deepEqual(d.normalize({mode:'custom',dates:[]}, '2026-10-12').dates, ['2026-10-12']);
});
test('calendar arithmetic does not shift dates at DST transitions', () => {
  for (const tz of ['Asia/Tokyo','America/New_York','Europe/Berlin']) {
    process.env.TZ = tz;
    assert.equal(d.add('2026-03-08',1),'2026-03-09');
    assert.equal(d.add('2026-11-01',1),'2026-11-02');
  }
});
