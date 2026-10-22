import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KODA_PERSONA } from "../../../shared/koda-persona";

const modalState = vi.hoisted(() => ({
  openProfile: vi.fn(),
}));

vi.mock("./useI18n", () => ({
  useI18n: () => ({ t: (key: string): string => `en:${key}` }),
}));

import { ProfileModalContext } from "./profile/ProfileModalContext";
import PersonaPromptBanner from "./PersonaPromptBanner";

/**
 * The persona is the app's own idea of who the assistant is. When it is still
 * the stock one, the user has never customized it — the banner is the one
 * place that offers the change, and it opens the persona editor directly.
 */

function mockSoul(soul: string): void {
  Object.defineProperty(window, "hermesAPI", {
    configurable: true,
    value: { readSoul: vi.fn().mockResolvedValue(soul) },
  });
}

describe("PersonaPromptBanner", () => {
  beforeEach(() => {
    localStorage.clear();
    modalState.openProfile.mockClear();
  });

  // @lat: [[koda-persona#First use offers the persona#The chat offers the persona]]
  it("offers the persona when it is still the stock one", async () => {
    mockSoul(KODA_PERSONA);
    render(
      <ProfileModalContext.Provider
        value={{
          openProfile: modalState.openProfile,
          closeProfile: vi.fn(),
        }}
      >
        <PersonaPromptBanner profile="default" />
      </ProfileModalContext.Provider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("persona-prompt-banner")).toBeInTheDocument(),
    );
  });

  // @lat: [[koda-persona#First use offers the persona#The chat offers the persona]]
  it("opens the persona editor directly", async () => {
    mockSoul(KODA_PERSONA);
    render(
      <ProfileModalContext.Provider
        value={{
          openProfile: modalState.openProfile,
          closeProfile: vi.fn(),
        }}
      >
        <PersonaPromptBanner profile="default" />
      </ProfileModalContext.Provider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("persona-prompt-banner")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByText("en:soul.promptCustomize"));
    expect(modalState.openProfile).toHaveBeenCalledWith("default", {
      initialSection: "persona",
    });
  });

  // @lat: [[koda-persona#First use offers the persona#The chat offers the persona]]
  it("stays out of the way once the persona is the user's own", async () => {
    mockSoul("You are Nova, a marine biologist.");
    render(
      <ProfileModalContext.Provider
        value={{
          openProfile: modalState.openProfile,
          closeProfile: vi.fn(),
        }}
      >
        <PersonaPromptBanner profile="default" />
      </ProfileModalContext.Provider>,
    );
    await waitFor(() =>
      expect(screen.queryByTestId("persona-prompt-banner")).toBeNull(),
    );
  });

  // @lat: [[koda-persona#First use offers the persona#The chat offers the persona]]
  it("does not come back after it was dismissed", async () => {
    localStorage.setItem("hermes-persona-prompt-dismissed", "1");
    mockSoul(KODA_PERSONA);
    render(
      <ProfileModalContext.Provider
        value={{
          openProfile: modalState.openProfile,
          closeProfile: vi.fn(),
        }}
      >
        <PersonaPromptBanner profile="default" />
      </ProfileModalContext.Provider>,
    );
    await waitFor(() =>
      expect(screen.queryByTestId("persona-prompt-banner")).toBeNull(),
    );
  });
});
