import test from "node:test";
import assert from "node:assert/strict";
import { validatePost, istToUtc, isSundayIST } from "../src/index.js";

const base = { kind: "reel", platforms: ["ig", "fb"], caption: "SIP kya hai? #SIP", media: ["a.mp4"], when_ist: "2030-12-02T19:00" };

test("IST converts to UTC", () => {
  assert.equal(istToUtc("2030-12-02T19:00").toISOString(), "2030-12-02T13:30:00.000Z");
});
test("Sunday in IST is detected even when UTC is Saturday", () => {
  assert.equal(isSundayIST(istToUtc("2030-12-01T01:00")), true); // Sun 01:00 IST = Sat 19:30 UTC
  assert.equal(isSundayIST(istToUtc("2030-12-02T01:00")), false);
});
test("valid reel passes", () => assert.deepEqual(validatePost(base).errs, []));
test("Sunday rejected", () => assert.match(validatePost({ ...base, when_ist: "2030-12-01T19:00" }).errs.join(), /Sunday/));
test("more than 5 hashtags rejected", () =>
  assert.match(validatePost({ ...base, caption: "#a #b #c #d #e #f" }).errs.join(), /5 hashtags/));
test("carousel needs jpgs", () =>
  assert.match(validatePost({ ...base, kind: "carousel", media: ["1.png", "2.png"] }).errs.join(), /JPEG/));
test("past time rejected", () => assert.match(validatePost({ ...base, when_ist: "2020-01-06T10:00" }).errs.join(), /past/));
