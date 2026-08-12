import fs from 'fs';
let content = fs.readFileSync('src/server/runtimeEnv.ts', 'utf8');

const injection = `
  // Auto-inject Firebase configuration if present
  const firebaseConfigPath = path.join(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(firebaseConfigPath)) {
    try {
      const fbConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, "utf-8"));
      if (fbConfig.projectId && !process.env.FIREBASE_PROJECT_ID) {
        process.env.FIREBASE_PROJECT_ID = fbConfig.projectId;
      }
      if (fbConfig.firestoreDatabaseId && !process.env.FIREBASE_DATABASE_ID) {
        process.env.FIREBASE_DATABASE_ID = fbConfig.firestoreDatabaseId;
      }
    } catch(e) {
      console.error("Failed to parse firebase-applet-config.json", e);
    }
  }
`;

content = content.replace(
  '  if (runningOnCloudRun) process.env.NODE_ENV = "production";',
  '  if (runningOnCloudRun) process.env.NODE_ENV = "production";\n' + injection
);

fs.writeFileSync('src/server/runtimeEnv.ts', content, 'utf8');
