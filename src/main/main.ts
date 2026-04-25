import { app, BrowserWindow, Menu, protocol } from "electron";
import path from "node:path";

import { APP_NAME, OVERTHINK_SCHEME } from "@/shared/branding";

import { renderHomePage } from "./home-page";
import { registerIpcHandlers } from "./ipc";
import { OverthinkStorage } from "./overthink-storage";
import { OverthinkTabs } from "./overthink-tabs";
import { DEFAULT_HOME_URL } from "./url";

let mainWindow: BrowserWindow | null = null;
let tabs: OverthinkTabs | null = null;

const isDev = !app.isPackaged;

protocol.registerSchemesAsPrivileged([
  {
    scheme: OVERTHINK_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  }
]);

function registerAppProtocol(): void {
  protocol.handle(OVERTHINK_SCHEME, (request) => {
    const url = new URL(request.url);

    if (url.hostname !== "home") {
      return new Response("Not found", { status: 404 });
    }

    return new Response(renderHomePage(), {
      headers: {
        "content-type": "text/html; charset=utf-8"
      }
    });
  });
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    title: APP_NAME,
    backgroundColor: "#f6f7f9",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  tabs = new OverthinkTabs(mainWindow);
  registerIpcHandlers({
    mainWindow,
    tabs,
    storage: new OverthinkStorage()
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.webContents.once("did-finish-load", () => {
    void tabs?.createTab(DEFAULT_HOME_URL);
  });

  mainWindow.on("closed", () => {
    tabs?.destroy();
    tabs = null;
    mainWindow = null;
  });

  if (isDev) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL ?? "http://localhost:5173");
  } else {
    await mainWindow.loadFile(path.join(__dirname, "../dist-renderer/index.html"));
  }
}

app.whenReady().then(async () => {
  app.setName(APP_NAME);
  registerAppProtocol();
  Menu.setApplicationMenu(null);
  await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
