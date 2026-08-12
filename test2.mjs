import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
initializeApp();
const db = getFirestore(getApps()[0], "ai-studio-schedule-337bbbf5-1098-44cb-aabf-95536daf9106");
try {
  const s = await db.collection("users").get();
  console.log("Success! " + s.size);
} catch(e) {
  console.error("Failed:", e);
}
