import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

// Both production Office components render here. Only the WebGL boundary and
// asset layers are isolated: this scheduler exposes Canvas's frame-loop contract
// without a GPU, model downloads, or a real the engine's installation.
const frames = vi.hoisted(() => ({
  rendered: 0,
  mounts: 0,
  unmounts: 0,
  loops: 0,
  peakLoops: 0,
}));

vi.mock("@react-three/fiber", async () => {
  const { useEffect } = await import("react");
  return {
    Canvas: ({ frameloop = "always" }: { frameloop?: string }) => {
      useEffect(() => {
        frames.mounts += 1;
        return () => {
          frames.unmounts += 1;
        };
      }, []);
      useEffect(() => {
        if (frameloop !== "always") return;
        frames.loops += 1;
        frames.peakLoops = Math.max(frames.peakLoops, frames.loops);
        let request = 0;
        const draw = (): void => {
          frames.rendered += 1;
          request = requestAnimationFrame(draw);
        };
        request = requestAnimationFrame(draw);
        return () => {
          cancelAnimationFrame(request);
          frames.loops -= 1;
        };
      }, [frameloop]);
      return <canvas data-testid="office-canvas" data-frameloop={frameloop} />;
    },
    useFrame: vi.fn(),
    useThree: vi.fn(),
  };
});
vi.mock("@react-three/drei", () => ({ OrbitControls: () => null }));
vi.mock("troika-three-text", () => ({ configureTextBuilder: vi.fn() }));
vi.mock("./office3d/objects/SceneEnvironment", () => ({
  SceneEnvironment: () => null,
}));
vi.mock("./office3d/objects/CityBackdrop", () => ({
  CityBackdrop: () => null,
  DistantSkyline: () => null,
}));
vi.mock("./office3d/objects/Traffic", () => ({ TrafficLayer: () => null }));
vi.mock("./office3d/objects/Bank", () => ({
  BankSection: () => null,
  ConnectingStreet: () => null,
}));
vi.mock("./office3d/objects/CarShowroom", () => ({ CarShowroom: () => null }));
vi.mock("./office3d/objects/OfficeShell", () => ({
  Room: () => null,
  InteriorWalls: () => null,
  GlassWalls: () => null,
  CeoOfficeExtras: () => null,
}));
vi.mock("./office3d/objects/furniture", () => ({
  Workstations: () => null,
  FurniturePieces: () => null,
}));
vi.mock("./office3d/objects/AgentsLayer", () => ({ AgentsLayer: () => null }));
vi.mock("./office3d/objects/Pedestrians", () => ({
  PedestriansLayer: () => null,
}));
vi.mock("./office3d/objects/Roofs", () => ({ GlassRoof: () => null }));
vi.mock("./office3d/objects/Player", () => ({
  PlayerLayer: () => null,
  PLAYER_SPAWN: [0, 0, 0],
  PLAYER_LOOK_Y: 1,
}));
vi.mock("../../components/useI18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));
vi.mock("./OneChatModal", () => ({ default: () => null }));
vi.mock("./RepInteractionPanel", () => ({ default: () => null }));

import Office from "./Office";

let visibility: DocumentVisibilityState = "visible";

beforeEach(() => {
  vi.useFakeTimers();
  visibility = "visible";
  vi.spyOn(document, "visibilityState", "get").mockImplementation(
    () => visibility,
  );
  Object.assign(frames, {
    rendered: 0,
    mounts: 0,
    unmounts: 0,
    loops: 0,
    peakLoops: 0,
  });
  Object.defineProperty(window, "hermesAPI", {
    configurable: true,
    value: {
      listProfiles: vi.fn().mockResolvedValue([]),
      kanbanListTasks: vi.fn().mockResolvedValue({ success: true, data: [] }),
      getGpuStatus: vi
        .fn()
        .mockResolvedValue({ hardwareAccelerationEnabled: true }),
    },
  });
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function tick(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(64);
  });
}

async function setVisibility(next: DocumentVisibilityState): Promise<void> {
  await act(async () => {
    visibility = next;
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

// @lat: [[office-rendering-tests#Hidden pane stops frames]]
it("pauses the actual retained Office Canvas after navigating away and resumes the same instance", async () => {
  const view = render(<Office visible profile="work" />);
  await tick();
  expect(frames.rendered).toBeGreaterThan(0);
  for (let cycle = 0; cycle < 3; cycle += 1) {
    view.rerender(<Office visible={false} profile="work" />);
    const before = frames.rendered;
    await tick();
    expect(frames.rendered).toBe(before);
    expect(screen.getByTestId("office-canvas")).toHaveAttribute(
      "data-frameloop",
      "never",
    );
    view.rerender(<Office visible profile="work" />);
    await tick();
    expect(frames.rendered).toBeGreaterThan(before);
  }
  expect(frames.mounts).toBe(1);
  expect(frames.unmounts).toBe(0);
  expect(frames.peakLoops).toBe(1);
});

// @lat: [[office-rendering-tests#Background document stops frames]]
it("pauses when the application document is hidden and cannot resume an unselected Office pane", async () => {
  const view = render(<Office visible profile="work" />);
  await tick();
  await setVisibility("hidden");
  const before = frames.rendered;
  await tick();
  expect(frames.rendered).toBe(before);
  view.rerender(<Office visible={false} profile="work" />);
  await setVisibility("visible");
  await tick();
  expect(frames.rendered).toBe(before);
  view.rerender(<Office visible profile="work" />);
  await tick();
  expect(frames.rendered).toBeGreaterThan(before);
  expect(frames.mounts).toBe(1);
  expect(frames.peakLoops).toBe(1);
});

// @lat: [[office-rendering-tests#Hidden initial mount]]
it("does not start a frame loop when Office first mounts in a background document", async () => {
  visibility = "hidden";
  render(<Office visible profile="work" />);
  await tick();
  expect(frames.rendered).toBe(0);
  await setVisibility("visible");
  await tick();
  expect(frames.rendered).toBeGreaterThan(0);
});

// @lat: [[office-rendering-tests#Unmount cleans visibility owner]]
it("removes its visibility listener and frame scheduler on unmount", async () => {
  const add = vi.spyOn(document, "addEventListener");
  const remove = vi.spyOn(document, "removeEventListener");
  const view = render(<Office visible profile="work" />);
  await tick();
  const listener = add.mock.calls.find(
    ([type]) => type === "visibilitychange",
  )?.[1];
  expect(listener).toBeDefined();
  view.unmount();
  expect(remove).toHaveBeenCalledWith("visibilitychange", listener);
  const before = frames.rendered;
  await setVisibility("hidden");
  await setVisibility("visible");
  await tick();
  expect(frames.rendered).toBe(before);
  expect(frames.loops).toBe(0);
});
