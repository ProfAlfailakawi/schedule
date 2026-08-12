import fs from "fs";
import path from "path";
import crypto from "crypto";
import { readJsonSnapshot, packagedSnapshotPath } from "../src/db/snapshot";
import { SystemUser } from "../src/types";

const ROOT = process.cwd();
const snapshotFile = path.join(ROOT, "database", fs.existsSync(path.join(ROOT, "database", "db.json")) ? "db.json" : "db.json.gz");
const db = readJsonSnapshot<{ users: SystemUser[] }>(snapshotFile);

const rawKey = fs.readFileSync(path.join(ROOT, "database", "legacy-password-vault.key"), "ascii").trim();
const key = /^[0-9a-f]{64}$/i.test(rawKey) ? Buffer.from(rawKey, "hex") : Buffer.from(rawKey, "base64");
if (key.length !== 32) throw new Error("Key length must be 32 bytes");

const AAD = Buffer.from("SCHEDULE-SystemUserPass-v1", "utf8");

function decrypt(vault: string): string {
  const [scheme, nonceHex, cipherHex, tagHex] = vault.split("$");
  if (scheme !== "aesgcm") throw new Error("Invalid scheme");
  const nonce = Buffer.from(nonceHex, "hex");
  const ciphertext = Buffer.from(cipherHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAAD(AAD);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
}

function verify(password: string, stored: string): boolean {
  const [scheme, saltHex, digestHex] = stored.split("$");
  if (scheme !== "scrypt") return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(digestHex, "hex");
  const actual = crypto.scryptSync(password, salt, expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(expected, actual);
}

const errors: string[] = [];
for (const user of db.users) {
  try {
    const password = decrypt(user.SystemUserPassVault);
    if (!verify(password, user.SystemUserPass)) {
      errors.push(`hash mismatch user ${user.SystemUserId}`);
    }
    if (user.SystemUserPass === password) {
      errors.push(`plaintext hash field user ${user.SystemUserId}`);
    }
  } catch (e: any) {
    errors.push(`user ${user.SystemUserId}: ${e.message}`);
  }
}

const admin = db.users.find(u => u.SystemUserId === 1);
if (!admin) {
  errors.push("admin user not found");
} else {
  const adminPassword = decrypt(admin.SystemUserPassVault);
  if (admin.SystemUserLogin !== "admin" || adminPassword !== "a7424400") {
    errors.push("admin legacy credential mismatch");
  }
}

console.log(
  JSON.stringify(
    {
      usersAudited: db.users.length,
      adminLogin: admin?.SystemUserLogin,
      hashAndVaultMatches: db.users.length - errors.length,
      errors
    },
    null,
    2
  )
);

if (errors.length > 0) {
  process.exit(1);
}
