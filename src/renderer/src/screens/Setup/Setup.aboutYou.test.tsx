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
 * First use also asks who the *owner* is.
 *
 * The owner's details live in their own file (`memories/USER.md`), separate
 * from the assistant's persona, and are written only when the user actually
 * typed something — re-running setup must never wipe details already saved.
 */

const LOCAL_PROVIDER_INDEX = PROVIDERS.setup.findIndex(
  (provider) => provider.id === "local",
);

function api(): {
  setEnv: ReturnType<typeof vi.fn>;
  setModelConfig: ReturnType<typeof vi.fn>;
  writeSoul: ReturnType<typeof vi.fn>;
  writeUserProfile: ReturnType<typeof vi.fn>;
  openExternal: ReturnType<typeof vi.fn>;
} {
  return {
    setEnv: vi.fn().mockResolvedValue(true),
    setModelConfig: vi.fn().mockResolvedValue(true),
    writeSoul: vi.fn().mockResolvedValue(true),
    writeUserProfile: vi.fn().mockResolvedValue({ success: true }),
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

describe("Setup — about you", () => {
  beforeEach(() => {
    i18nState.t = (key: string): string => `en:${key}`;
  });

  // @lat: [[koda-persona#Details about the owner#Setup writes USER.md when the user types something]]
  it("writes the details the owner typed", async () => {
    const hermesAPI = api();
    renderSetup(hermesAPI);

    fireEvent.change(
      screen.getByPlaceholderText("en:setup.aboutYouPlaceholder"),
      { target: { value: "My name is Sam. Call me Sam." } },
    );
    fireEvent.click(screen.getByText("en:setup.continue"));

    await waitFor(() =>
      expect(hermesAPI.writeUserProfile).toHaveBeenCalledTimes(1),
    );
    expect(hermesAPI.writeUserProfile.mock.calls[0][0]).toBe(
      "My name is Sam. Call me Sam.",
    );
  });

  // @lat: [[koda-persona#Details about the owner#Setup leaves USER.md alone when the user types nothing]]
  it("leaves the details alone when the owner typed nothing", async () => {
    const hermesAPI = api();
    const { onComplete } = renderSetup(hermesAPI);

    fireEvent.click(screen.getByText("en:setup.continue"));

    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(hermesAPI.writeUserProfile).not.toHaveBeenCalled();
  });
});
