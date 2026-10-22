import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
type PublicConnectionConfig = Awaited<
  ReturnType<typeof window.hermesAPI.getConnectionConfig>
>;

vi.mock("../../components/useI18n", () => {
  const t = (key: string): string => key;
  return { useI18n: () => ({ t }) };
});
const gateway = vi.hoisted(() => ({
  clients: [] as Array<{
    onEvent?: (event: unknown) => void;
    closed: boolean;
    rejectPending?: () => void;
    request: (
      method: string,
      params?: Record<string, unknown>,
    ) => Promise<unknown>;
  }>,
  request: vi.fn(),
}));
vi.mock("./dashboardGatewayClient", () => ({
  DashboardGatewayClient: class {
    connected = true;
    owner: {
      onEvent?: (event: unknown) => void;
      closed: boolean;
      rejectPending?: () => void;
      request: (
        method: string,
        params?: Record<string, unknown>,
      ) => Promise<unknown>;
    };
    constructor(options: { onEvent?: (event: unknown) => void }) {
      this.owner = {
        ...options,
        closed: false,
        request: (method, params) => this.request(method, params),
      };
      gateway.clients.push(this.owner);
    }
    async connect(): Promise<void> {
      this.close();
      this.owner.closed = false;
    }
    close(): void {
      this.owner.closed = true;
      this.owner.rejectPending?.();
    }
    request = gateway.request;
  },
}));
import Chat from "./Chat";

/**
 * A model pick belongs to the agent it was made in.
 *
 * The agent switcher re-points a blank conversation at another agent instead of
 * minting a new one, so the same chat instance kept the previous agent's pick —
 * provider and base URL included — and routed the next turn with it.
 */

const PROFILE_DEFAULT: Record<string, string> = {
  work: "work-default-model",
  other: "other-default-model",
};

async function fixture(): Promise<{
  api: Record<string, ReturnType<typeof vi.fn>>;
}> {
  const authority = await import(
    "../../../../main/" + "provider-request-target"
  );
  const connection = {
    mode: "remote" as const,
    remoteUrl: "https://chat-model-override.test",
    apiKey: "aaaaaaaa",
    remoteAuthMode: "token" as const,
    remoteChatTransport: "dashboard" as const,
    sshChatTransport: "auto" as const,
    ssh: {
      host: "",
      port: 22,
      username: "",
      keyPath: "",
      remotePort: 8642,
      localPort: 8642,
    },
  };
  const publicConfig = (): PublicConnectionConfig => ({
    connectionId: "a",
    name: "Model override fixture",
    mode: connection.mode,
    remoteUrl: connection.remoteUrl,
    remoteAuthMode: connection.remoteAuthMode,
    remoteChatTransport: connection.remoteChatTransport,
    sshChatTransport: connection.sshChatTransport,
    hasApiKey: true,
    apiKeyLength: connection.apiKey.length,
    ssh: connection.ssh,
  });
  const api: Record<string, ReturnType<typeof vi.fn>> = {
    sendMessage: vi.fn().mockResolvedValue(null),
    getProviderRequestTarget: vi.fn(async () => ({
      connectionId: "a",
      revision: authority.providerTargetRevision(connection),
    })),
    getConnectionConfig: vi.fn(async () => publicConfig()),
    onConnectionConfigChanged: vi.fn(() => () => {}),
    probeRemoteAuthMode: vi.fn().mockResolvedValue({ authMode: "token" }),
    getModelConfig: vi.fn(async (profile?: string) => ({
      model: PROFILE_DEFAULT[profile ?? "work"] ?? "unknown-default-model",
      provider: "openai",
      baseUrl: "",
    })),
    listModels: vi
      .fn()
      .mockResolvedValue([
        { provider: "openai", model: "picked-model", name: "Picked Model" },
      ]),
    discoverModels: vi.fn().mockResolvedValue({ models: [], status: "ok" }),
    getSessionModelOverride: vi.fn().mockResolvedValue(null),
    getModelContextWindow: vi.fn().mockResolvedValue(200000),
    validateChatReadiness: vi.fn().mockResolvedValue({ ok: true, issues: [] }),
    checkChatReadiness: vi.fn().mockResolvedValue({ ok: true, issues: [] }),
    startDashboard: vi.fn().mockResolvedValue({
      running: true,
      connection: { wsUrl: "ws://fixture" },
    }),
    getSessionUsage: vi.fn().mockResolvedValue(null),
    getSessionContextFolder: vi.fn().mockResolvedValue(null),
    getConfig: vi.fn().mockResolvedValue(null),
    getConfigHealth: vi.fn().mockResolvedValue(null),
  };
  Object.defineProperty(window, "hermesAPI", {
    configurable: true,
    value: new Proxy(api, {
      get(record, key: string) {
        record[key] ||= key.startsWith("on")
          ? vi.fn().mockReturnValue(() => {})
          : vi.fn().mockResolvedValue(null);
        return record[key];
      },
    }),
  });
  gateway.request.mockImplementation(async (method: string) => {
    if (method === "model.options")
      return { model: "picked-model", provider: "openai", providers: [] };
    return { status: "ok" };
  });
  return { api };
}

beforeEach(() => {
  localStorage.clear();
  gateway.clients.length = 0;
  gateway.request.mockReset();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe(): void {
        /* No native layout observer in JSDOM. */
      }
      disconnect(): void {
        /* No native layout observer in JSDOM. */
      }
      unobserve(): void {
        /* No native layout observer in JSDOM. */
      }
    },
  );
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe(): void {
        /* No native layout observer in JSDOM. */
      }
      disconnect(): void {
        /* No native layout observer in JSDOM. */
      }
      unobserve(): void {
        /* No native layout observer in JSDOM. */
      }
    },
  );
  Element.prototype.scrollIntoView = vi.fn();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });
});

function modelName(container: HTMLElement): string {
  return container.querySelector(".chat-model-name")?.textContent ?? "";
}

// @lat: [[model-selection#A model pick does not follow a re-pointed agent#A re-pointed agent drops the previous agent's pick]]
it("drops the previous agent's model pick when the run is re-pointed", async () => {
  await fixture();
  const reported: string[] = [];
  const view = render(
    <Chat
      runId="run"
      connectionId="a"
      profile="work"
      onModelChange={(_runId, model) => reported.push(model)}
    />,
  );

  await waitFor(() =>
    expect(modelName(view.container)).toBe("work-default-model"),
  );

  // The owner picks another model for this conversation.
  fireEvent.click(view.container.querySelector(".chat-model-trigger")!);
  fireEvent.click(await screen.findByText("Picked Model"));
  await waitFor(() => expect(modelName(view.container)).toBe("picked-model"));

  // The same blank run is re-pointed at another agent.
  await act(async () => {
    view.rerender(
      <Chat
        runId="run"
        connectionId="a"
        profile="other"
        onModelChange={(_runId, model) => reported.push(model)}
      />,
    );
  });

  await waitFor(() =>
    expect(modelName(view.container)).toBe("other-default-model"),
  );
  expect(reported.at(-1)).toBe("other-default-model");
});
