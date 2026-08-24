import { readFileSync } from "fs";

const file = readFileSync("src/utils/documentOcr.ts", "utf8");

// Extract fold and isHeaderLine
const foldMatch = file.match(/const fold=\(value:string\)=>.+?;/);
const isHeaderMatch = file.match(/function isHeaderLine[\s\S]+?return false;\n}/);

if (!foldMatch || !isHeaderMatch) {
  console.log("Could not find functions");
  process.exit(1);
}

const code = `
export ${foldMatch[0]}
export ${isHeaderMatch[0]}
`;

require('fs').writeFileSync('test-ocr-lib.cjs', code);
