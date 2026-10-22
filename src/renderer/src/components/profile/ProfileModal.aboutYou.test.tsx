import { profileEditorFixture } from "../../test/profileEditorFixture";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { expect, it, vi } from "vitest";

vi.mock("../useI18n", () => ({
  useI18n: () => ({
    t: (key: string): string => key,
  }),
}));

vi.mock("../modal/AppModal", () => ({
  AppModal: ({
    open,
    children,
  }: {
    open: boolean;
    children: React.ReactNode;
  }): React.JSX.Element | null => (open ? <div>{children}</div> : null),
  AppModalTitle: ({ children }: { children: React.ReactNode }) => (
    <h1>{children}</h1>
  ),
}));

vi.mock("../common/ProfileAvatar", () => ({
  default: ({ name }: { name: string }): React.JSX.Element => (
    <span data-testid={`avatar-${name}`} />
  ),
}));

vi.mock("../../screens/Soul/Soul", () => ({
  default: (): React.JSX.Element => <div data-testid="soul" />,
}));

vi.mock("../../screens/Memory/MemoryEntries", () => ({
  MemoryEntries: (): React.JSX.Element => <div data-testid="memory" />,
}));

vi.mock("./ProfileWalletPane", () => ({
  default: (): React.JSX.Element => <div data-testid="wallet" />,
}));

import ProfileModal from "./ProfileModal";

/**
 * The owner's details get a section of their own in the agent's profile
 * modal — the "About you" tab loads `memories/USER.md` and saves edits back.
 */

function installHermesAPI(): { writeUserProfile: ReturnType<typeof vi.fn> } {
  const writeUserProfile = vi.fn().mockResolvedValue({ success: true });
  Object.defineProperty(window, "hermesAPI", {
    configurable: true,
    value: {
      ...profileEditorFixture("local").api,
      listProfiles: vi.fn().mockResolvedValue([
        {
          id: "default",
          name: "Default Agent",
          path: "/tmp/koda",
          isDefault: true,
          isActive: true,
          model: "",
          provider: "auto",
          hasEnv: false,
          hasSoul: false,
          skillCount: 0,
          gatewayRunning: false,
        },
      ]),
      readMemory: vi.fn().mockResolvedValue({
        memory: {
          content: "",
          exists: false,
          lastModified: null,
          entries: [],
          charCount: 0,
          charLimit: 4000,
        },
        user: {
          content: "My name is Sam.",
          exists: true,
          lastModified: 1,
          charCount: 15,
          charLimit: 2000,
        },
        stats: { totalSessions: 1, totalMessages: 2 },
      }),
      writeUserProfile,
      setProfileName: vi.fn().mockResolvedValue({ success: true }),
    },
  });
  return { writeUserProfile };
}

function renderModal(): void {
  render(
    <ProfileModal
      name="default"
      open
      onClose={() => {}}
      onChanged={() => {}}
    />,
  );
}

// @lat: [[koda-persona#Details about the owner#The about-you section opens from the agent's profile]]
it("opens the owner's details from the agent's profile modal", async () => {
  const { writeUserProfile } = installHermesAPI();
  renderModal();

  fireEvent.click(
    await screen.findByRole("button", { name: "agents.sectionAboutYou" }),
  );

  const box = (await screen.findByRole("textbox", {
    name: "agents.aboutYouTitle",
  })) as HTMLTextAreaElement;
  expect(box.value).toBe("My name is Sam.");

  fireEvent.change(box, { target: { value: "My name is Sam. Call me Sam." } });
  fireEvent.click(screen.getByText("agents.aboutYouSave"));

  await waitFor(() => expect(writeUserProfile).toHaveBeenCalledTimes(1));
  expect(writeUserProfile.mock.calls[0][0]).toBe(
    "My name is Sam. Call me Sam.",
  );
});
