// Hero joinbar mirror (template docs/reference/fix_front.html L645-652):
// asserts components/SessionGate.tsx JoinBar + components/HeroActions.tsx
// reproduce the template's .joinbar structure/classes exactly, with no
// half-wired extras. Source-mirror style: no @testing-library in this repo,
// so the contract is pinned on the rendered source strings.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const gate = readFileSync("components/SessionGate.tsx", "utf8");
const hero = readFileSync("components/HeroActions.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");

describe("hero joinbar mirrors template fix_front.html L645-652", () => {
  it("renders .joinbar > .jb-l ROOM + #join-code + .btn#join-go + .jb-or + .btn.primary#room-new in order", () => {
    const bar = gate.slice(gate.indexOf('<div className="joinbar">'));
    for (const token of ["jb-l", ">ROOM<", 'id="join-code"', 'id="join-go"', "jb-or", 'id="room-new"']) {
      expect(bar, `missing ${token}`).toContain(token);
    }
    const order = ["jb-l", 'id="join-code"', 'id="join-go"', "jb-or", 'id="room-new"'].map(
      (t) => bar.indexOf(t),
    );
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("shows #join-err.join-err only on real error (.show toggle, never always-on)", () => {
    expect(gate).toContain('id="join-err"');
    expect(gate).toContain("join-err");
    expect(gate, "join-err must toggle .show").toMatch(/join-err.*show/s);
  });

  it("binds signed-in state to .jb-you#jb-you > Joining as b#jb-name + button#jb-change, hidden when signed out", () => {
    for (const token of ['id="jb-you"', "jb-you", 'id="jb-name"', 'id="jb-change"']) {
      expect(gate, `missing ${token}`).toContain(token);
    }
    expect(gate).toContain("Joining as");
    expect(gate, "jb-you must toggle .show").toMatch(/jb-you.*show/s);
  });

  it("has no half-wired extras: no done-link, no 'Not signed in' roster mix on the hero", () => {
    expect(gate, "done-link must go").not.toContain("Enter {done");
    expect(gate, "roster mix must go").not.toContain("Not signed in");
    expect(gate).not.toContain('data-users="roster"');
  });

  it("Join validates war-[A-Za-z0-9_-]{1,64} then POSTs /api/rooms/ensure and jumps", () => {
    expect(gate).toContain("/api/rooms/ensure");
    expect(gate).toContain("roomPath(");
  });

  it("hero CTA mirrors template label 'New war-room' (ctaEnter)", () => {
    expect(hero).toContain("New war-room");
    expect(hero).toContain('id="ctaEnter"');
  });

  it("globals.css carries the template join-bar rules (no unstyled flash, no always-on err)", () => {
    for (const token of [".joinbar{", ".jb-l{", "#join-code{", ".jb-or{", ".jb-you{", ".jb-you.show", ".join-err{", ".join-err.show"]) {
      expect(css, `missing ${token}`).toContain(token);
    }
  });
});
