import { describe, expect, it, vi } from "vitest";

// Importing the pure URL builder must not initialize the session/config graph.
vi.mock("./config", () => {
  throw new Error("URL construction cannot initialize desktop configuration");
});

import { dashboardApiUrl } from "./dashboard-api-url";

describe("dashboard URL construction", () => {
  // @lat: [[scheduled-jobs#Test specifications#Dashboard URL normalization]]
  it("normalizes saved endpoints without loading desktop configuration", () => {
    for (const remoteUrl of [
      " https://dashboard.test:9443/v1/ ",
      "https://dashboard.test:9443/api",
      "https://dashboard.test:9443/?saved=old#fragment",
    ]) {
      expect(
        dashboardApiUrl({ remoteUrl, apiKey: "" }, "/api/cron/jobs?limit=20"),
      ).toBe("https://dashboard.test:9443/api/cron/jobs?limit=20");
    }
    expect(
      dashboardApiUrl(
        {
          remoteUrl:
            "https://proxy%20user:pass%40word@dashboard.test/api?old=1#x",
          apiKey: "",
        },
        "/api/status",
      ),
    ).toBe("https://proxy%20user:pass%40word@dashboard.test/api/status");
    expect(() =>
      dashboardApiUrl({ remoteUrl: "  ", apiKey: "" }, "/api/status"),
    ).toThrow("Remote Koda dashboard URL is not configured.");
    expect(() =>
      dashboardApiUrl({ remoteUrl: "not a URL", apiKey: "" }, "/api/status"),
    ).toThrow();
  });

  // @lat: [[scheduled-jobs#Test specifications#Dashboard URL profile routing]]
  it("preserves explicit profile choices and scopes named profiles", () => {
    const target = {
      remoteUrl: "https://dashboard.test/api",
      apiKey: "",
      profile: " work & research ",
    };
    expect(dashboardApiUrl(target, "/api/cron/jobs?limit=20")).toBe(
      "https://dashboard.test/api/cron/jobs?limit=20&profile=work+%26+research",
    );
    expect(dashboardApiUrl(target, "/api/cron/jobs?profile=all&limit=20")).toBe(
      "https://dashboard.test/api/cron/jobs?profile=all&limit=20",
    );
    expect(
      dashboardApiUrl({ ...target, profile: "default" }, "/api/cron/jobs"),
    ).toBe("https://dashboard.test/api/cron/jobs");
    expect(
      dashboardApiUrl(
        { ...target, profile: "default" },
        "/api/cron/jobs?profile=default",
      ),
    ).toBe("https://dashboard.test/api/cron/jobs?profile=default");
  });
});
