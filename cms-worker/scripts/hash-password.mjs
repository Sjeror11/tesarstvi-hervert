import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

const password = process.argv[2];

if (!password) {
    console.error("Pouziti: npm run hash-password -- \"moje-heslo\"");
    process.exit(1);
}

const iterations = 100000;
const salt = randomBytes(16).toString("hex");
const hash = pbkdf2Sync(password, salt, iterations, 32, "sha256").toString("base64");
const encoded = `pbkdf2_sha256$${iterations}$${salt}$${hash}`;

// Minimalni self-check, aby bylo jasne, ze format je validni.
const [, checkIterations, checkSalt, checkHash] = encoded.split("$");
const verification = pbkdf2Sync(password, checkSalt, Number(checkIterations), 32, "sha256");
const same = timingSafeEqual(verification, Buffer.from(checkHash, "base64"));

if (!same) {
    console.error("Nepodarilo se overit vygenerovany hash.");
    process.exit(1);
}

console.log(encoded);
