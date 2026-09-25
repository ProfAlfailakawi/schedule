import fs from 'node:fs';
import vm from 'node:vm';
import { ARABIC_COUNT_SCRIPT } from '../src/utils/arabicCount.ts';

const server = fs.readFileSync('server.ts', 'utf8');
const start = server.indexOf('function instructorRequestPage');
const end = server.indexOf('app.post("/api/public/request/:token/check"', start);
if (start < 0 || end <= start) throw new Error('تعذر عزل صفحة طلب الأستاذ من المصدر');
let fn = server.slice(start, end);
fn = fn.replace(
  'function instructorRequestPage(token: string, nonce: string, demoHint = ""): string {',
  'function instructorRequestPage(token, nonce, demoHint = "") {'
);
const sandbox = { html: '', ARABIC_COUNT_SCRIPT };
vm.runInNewContext(`${fn}\nhtml=instructorRequestPage('browser-test-token','nonce123');`, sandbox, { timeout: 1000 });
const scripts = [...String(sandbox.html).matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
if (scripts.length !== 1) throw new Error(`توقعت سكربت متصفح واحداً في صفحة الأستاذ، ووجدت ${scripts.length}`);
new vm.Script(scripts[0], { filename: 'instructor-request-inline.js' });
console.log('✓ صفحة طلب الأستاذ المولدة تحمل JavaScript صالحاً للمتصفح');
