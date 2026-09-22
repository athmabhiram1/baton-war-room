import { describe, expect, it } from "vitest";

import { resolveVertexConfig } from "../lib/llm";

// Vertex live-LLM wiring (T7). No network: config resolution only.
describe("resolveVertexConfig", () => {
  it("returns null when no credentials are configured", () => {
    const saved = {
      file: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      json: process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
      project: process.env.GOOGLE_VERTEX_PROJECT,
    };
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    delete process.env.GOOGLE_VERTEX_PROJECT;
    try {
      expect(resolveVertexConfig()).toBeNull();
    } finally {
      if (saved.file !== undefined) process.env.GOOGLE_APPLICATION_CREDENTIALS = saved.file;
      if (saved.json !== undefined) process.env.GOOGLE_SERVICE_ACCOUNT_JSON = saved.json;
      if (saved.project !== undefined) process.env.GOOGLE_VERTEX_PROJECT = saved.project;
    }
  });

  it("parses inline service-account JSON from env", () => {
    const saved = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({
      type: "service_account",
      project_id: "demo-project",
      client_email: "demo@example.iam.gserviceaccount.com",
      private_key: "DEMO-NOT-A-REAL-KEY",
    });
    try {
      const cfg = resolveVertexConfig();
      expect(cfg).not.toBeNull();
      expect(cfg?.project).toBe("demo-project");
      expect(cfg?.credentials.client_email).toContain("demo@example");
    } finally {
      if (saved !== undefined) process.env.GOOGLE_SERVICE_ACCOUNT_JSON = saved;
      else delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    }
  });
});
