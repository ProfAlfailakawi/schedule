import fs from 'fs';
const data = fs.readFileSync('tests/fixtures/authority-import-golden.json', 'utf8');
const doc = JSON.parse(data);
const pages = {};
doc.pages.forEach(p => { pages[p.page] = p.rows; });
for (const [pageNum, rows] of Object.entries(pages)) {
  console.log(`Page ${pageNum}: ${rows.length} rows`);
  let missing = { code: 0, scode: 0, time: 0, building: 0, room: 0 };
  rows.forEach(r => {
    if (!r.code) missing.code++;
    if (!r.scode) missing.scode++;
    if (!r.start) missing.time++;
    if (!r.building) missing.building++;
    if (!r.room) missing.room++;
  });
  console.log(`  Missing:`, missing);
}
