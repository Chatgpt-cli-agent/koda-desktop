import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { StatusBar } from "./StatusBar";
import { profileEditorFixture } from "../../test/profileEditorFixture";

/**
 * The status bar names the model the *open conversation* runs on.
 *
 * It used to name the profile's configured default, which contradicted the
 * composer whenever a conversation had picked its own model.
 */

function installApi(profileModel: string): void {
  Object.defineProperty(window, "hermesAPI", {
    configurable: true,
    value: {
      ...profileEditorFixture("remote").api,
      listProfiles: vi.fn().mockResolvedValue([
        {
          id: "default",
          isActive: true,
          gatewayRunning: true,
          model: profileModel,
          skillCount: 3,
        },
      ]),
    },
  });
}

async function renderBar(model: string): Promise<void> {
  await act(async () => {
    render(<StatusBar activeProfile="default" model={model} />);
  });
}

describe("StatusBar model chip", () => {
  beforeEach(() => {
    installApi("profile-default-model");
  });

  // @lat: [[model-selection#The status bar names the conversation's model#The chip shows the live chat model]]
  it("shows the model the conversation runs on, not the profile default", async () => {
    await renderBar("conversation-model");
    const chip = screen.getByText("conversation-model");
    expect(chip).toBeTruthy();
    expect(screen.queryByText("profile-default-model")).toBeNull();
    expect(chip.getAttribute("title")).toContain("profile-default-model");
  });

  // @lat: [[model-selection#The status bar names the conversation's model#An unresolved conversation shows the profile default]]
  it("falls back to the profile default while the chat has resolved no model", async () => {
    await renderBar("");
    expect(screen.getByText("profile-default-model")).toBeTruthy();
  });
});
