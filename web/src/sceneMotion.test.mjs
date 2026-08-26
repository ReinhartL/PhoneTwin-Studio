import assert from "node:assert/strict";
import test from "node:test";
import { shouldStartDirector } from "./sceneMotion.mjs";

test("director motion does not run during initial scene mount", () => {
  assert.equal(shouldStartDirector(0), false);
});

test("director motion runs after a user action", () => {
  assert.equal(shouldStartDirector(1), true);
  assert.equal(shouldStartDirector(2), true);
});
