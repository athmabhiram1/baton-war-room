// Landing latency-honesty (war-room final-presentation polish, Wave 1 Task 1):
// static numbers 412ms/1380ms read as live results on a projector.
// Every hit must be co-located with a visible sample|target|preview|
// illustrative|last verified qualifier. Source-mirror style: no
// @testing-library in this repo, so the contract is pinned on the
// rendered source strings of app/page.tsx.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("app/page.tsx", "utf8");
const lines = page.split("\n");

describe("landing latency honesty: no bare 412/1380 without qualifier", () => {
  it("every line with 412ms|1380ms carries sample|target|preview|illustrative|last verified", () => {
    const hits = lines
      .map((text, i) => ({ text, n: i + 1 }))
      .filter(({ text }) => /412ms|1380ms/.test(text));
    expect(hits.length, "expected static latency hits in app/page.tsx").toBeGreaterThan(0);
    for (const { text, n } of hits) {
      expect(
        text,
        `line ${n} shows a bare latency number with no honesty qualifier: ${text.trim()}`,
      ).toMatch(/sample|target|preview|illustrative|last verified/i);
    }
  });

  it("mock-foot sample line keeps 'sample' and adds a 'target' qualifier", () => {
    const foot = page.slice(page.indexOf("mock-foot"));
    expect(foot).toMatch(/sample/i);
    expect(foot, "mock-foot must name the target next to the sample").toMatch(/target/i);
  });

  it("probe block prefixes sample/last-verified and points to the room SLO tab", () => {
    const probe = page.slice(page.indexOf("Latency is a contract"));
    expect(probe, "probe must be labeled sample").toMatch(/sample probe/i);
    expect(probe, "probe must say last verified").toMatch(/last verified/i);
    expect(probe, "probe must point to the room SLO tab").toMatch(/room SLO tab/i);
  });

  it("hstats carries a visible 'target' qualifier (not title-attr only)", () => {
    const block = page.slice(page.indexOf('<div className="hstats"'), page.indexOf("mock-top"));
    const visible = block.replace(/title="[^"]*"/g, "");
    expect(visible, "hstats visible text must say target").toMatch(/target/i);
  });

  it("hero still renders the PREVIEW badge", () => {
    expect(page).toContain("PREVIEW");
    expect(page).toMatch(/mlive preview/);
  });
});
