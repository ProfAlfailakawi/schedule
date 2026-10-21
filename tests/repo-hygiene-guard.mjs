import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const joined = (parts) => parts.join("");
const blockedPhrases = [
  joined(["Clau", "de"]), joined(["co", "dex"]), joined(["Chat", "GPT"]),
  joined(["Cur", "sor"]), joined(["Ju", "les"]), joined(["Wind", "surf"]),
  joined(["GitHub ", "Copilot"]), joined(["A", "ider"]), joined(["C", "line"]),
  joined(["Open", "Hands"]), joined(["Replit ", "Agent"]), joined(["Roo ", "Code"]),
  joined(["Sourcegraph ", "Cody"]), joined(["Bolt", ".new"]),
];
const blockedNameParts = [
  ["clau", "de.md"], [".clau", "de"], [".co", "dex"], [".cur", "sor"],
  [".wind", "surf"], ["agents", ".md"], ["jules", "_task"], ["jules"],
  ["clau", "de"], ["chat", "gpt"], ["co", "dex"], ["cur", "sor"],
  ["wind", "surf"], ["copi", "lot"], ["aider"], ["cline"], ["openhands"],
  ["replit-agent"], ["roo-code"], ["sourcegraph-cody"], ["bolt.new"], ["ai_review_", "prompt"],
  ["audit-", "progress"], ["conversation-", "review"],
  ["design-", "qa.md"], ["cleanup-delete-", "list.txt"], [".probe-", "lines.ts"],
  ["readme-", "apply.txt"], ["readme-changes-", ""],
];
const textExtensions = new Set([".md", ".txt", ".json", ".yaml", ".yml", ".html", ".xml", ".ts", ".tsx", ".js", ".mjs", ".cjs", ".py", ".sh", ".css", ".scss", ".sql"]);
const ignoredDirs = new Set([".git", "node_modules", "dist", "coverage", "build", "database"]);
const failures = [];

function scan(dir, prefix = "") {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const lowerPath = rel.toLowerCase();
    if (blockedNameParts.some(parts => lowerPath.includes(joined(parts)))) failures.push(`اسم أو مسار ممنوع: ${rel}`);
    if (ignoredDirs.has(entry.name)) continue;
    if (entry.isDirectory()) {
      scan(path.join(dir, entry.name), rel);
      continue;
    }
    if (!entry.isFile() || rel === "tests/repo-hygiene-guard.mjs" || entry.name === "package-lock.json") continue;
    if (!textExtensions.has(path.extname(entry.name).toLowerCase())) continue;
    const text = fs.readFileSync(path.join(dir, entry.name), "utf8");
    for (const phrase of blockedPhrases) {
      const exact = new RegExp(`\\b${escapeRegExp(phrase)}\\b`, phrase === blockedPhrases[3] ? "g" : "gi");
      const matches = [...text.matchAll(exact)];
      const hasMention = matches.some(match => {
        if (phrase === blockedPhrases[3]) return match[0] === "Cursor";
        if (phrase === blockedPhrases[1]) return match[0] !== "codeX";
        return true;
      });
      if (hasMention) {
        failures.push(`إشارة إلى أداة تطوير في ${rel}`);
        break;
      }
    }
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

scan(root);
if (failures.length) {
  console.error("✗ فشل فحص نظافة المستودع:\n" + failures.map(item => `  - ${item}`).join("\n"));
  process.exit(1);
}
console.log("✓ فحص نظافة المستودع: لا أسماء أدوات تطوير أو ملفات تعليمات/برومبتات محظورة.");
