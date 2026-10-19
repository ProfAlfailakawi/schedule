/**
 * فحصُ ثبات تجربة «مساري» على الحاسوب والهاتف.
 * يُمسك تضارب CSS الذي كان يضغط أسماء المقررات إلى عمودٍ بعرض 14px،
 * والتوسّع المفاجئ إلى 1180px بعد اكتمال طلب الخريطة.
 */
import assert from "node:assert/strict";
import { STUDENT_HOME_CSS, studentHomePage } from "../src/server/studentHomePage";
import { STUDENT_MAP_CSS } from "../src/server/studentMapUi";

assert.match(STUDENT_HOME_CSS, /\\.app\\{max-inline-size:520px/);
assert.doesNotMatch(STUDENT_MAP_CSS, /\\.app\\.km-on\\{max-inline-size:1180px/);
assert.doesNotMatch(STUDENT_MAP_CSS, /@media\\s*\\(min-width:900px\\)/);
assert.match(STUDENT_MAP_CSS, /@media\\s*\\(min-width:0px\\)/);
assert.match(STUDENT_MAP_CSS, /\\.kchbr>\\.ln\\{display:block;inline-size:14px/);
assert.doesNotMatch(STUDENT_MAP_CSS, /(?:^|\\})\\.ln\\{display:block;inline-size:14px/m);
assert.match(STUDENT_MAP_CSS, /\\.tk \\.ln \\.tx b[^\\n]*overflow-wrap:anywhere/);

const html = studentHomePage("audit-nonce", "girls");
assert.match(html, /name="viewport" content="width=device-width,initial-scale=1/);
assert.match(html, /class="app"/);
assert.match(html, /audit-nonce/);
console.log("✓ مساري: العرض ثابت، النصوص غير مضغوطة، ونمط الهاتف يعمل على الحاسوب");