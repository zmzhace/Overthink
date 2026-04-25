import { BrowserWindow, ipcMain } from "electron";

import { IPC_CHANNELS } from "@/shared/ipc";

import { OverthinkAgentRuntime } from "./overthink-agent-runtime";
import { OverthinkDataService } from "./overthink-data-service";
import { OverthinkDocumentExtractor } from "./overthink-document-extractor";
import { OverthinkModelService } from "./overthink-model-service";
import type { OverthinkStorage } from "./overthink-storage";
import type { OverthinkTabs } from "./overthink-tabs";

interface RegisterIpcHandlersOptions {
  mainWindow: BrowserWindow;
  tabs: OverthinkTabs;
  storage: OverthinkStorage;
}

export function registerIpcHandlers({ mainWindow, tabs, storage }: RegisterIpcHandlersOptions): void {
  const modelService = new OverthinkModelService(storage);
  const documentExtractor = new OverthinkDocumentExtractor(mainWindow);
  const dataService = new OverthinkDataService(mainWindow, storage);
  const agentRuntime = new OverthinkAgentRuntime(tabs);

  ipcMain.handle(IPC_CHANNELS.tabsGetState, () => tabs.getSnapshot());
  ipcMain.handle(IPC_CHANNELS.tabsCreate, (_event, url?: string) => tabs.createTab(url));
  ipcMain.handle(IPC_CHANNELS.tabsActivate, (_event, tabId: number) => tabs.activateTab(tabId));
  ipcMain.handle(IPC_CHANNELS.tabsClose, (_event, tabId: number) => tabs.closeTab(tabId));
  ipcMain.handle(IPC_CHANNELS.tabsNavigate, (_event, tabId: number, input: string) => tabs.navigate(tabId, input));
  ipcMain.handle(IPC_CHANNELS.tabsGoBack, (_event, tabId: number) => tabs.goBack(tabId));
  ipcMain.handle(IPC_CHANNELS.tabsGoForward, (_event, tabId: number) => tabs.goForward(tabId));
  ipcMain.handle(IPC_CHANNELS.tabsReload, (_event, tabId: number) => tabs.reload(tabId));
  ipcMain.handle(IPC_CHANNELS.tabsHome, (_event, tabId: number) => tabs.home(tabId));

  ipcMain.handle(IPC_CHANNELS.browserSetBounds, (_event, bounds) => {
    tabs.setBounds(bounds);
  });
  ipcMain.handle(IPC_CHANNELS.browserCaptureActiveTab, () => tabs.captureActiveTab());
  ipcMain.handle(IPC_CHANNELS.browserExecuteJavaScript, (_event, request) =>
    tabs.executeJavaScript(request.tabId, request.code, request.userGesture)
  );
  ipcMain.handle(IPC_CHANNELS.browserSendDebuggerCommand, (_event, request) =>
    tabs.sendDebuggerCommand(request.tabId, request.method, request.params, request.detachAfterCommand)
  );
  ipcMain.handle(IPC_CHANNELS.browserGetFrames, (_event, tabId?: number) => tabs.getFrames(tabId));
  ipcMain.handle(IPC_CHANNELS.pageCaptureBrief, (_event, tabId?: number) => tabs.capturePageBrief(tabId));
  ipcMain.handle(IPC_CHANNELS.debuggerClick, (_event, request) =>
    tabs.debuggerClick(request.tabId, request.x, request.y)
  );
  ipcMain.handle(IPC_CHANNELS.debuggerType, (_event, request) => tabs.debuggerType(request.tabId, request.text));
  ipcMain.handle(IPC_CHANNELS.debuggerScroll, (_event, request) =>
    tabs.debuggerScroll(request.tabId, request.deltaX, request.deltaY, request.x, request.y)
  );
  ipcMain.handle(IPC_CHANNELS.debuggerKey, (_event, request) => tabs.debuggerKey(request.tabId, request.key));

  ipcMain.handle(IPC_CHANNELS.storageGet, (_event, area, keys) => storage.get(area, keys));
  ipcMain.handle(IPC_CHANNELS.storageSet, (_event, area, values) => storage.set(area, values));
  ipcMain.handle(IPC_CHANNELS.storageRemove, (_event, area, keys) => storage.remove(area, keys));
  ipcMain.handle(IPC_CHANNELS.storageClear, (_event, area) => storage.clear(area));

  ipcMain.handle(IPC_CHANNELS.modelsGetSettings, () => modelService.getSettings());
  ipcMain.handle(IPC_CHANNELS.modelsSaveSettings, (_event, settings) => modelService.saveSettings(settings));
  ipcMain.handle(IPC_CHANNELS.modelsTest, (_event, request) => modelService.test(request));
  ipcMain.handle(IPC_CHANNELS.chatStart, (event, request) => modelService.startChat(event.sender, request));
  ipcMain.handle(IPC_CHANNELS.chatStop, (_event, streamId: string) => modelService.stopChat(streamId));
  ipcMain.handle(IPC_CHANNELS.documentExtract, () => documentExtractor.pickAndExtract());
  ipcMain.handle(IPC_CHANNELS.agentStart, (event, request) => agentRuntime.start(event.sender, request));
  ipcMain.handle(IPC_CHANNELS.agentStop, (_event, taskId: string) => agentRuntime.stop(taskId));
  ipcMain.handle(IPC_CHANNELS.dataExport, () => dataService.exportAll());
  ipcMain.handle(IPC_CHANNELS.dataImport, () => dataService.importAll());
}
