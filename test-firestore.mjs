import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
initializeApp();
const db = getFirestore();
const snapshot = await db.collection("users").get();
console.log("Success! Found users: " + snapshot.size);
