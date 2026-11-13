import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_GEN_OPTIONS, generatePassword } from "../src/lib/generator.ts";

test("la longueur demandée est tenue, entre le nombre de jeux et 128", () => {
  assert.equal(generatePassword({ ...DEFAULT_GEN_OPTIONS, length: 32 }).length, 32);
  assert.equal(generatePassword({ ...DEFAULT_GEN_OPTIONS, length: 500 }).length, 128);
  assert.equal(generatePassword({ ...DEFAULT_GEN_OPTIONS, length: 1 }).length, 4);
});

test("chaque jeu activé est présent, aucun jeu désactivé n'apparaît", () => {
  for (let i = 0; i < 200; i++) {
    const p = generatePassword({ length: 8, lowercase: true, uppercase: false, digits: true, symbols: false });
    assert.match(p, /[a-z]/);
    assert.match(p, /[0-9]/);
    assert.doesNotMatch(p, /[A-Z!@#$%^&*()\-_=+[\]{};:,.?/]/);
  }
});

test("sans aucun jeu, on retombe sur les minuscules", () => {
  assert.match(
    generatePassword({ length: 12, lowercase: false, uppercase: false, digits: false, symbols: false }),
    /^[a-z]{12}$/,
  );
});
