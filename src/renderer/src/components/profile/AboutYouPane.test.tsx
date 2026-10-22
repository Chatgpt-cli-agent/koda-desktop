import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProfileEditorTarget } from "../../../../shared/profile-editor-target";

vi.mock("../useI18n", () => ({
  useI18n: () => ({
    t: (key: string): string => key,
  }),
}));

import { AboutYouPane } from "./AboutYouPane";

/**
 * "About you" is the owner's own surface: who *you* are, kept in
 * `memories/USER.md`, separate from the assistant's persona.
 */

const target: ProfileEditorTarget = {
  connectionId: "local",
  profile: "default",
  mode: "local",
  scopeToken: "local:default:0",
};

function renderPane(
  overrides: Partial<React.ComponentProps<typeof AboutYouPane>> = {},
): { writeUserProfile: ReturnType<typeof vi.fn> } {
  const writeUserProfile = vi.fn().mockResolvedValue({ success: true });
  Object.defineProperty(window, "hermesAPI", {
    configurable: true,
    value: { writeUserProfile },
  });
  render(
    <AboutYouPane
      content="My name is Sam."
      charLimit={2000}
      profile="default"
      target={target}
      isCurrent={() => true}
      onRefresh={vi.fn()}
      {...overrides}
    />,
  );
  return { writeUserProfile };
}

describe("AboutYouPane", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // @lat: [[koda-persona#Details about the owner#The about-you pane writes USER.md]]
  it("shows the saved details and writes an edit back", async () => {
    const { writeUserProfile } = renderPane();
    const box = screen.getByRole("textbox", { name: "agents.aboutYouTitle" });
    expect((box as HTMLTextAreaElement).value).toBe("My name is Sam.");

    fireEvent.change(box, {
      target: { value: "My name is Sam and I work on Koda." },
    });
    fireEvent.click(screen.getByText("agents.aboutYouSave"));

    await waitFor(() => expect(writeUserProfile).toHaveBeenCalledTimes(1));
    expect(writeUserProfile.mock.calls[0][0]).toBe(
      "My name is Sam and I work on Koda.",
    );
    expect(writeUserProfile.mock.calls[0][1]).toBe("default");
  });

  // @lat: [[koda-persona#Details about the owner#A refused about-you save keeps the details]]
  it("reports a refused save instead of claiming it worked", async () => {
    const writeUserProfile = vi
      .fn()
      .mockResolvedValue({ success: false, error: "Exceeds limit" });
    Object.defineProperty(window, "hermesAPI", {
      configurable: true,
      value: { writeUserProfile },
    });
    render(
      <AboutYouPane
        content="My name is Sam."
        charLimit={2000}
        profile="default"
        target={target}
        isCurrent={() => true}
        onRefresh={vi.fn()}
      />,
    );
    const box = screen.getByRole("textbox", { name: "agents.aboutYouTitle" });
    fireEvent.change(box, { target: { value: "Too long" } });
    fireEvent.click(screen.getByText("agents.aboutYouSave"));

    await screen.findByText("Exceeds limit");
    expect((box as HTMLTextAreaElement).value).toBe("Too long");
    expect(screen.queryByText("common.saved")).toBeNull();
  });
});
