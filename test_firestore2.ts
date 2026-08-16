import { Firestore, FieldPath } from '@google-cloud/firestore';
const db = new Firestore({ projectId: "demo-test" });
async function run() {
  const col = db.collection("test-col-2");
  const snap1 = await col.orderBy(FieldPath.documentId()).limit(1).get();
}
run().catch(console.error);
