import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
const app = initializeApp({ 
  credential: applicationDefault(),
  projectId: "tebyan-clean-2026-5f13b" 
});
const db = getFirestore(app, "ai-studio-schedule-e58b0cc6-2ab5-4593-8fa2-7d5392fe406e");
db.collection("users").limit(1).get().then(snap => {
  console.log("Empty:", snap.empty);
  process.exit(0);
}).catch(e => {
  console.error("ERROR:", e);
  process.exit(1);
});
