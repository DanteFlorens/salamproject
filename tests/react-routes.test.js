import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { homeFor, isAuthPath, readPath, redirectTarget, sameHash } from "../src/app/routes.js";

describe("hash routing guards", () => {
  it("sends guests to login", () => {
    assert.deepEqual(redirectTarget("/work", null), { href: "/login" });
    assert.equal(redirectTarget("/login", null), null);
    assert.equal(redirectTarget("/owner", null), null);
    assert.equal(redirectTarget("/join/SR-TEST", null), null);
  });

  it("sends logged-in users off auth screens", () => {
    assert.deepEqual(redirectTarget("/login", { role: "lead" }), { href: "/" });
    assert.deepEqual(redirectTarget("/owner", { role: "manager" }), { href: "/work" });
    assert.deepEqual(redirectTarget("/join", { role: "crew" }), { href: "/tasks" });
  });

  it("keeps crew on tasks only", () => {
    assert.deepEqual(redirectTarget("/work", { role: "crew" }), { href: "/tasks" });
    assert.equal(redirectTarget("/tasks", { role: "crew" }), null);
  });

  it("maps legacy lead routes into the house desk", () => {
    assert.deepEqual(redirectTarget("/apartments", { role: "lead" }), { href: "/work", desk: "plan" });
    assert.deepEqual(redirectTarget("/residents", { role: "lead" }), { href: "/work", desk: "people" });
    assert.deepEqual(redirectTarget("/ledger", { role: "lead" }), { href: "/reports" });
  });

  it("home depends on role", () => {
    assert.equal(homeFor(null), "/login");
    assert.equal(homeFor({ role: "lead" }), "/");
    assert.equal(homeFor({ role: "manager" }), "/work");
    assert.equal(homeFor({ role: "crew" }), "/tasks");
  });

  it("recognizes auth paths", () => {
    assert.equal(isAuthPath("/login"), true);
    assert.equal(isAuthPath("/join/ABC"), true);
    assert.equal(isAuthPath("/work"), false);
  });
});

describe("path helpers", () => {
  it("sameHash understands root aliases", () => {
    assert.equal(sameHash("/", ""), true);
    assert.equal(sameHash("/", "#/"), true);
    assert.equal(sameHash("/work", "#/work"), true);
    assert.equal(sameHash("/", "#/work"), false);
  });

  it("readPath normalizes missing hash", () => {
    assert.equal(readPath(""), "/");
    assert.equal(readPath("#/team"), "/team");
    assert.equal(readPath("team"), "/");
  });
});
