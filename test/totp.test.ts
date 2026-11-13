// Les vecteurs de la RFC 6238 (annexe B), et l'analyse des secrets telle que l'application les range.
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateOtp, parseOtp } from "../src/lib/totp.ts";

// "12345678901234567890" en base32, la clé SHA-1 de l'annexe B.
const SHA1_KEY = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

test("vecteurs SHA-1 de la RFC 6238, sur 8 chiffres", async () => {
  const cfg = { secret: SHA1_KEY, period: 30, digits: 8, algorithm: "SHA-1" as const };
  for (const [t, code] of [
    [59, "94287082"],
    [1111111109, "07081804"],
    [1234567890, "89005924"],
    [20000000000, "65353130"],
  ] as const) {
    assert.equal((await generateOtp(cfg, t * 1000)).code, code);
  }
});

test("une URI otpauth donne secret, chiffres et période", () => {
  assert.deepEqual(
    parseOtp("otpauth://totp/GitHub:demo?secret=jbswy3dpehpk3pxp&issuer=GitHub&digits=8&period=60"),
    { secret: "JBSWY3DPEHPK3PXP", period: 60, digits: 8, algorithm: "SHA-1" },
  );
});

test("un secret brut, espaces compris, et un secret vide", () => {
  assert.equal(parseOtp("jbsw y3dp ehpk 3pxp")?.secret, "JBSWY3DPEHPK3PXP");
  assert.equal(parseOtp(""), null);
});

test("le temps restant suit la période", async () => {
  const r = await generateOtp({ secret: SHA1_KEY, period: 30, digits: 6, algorithm: "SHA-1" }, 59_000);
  assert.equal(r.remaining, 1);
});
