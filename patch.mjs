import fs from 'fs';
let content = fs.readFileSync('scripts/import-legacy-json.ts', 'utf8');
content = content.replace(
  'if (!getApps().length) initializeApp();\nconst db = getFirestore();',
  'import dotenv from "dotenv";\ndotenv.config();\nif (!getApps().length) initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID });\nconst db = process.env.FIREBASE_DATABASE_ID ? getFirestore(getApps()[0], process.env.FIREBASE_DATABASE_ID) : getFirestore();'
);
content = content.replace(
  'if (!getApps().length) initializeApp();\r\nconst db = getFirestore();',
  'import dotenv from "dotenv";\ndotenv.config();\nif (!getApps().length) initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID });\nconst db = process.env.FIREBASE_DATABASE_ID ? getFirestore(getApps()[0], process.env.FIREBASE_DATABASE_ID) : getFirestore();'
);
fs.writeFileSync('scripts/import-legacy-json.ts', content, 'utf8');
