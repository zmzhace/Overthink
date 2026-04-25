import { spawn } from "node:child_process";
import electronPath from "electron";
import { build, createServer, mergeConfig } from "vite";

import electronConfig from "../vite.electron.config.mjs";
import rendererConfig from "../vite.renderer.config.mjs";

let electronProcess = null;
let isShuttingDown = false;

const rendererServer = await createServer(rendererConfig);
await rendererServer.listen();
rendererServer.printUrls();

const electronWatcher = await build(
  mergeConfig(electronConfig, {
    build: {
      watch: {}
    }
  })
);

const waitForFirstElectronBuild = new Promise((resolve, reject) => {
  let hasBuilt = false;

  electronWatcher.on("event", (event) => {
    if (event.code === "ERROR") {
      reject(event.error);
      return;
    }

    if (event.code !== "END") {
      return;
    }

    if (!hasBuilt) {
      hasBuilt = true;
      resolve();
      return;
    }

    restartElectron();
  });
});

await waitForFirstElectronBuild;
startElectron();

function startElectron() {
  const devServerUrl = rendererServer.resolvedUrls?.local[0] ?? "http://localhost:5173/";
  const electronArgs = ["."];

  if (process.platform === "linux" && process.getuid?.() === 0) {
    electronArgs.unshift("--disable-gpu", "--no-sandbox");
  }

  electronProcess = spawn(electronPath, electronArgs, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: devServerUrl
    },
    stdio: "inherit"
  });

  electronProcess.on("exit", () => {
    electronProcess = null;
    if (!isShuttingDown) {
      process.exitCode = 0;
    }
  });
}

function restartElectron() {
  if (!electronProcess) {
    startElectron();
    return;
  }

  electronProcess.once("exit", startElectron);
  electronProcess.kill();
}

async function shutdown() {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  electronProcess?.kill();
  electronWatcher.close();
  await rendererServer.close();
}

process.once("SIGINT", () => {
  void shutdown().finally(() => process.exit(0));
});

process.once("SIGTERM", () => {
  void shutdown().finally(() => process.exit(0));
});
