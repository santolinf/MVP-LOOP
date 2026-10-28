import { totpCode, totpStep } from "../modules/admin/totp.js";

/**
 * Development helper: prints the current authenticator code for a TOTP key, for testing admin sign-in on a machine
 * with no authenticator app. Usage: pnpm --filter @loop/api totp <BASE32_KEY>
 */
const secret = (process.argv[2] ?? "").replace(/\s+/g, "");
if (!secret) {
  console.error("Usage: pnpm --filter @loop/api totp <BASE32_KEY>");
  process.exit(1);
}
const now = new Date();
const secondsLeft = 30 - (Math.floor(now.getTime() / 1000) % 30);
console.log(`${totpCode(secret, totpStep(now))}  (valid for about ${secondsLeft}s)`);
