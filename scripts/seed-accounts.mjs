// Genera el fichero inicial de cuentas (hashes PBKDF2, nunca texto plano)
// y las constantes del admin para auth.ts.
// Uso: node scripts/seed-accounts.mjs
import { webcrypto } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";

const ITER = 100_000;

async function pbkdf2B64(password, saltBytes) {
  const enc = new TextEncoder();
  const key = await webcrypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await webcrypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations: ITER }, key, 256);
  return Buffer.from(bits).toString("base64");
}

const b64 = (buf) => Buffer.from(buf).toString("base64");
const rand16 = () => webcrypto.getRandomValues(new Uint8Array(16));

// --- admin: sal fija (16 bytes ASCII) para poder fijar la constante en auth.ts ---
const ADMIN_SALT = Buffer.from("axcsos-admin-v1!", "ascii"); // 16 bytes exactos
const ADMIN_HASH = await pbkdf2B64("axsa11", ADMIN_SALT);

// --- cuenta inicial del dueño: elcostinero / alvar02022 ---
const elcSalt = rand16();
const elcHash = await pbkdf2B64("alvar02022", elcSalt);

const accountsFile = {
  _note: "Cuentas de axcsOS gestionadas por el panel de administrador. Las contraseñas se guardan como PBKDF2-SHA256 (100000 iteraciones, sal aleatoria por cuenta) y nunca en texto plano.",
  version: 1,
  accounts: [
    {
      id: "acc-elcostinero",
      username: "elcostinero",
      salt: b64(elcSalt),
      hash: elcHash,
      created: new Date().toISOString(),
    },
  ],
};

mkdirSync("public/data", { recursive: true });
writeFileSync("public/data/accounts.json", JSON.stringify(accountsFile, null, 2) + "\n");

console.log("== auth.ts (copiar en el código) ==");
console.log(`const ADMIN_SALT_B64 = "${b64(ADMIN_SALT)}";`);
console.log(`const ADMIN_HASH_B64 = "${ADMIN_HASH}";`);
console.log("\n== public/data/accounts.json escrito ==");
console.log(JSON.stringify(accountsFile, null, 2));
