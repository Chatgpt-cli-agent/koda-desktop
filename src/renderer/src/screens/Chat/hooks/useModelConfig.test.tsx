import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useModelConfig } from "./useModelConfig";

const discovery = vi.hoisted(() => ({
  byProvider: {} as Record<string, { models: string[]; status: string }>,
}));

vi.mock("../../../hooks/useDiscoveredModels", () => ({
  useDiscoveredModels: (args: { provider: string }) =>
    discovery.byProvider[args.provider] ?? {
      models: [],
      status: "unsupported",
    },
}));

vi.mock("../../../components/useI18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

interface SavedModel {
  id: string;
  name: string;
  provider: string;
  model: string;
  baseUrl: string;
  createdAt: number;
}

function Harness(): React.JSX.Element {
  const { modelGroups } = useModelConfig();
  const labels = modelGroups.flatMap((group) =>
    group.models.map((model) => model.label),
  );
  return <output data-testid="models">{JSON.stringify(labels)}</output>;
}

// Exposes the grouping shape (header brand + each model's routing provider) so a
// test can assert brand grouping without changing routing.
function GroupHarness(): React.JSX.Element {
  const { modelGroups } = useModelConfig();
  const shape = modelGroups.map((g) => ({
    provider: g.provider,
    label: g.providerLabel,
    models: g.models.map((m) => ({ model: m.model, provider: m.provider })),
  }));
  return <output data-testid="groups">{JSON.stringify(shape)}</output>;
}

describe("useModelConfig", () => {
  let savedModels: SavedModel[];
  let emitModelLibraryChanged: (() => void) | null;

  beforeEach(() => {
    savedModels = [
      {
        id: "codex-gpt-55",
        name: "Codex CLI GPT-5.5",
        provider: "codex-cli",
        model: "gpt-5.5",
        baseUrl: "",
        createdAt: 1,
      },
    ];
    emitModelLibraryChanged = null;

    Object.defineProperty(window, "hermesAPI", {
      configurable: true,
      value: {
        getModelConfig: vi.fn(async () => ({
          provider: "codex-cli",
          model: "gpt-5.5",
          baseUrl: "",
        })),
        listModels: vi.fn(async () => savedModels),
        onConnectionConfigChanged: vi.fn(() => vi.fn()),
        onModelLibraryChanged: vi.fn((callback: () => void) => {
          emitModelLibraryChanged = callback;
          return vi.fn();
        }),
        setModelConfig: vi.fn(async () => true),
      },
    });
  });

  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window, "hermesAPI");
  });

  it("reloads the chat picker when the model library changes", async () => {
    render(<Harness />);

    await waitFor(() => {
      expect(screen.getByTestId("models")).toHaveTextContent(
        "Codex CLI GPT-5.5",
      );
    });

    savedModels = [
      ...savedModels,
      {
        id: "deepseek-v4-pro",
        name: "DeepSeek V4 Pro",
        provider: "deepseek",
        model: "deepseek-v4-pro",
        baseUrl: "",
        createdAt: 2,
      },
    ];

    await act(async () => {
      emitModelLibraryChanged?.();
    });

    await waitFor(() => {
      expect(screen.getByTestId("models")).toHaveTextContent("DeepSeek V4 Pro");
    });
  });

  it("groups a custom Koda model under the Koda brand while keeping custom routing", async () => {
    savedModels = [
      {
        id: "hs-swift",
        name: "hermesone-swift",
        provider: "custom",
        model: "hermesone-swift",
        baseUrl: "https://inference.hermesone.org/v1",
        createdAt: 1,
      },
    ];

    render(<GroupHarness />);

    await waitFor(() => {
      const groups = JSON.parse(
        screen.getByTestId("groups").textContent || "[]",
      );
      const hs = groups.find((g: { label: string }) => g.label === "Koda");
      expect(hs).toBeTruthy();
      // Not lumped under the generic OpenAI-compatible bucket.
      expect(hs.provider).toBe("hermesone");
      // Routing stays on `custom` + the base URL so the request still resolves.
      expect(hs.models[0]).toEqual({
        model: "hermesone-swift",
        provider: "custom",
      });
    });
  });

  // @lat: [[local-studio-backend#The model library comes from the engine#The picker offers every model the endpoint advertises]]
  it("offers every model a custom endpoint advertises, not only the saved one", async () => {
    // The library holds the models that were saved by hand. A local Unsloth
    // Studio holds every GGUF that was downloaded and advertises all of them
    // on /v1/models — the picker has to offer them, or the other models can
    // never be tried.
    discovery.byProvider.custom = {
      models: [
        "unsloth/Ornith-1.5-35B-A3B-GGUF",
        "unsloth/Qwen2.5-Coder-14B-Instruct-128K-GGUF",
        "unsloth/North-Mini-Code-1.0-GGUF",
      ],
      status: "ok",
    };
    vi.mocked(window.hermesAPI.getModelConfig).mockResolvedValue({
      provider: "custom",
      model: "unsloth/Ornith-1.5-35B-A3B-GGUF",
      baseUrl: "http://127.0.0.1:8888/v1",
    } as never);
    savedModels = [
      {
        id: "studio-row",
        name: "unsloth/Ornith-1.5-35B-A3B-GGUF",
        provider: "custom",
        model: "unsloth/Ornith-1.5-35B-A3B-GGUF",
        baseUrl: "http://127.0.0.1:8888/v1",
        createdAt: 1,
      },
    ];

    render(<Harness />);

    await waitFor(() => {
      const labels = JSON.parse(
        screen.getByTestId("models").textContent || "[]",
      ) as string[];
      expect(labels).toContain("unsloth/Qwen2.5-Coder-14B-Instruct-128K-GGUF");
      expect(labels).toContain("unsloth/North-Mini-Code-1.0-GGUF");
      // The saved model is not offered twice — once from the library, once
      // from the live list.
      expect(
        labels.filter((l) => l === "unsloth/Ornith-1.5-35B-A3B-GGUF"),
      ).toHaveLength(1);
    });
  });

  // @lat: [[local-studio-backend#The model library comes from the engine#The picker offers every model the endpoint advertises]]
  it("keeps a named provider's library curated", async () => {
    // Only `custom` endpoints merge their live catalogue. A named provider's
    // library is curated on purpose.
    discovery.byProvider.openai = {
      models: ["gpt-4.1", "gpt-5.5", "o3"],
      status: "ok",
    };
    vi.mocked(window.hermesAPI.getModelConfig).mockResolvedValue({
      provider: "openai",
      model: "gpt-4.1",
      baseUrl: "",
    } as never);
    savedModels = [
      {
        id: "gpt-row",
        name: "GPT-4.1",
        provider: "openai",
        model: "gpt-4.1",
        baseUrl: "",
        createdAt: 1,
      },
    ];

    render(<Harness />);

    await waitFor(() => {
      const labels = JSON.parse(
        screen.getByTestId("models").textContent || "[]",
      ) as string[];
      expect(labels).toEqual(["GPT-4.1"]);
    });
  });

  // @lat: [[local-studio-backend#The model library comes from the engine#A local endpoint is found by its host]]
  it("offers a local endpoint's catalogue under the provider name the engine gave it", async () => {
    // The engine registers the local Studio as the named provider `unsloth`,
    // and the model library row carries that name too. The endpoint is still
    // the user's own machine, so its catalogue is what the picker must offer
    // — the provider's name cannot decide that.
    discovery.byProvider.unsloth = {
      models: [
        "unsloth/Ornith-1.5-35B-A3B-GGUF",
        "unsloth/North-Mini-Code-1.0-GGUF",
      ],
      status: "ok",
    };
    vi.mocked(window.hermesAPI.getModelConfig).mockResolvedValue({
      provider: "unsloth",
      model: "unsloth/Ornith-1.5-35B-A3B-GGUF",
      baseUrl: "http://127.0.0.1:8888/v1",
    } as never);
    savedModels = [
      {
        id: "studio-row",
        name: "unsloth/Ornith-1.5-35B-A3B-GGUF",
        provider: "unsloth",
        model: "unsloth/Ornith-1.5-35B-A3B-GGUF",
        baseUrl: "http://127.0.0.1:8888/v1",
        createdAt: 1,
      },
    ];

    render(<Harness />);

    await waitFor(() => {
      const labels = JSON.parse(
        screen.getByTestId("models").textContent || "[]",
      ) as string[];
      expect(labels).toContain("unsloth/North-Mini-Code-1.0-GGUF");
      expect(
        labels.filter((l) => l === "unsloth/Ornith-1.5-35B-A3B-GGUF"),
      ).toHaveLength(1);
    });
  });
});
