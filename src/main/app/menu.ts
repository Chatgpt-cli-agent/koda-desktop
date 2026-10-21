import { app, type BrowserWindow, Menu } from "electron";
import { is } from "@electron-toolkit/utils";

interface MenuDeps {
  getMainWindow: () => BrowserWindow | null;
  openExternalUrl: (rawUrl: unknown) => void;
}

export function buildMenu({ getMainWindow, openExternalUrl }: MenuDeps): void {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),
    {
      label: "Chat",
      submenu: [
        {
          label: "New Chat",
          accelerator: "CmdOrCtrl+N",
          click: () => getMainWindow()?.webContents.send("menu-new-chat"),
        },
        { type: "separator" },
        {
          label: "Search Sessions",
          accelerator: "CmdOrCtrl+K",
          click: () =>
            getMainWindow()?.webContents.send("menu-search-sessions"),
        },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        ...(is.dev
          ? [
              { type: "separator" as const },
              { role: "reload" as const },
              { role: "toggleDevTools" as const },
            ]
          : []),
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(isMac
          ? [{ type: "separator" as const }, { role: "front" as const }]
          : [{ role: "close" as const }]),
      ],
    },
    {
      label: "Help",
      submenu: [
        ...(!is.dev
          ? [
              {
                label: "Toggle Developer Tools",
                accelerator: "Alt+Command+I",
                click: () => getMainWindow()?.webContents.toggleDevTools(),
              },
              { type: "separator" as const },
            ]
          : []),
        {
          // These two point at Koda's own repository, not at the engine's or
          // at upstream's. A menu item labelled "Koda on GitHub" that opens
          // someone else's project is a broken promise, and it is also the
          // one place where the old brand would be printed in the user's
          // browser. Repoint them when Koda has channels of its own.
          label: "Koda on GitHub",
          click: () =>
            openExternalUrl(
              "https://github.com/Chatgpt-cli-agent/koda-desktop",
            ),
        },
        {
          label: "Report an Issue",
          click: () =>
            openExternalUrl(
              "https://github.com/Chatgpt-cli-agent/koda-desktop/issues",
            ),
        },
      ],
    },
  ] as Electron.MenuItemConstructorOptions[];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
