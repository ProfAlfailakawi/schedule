import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, limit, query } from 'firebase/firestore';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function test() {
  try {
    const snap = await getDocs(query(collection(db, 'users'), limit(1)));
    console.log("Client SDK works:", snap.size);
  } catch(e) {
    console.error("Client SDK error:", e);
  }
}
test();
