// Añade una cuenta de prueba SOLO en local (public/data/accounts.json del dev server).
// No toca GitHub: el despliegue preservará el accounts.json remoto de gh-pages.
// Uso: node scripts/add-test-account.mjs [usuario] [contraseña]
import { webcrypto } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const USERNAME = process.argv[2] || "probatest";
const PASSWORD = process.argv[3] || "probatest1";

const ITER = 100_000;

async function pbkdf2B64(password, saltBytes) {
  const enc = new TextEncoder();
  const key = await webcrypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await webcrypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations: ITER }, key, 256);
  return Buffer.from(bits).toString("base64");
}

const salt = webcrypto.getRandomValues(new Uint8Array(16));
const hash = await pbkdf2B64(PASSWORD, salt);

const path = "public/data/accounts.json";
const file = JSON.parse(readFileSync(path, "utf8"));
if (!file.accounts.some((a) => a.username === USERNAME)) {
  file.accounts.push({
    id: `acc-${USERNAME}-${Date.now().toString(36)}`,
    username: USERNAME,
    salt: Buffer.from(salt).toString("base64"),
    hash,
    created: new Date().toISOString(),
  });
  writeFileSync(path, JSON.stringify(file, null, 2) + "\n");
  console.log(`Añadida cuenta local de prueba: ${USERNAME} / ${PASSWORD}`);
} else {
  console.log(`La cuenta ${USERNAME} ya existe en local`);
}
