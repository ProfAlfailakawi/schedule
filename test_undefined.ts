import { Firestore } from "@google-cloud/firestore";
const db = new Firestore({ projectId: "demo" });
db.settings({ ignoreUndefinedProperties: true });
console.log("Success");
