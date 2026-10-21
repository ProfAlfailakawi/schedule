/**
 * ── حارس وجهة النشر ────────────────────────────────────────────────────────
 *
 * On 2026-10-16 a single commit quietly pointed every deploy at a different
 * Google Cloud project. CI stayed green and "Deploy SCHEDULE" said success,
 * while schedule-kw.com — mapped to the official service — never
 * received another release. Then re-creating the domain mapping took HTTPS down
 * while a new certificate was issued.
 *
 * This guard fails CI if either can happen again. The rules it enforces are in
 * docs/DELIVERY_OPERATIONS.md; change them only with the owner's explicit decision.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const OFFICIAL_PROJECT = "gen-lang-client-0379571946";
const OFFICIAL_REGIONS = ["europe-west1"];
/* حُذفت خدمة لندن (europe-west2) بقرار المالك في 2026-10-17: لا يُنشر عليها مجدداً (النشر كان سيعيد إنشاءها). */
const RETIRED_REGIONS = ["europe-west2"];
const failures = [];

/* ١. سير النشر ينشر على الخدمة الرسمية، والصورة وحدها. */
const workflow = readFileSync(".github/workflows/deploy-schedule.yml", "utf8");
const deploys = [...workflow.matchAll(/gcloud run deploy\s+schedule([\s\S]*?)--quiet/g)].map(m => m[1]);
if (!deploys.length) failures.push("deploy-schedule.yml لا يحوي أمر `gcloud run deploy schedule`.");
for (const block of deploys) {
  const project = block.match(/--project[= ]([\w-]+)/)?.[1];
  if (project !== OFFICIAL_PROJECT) failures.push(`النشر يذهب إلى المشروع «${project || "غير محدد"}» لا إلى الرسمي ${OFFICIAL_PROJECT}.`);
  for (const flag of ["--service-account", "--set-env-vars", "--set-secrets", "--update-env-vars", "--clear-env-vars", "--memory", "--cpu", "--no-allow-unauthenticated"]) {
    if (block.includes(flag)) failures.push(`النشر على الخدمة الرسمية يغيّر إعداداتها (${flag}). المسموح تغيير الصورة فقط.`);
  }
}
for (const region of OFFICIAL_REGIONS) {
  if (!workflow.includes(region)) failures.push(`النشر لا يشمل المنطقة الرسمية ${region}.`);
}
for (const region of RETIRED_REGIONS) {
  if (deploys.some(block => block.includes(region)) || new RegExp(`for region[^\\n]*${region}`).test(workflow)) failures.push(`النشر يعود إلى المنطقة المحذوفة ${region} (يعيد إنشاء الخدمة).`);
}
if (!/schedule-kw\.com/.test(workflow)) failures.push("سير النشر لا يتحقق من الدومين الرسمي بعد النشر.");

/* ٢. لا أمر يمسّ ربط الدومين في أي ملف من المستودع. */
const SKIP = new Set(["node_modules", ".git", "dist", "deploy-target-guard.mjs"]);
const SCAN = /\.(ya?ml|sh|mjs|cjs|js|ts|json|py)$/;
function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path);
    else if (SCAN.test(name) && stat.size < 2_000_000 && /domain-mappings/.test(readFileSync(path, "utf8"))) {
      failures.push(`${path} يحوي أمر domain-mappings — ربط الدومين لا يُمسّ (docs/DELIVERY_OPERATIONS.md).`);
    }
  }
}
walk(".");

if (failures.length) {
  console.error("✗ حارس وجهة النشر:\n" + failures.map(f => "  - " + f).join("\n") + "\n\nاقرأ docs/DELIVERY_OPERATIONS.md.");
  process.exit(1);
}
console.log(`✓ حارس وجهة النشر: ${deploys.length} أمر نشر، كلها إلى ${OFFICIAL_PROJECT} وبالصورة وحدها؛ لا مساس بربط الدومين.`);
