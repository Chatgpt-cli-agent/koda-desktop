import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PROVIDERS } from "../../constants";

const i18nState = vi.hoisted(() => ({
  t: (key: string): string => `en:${key}`,
}));

vi.mock("../../components/useI18n", () => ({
  useI18n: () => ({ t: i18nState.t }),
}));

import Setup from "./Setup";

/**
 * First use is where the user makes the assistant theirs.
 *
 * The setup screen writes the persona only when the user actually named the
 * assistant or described it — running setup again must never overwrite a
 * persona the user already wrote.
 */

const LOCAL_PROVIDER_INDEX = PROVIDERS.setup.findIndex(
  (provider) => provider.id === "local",
);

function api(): {
  setEnv: ReturnType<typeof vi.fn>;
  setModelConfig: ReturnType<typeof vi.fn>;
  writeSoul: ReturnType<typeof vi.fn>;
  openExternal: ReturnType<typeof vi.fn>;
} {
  return {
    setEnv: vi.fn().mockResolvedValue(true),
    setModelConfig: vi.fn().mockResolvedValue(true),
    writeSoul: vi.fn().mockResolvedValue(true),
    openExternal: vi.fn().mockResolvedValue(true),
  };
}

function renderSetup(hermesAPI: ReturnType<typeof api>): {
  onComplete: () => void;
  container: HTMLElement;
} {
  Object.defineProperty(window, "hermesAPI", {
    configurable: true,
    value: hermesAPI,
  });
  const onComplete = vi.fn();
  const { container } = render(<Setup onComplete={onComplete} />);
  // The local provider needs no API key, so the form can be completed.
  const cards = container.querySelectorAll(".setup-provider-card");
  fireEvent.click(cards[LOCAL_PROVIDER_INDEX]);
  return { onComplete, container };
}

describe("Setup — make it yours", () => {
  beforeEach(() => {
    i18nState.t = (key: string): string => `en:${key}`;
  });

  // @lat: [[koda-persona#First use offers the persona#The setup screen writes the persona]]
  it("writes the name and description the user chose", async () => {
    const hermesAPI = api();
    renderSetup(hermesAPI);

    fireEvent.change(
      screen.getByPlaceholderText("en:setup.agentNamePlaceholder"),
      {
        target: { value: "Nova" },
      },
    );
    fireEvent.change(
      screen.getByPlaceholderText("en:setup.personaPlaceholder"),
      {
        target: { value: "Answers in one line." },
      },
    );
    fireEvent.click(screen.getByText("en:setup.continue"));

    await waitFor(() => expect(hermesAPI.writeSoul).toHaveBeenCalledTimes(1));
    const written = hermesAPI.writeSoul.mock.calls[0][0] as string;
    expect(written).toContain("You are Nova");
    expect(written).toContain("Answers in one line.");
  });

  // @lat: [[koda-persona#First use offers the persona#The setup screen writes the persona]]
  it("leaves the persona alone when the user chose nothing", async () => {
    const hermesAPI = api();
    const { onComplete } = renderSetup(hermesAPI);

    fireEvent.click(screen.getByText("en:setup.continue"));

    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(hermesAPI.writeSoul).not.toHaveBeenCalled();
  });
});
