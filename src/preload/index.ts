import { contextBridge, ipcRenderer } from "electron";

import type { OverthinkBridge } from "@/shared/bridge";
import { IPC_CHANNELS } from "@/shared/ipc";
import type { TabsSnapshot } from "@/shared/ipc";
import type { AgentStepEvent, ChatStreamEvent } from "@/shared/overthink";

const bridge: OverthinkBridge = {
  tabs: {
    getState: () => ipcRenderer.invoke(IPC_CHANNELS.tabsGetState),
    create: (url) => ipcRenderer.invoke(IPC_CHANNELS.tabsCreate, url),
    activate: (tabId) => ipcRenderer.invoke(IPC_CHANNELS.tabsActivate, tabId),
    close: (tabId) => ipcRenderer.invoke(IPC_CHANNELS.tabsClose, tabId),
    navigate: (tabId, input) => ipcRenderer.invoke(IPC_CHANNELS.tabsNavigate, tabId, input),
    goBack: (tabId) => ipcRenderer.invoke(IPC_CHANNELS.tabsGoBack, tabId),
    goForward: (tabId) => ipcRenderer.invoke(IPC_CHANNELS.tabsGoForward, tabId),
    reload: (tabId) => ipcRenderer.invoke(IPC_CHANNELS.tabsReload, tabId),
    home: (tabId) => ipcRenderer.invoke(IPC_CHANNELS.tabsHome, tabId),
    onState: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, snapshot: TabsSnapshot) => callback(snapshot);
      ipcRenderer.on(IPC_CHANNELS.tabsState, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.tabsState, listener);
    }
  },
  browser: {
    setBounds: (bounds) => ipcRenderer.invoke(IPC_CHANNELS.browserSetBounds, bounds),
    captureActiveTab: () => ipcRenderer.invoke(IPC_CHANNELS.browserCaptureActiveTab),
    executeJavaScript: (request) => ipcRenderer.invoke(IPC_CHANNELS.browserExecuteJavaScript, request),
    sendDebuggerCommand: (request) => ipcRenderer.invoke(IPC_CHANNELS.browserSendDebuggerCommand, request),
    getFrames: (tabId) => ipcRenderer.invoke(IPC_CHANNELS.browserGetFrames, tabId)
  },
  page: {
    captureBrief: (tabId) => ipcRenderer.invoke(IPC_CHANNELS.pageCaptureBrief, tabId)
  },
  debugger: {
    click: (request) => ipcRenderer.invoke(IPC_CHANNELS.debuggerClick, request),
    type: (request) => ipcRenderer.invoke(IPC_CHANNELS.debuggerType, request),
    scroll: (request) => ipcRenderer.invoke(IPC_CHANNELS.debuggerScroll, request),
    key: (request) => ipcRenderer.invoke(IPC_CHANNELS.debuggerKey, request)
  },
  storage: {
    get: (area, keys) => ipcRenderer.invoke(IPC_CHANNELS.storageGet, area, keys),
    set: (area, values) => ipcRenderer.invoke(IPC_CHANNELS.storageSet, area, values),
    remove: (area, keys) => ipcRenderer.invoke(IPC_CHANNELS.storageRemove, area, keys),
    clear: (area) => ipcRenderer.invoke(IPC_CHANNELS.storageClear, area)
  },
  models: {
    getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.modelsGetSettings),
    saveSettings: (settings) => ipcRenderer.invoke(IPC_CHANNELS.modelsSaveSettings, settings),
    test: (request) => ipcRenderer.invoke(IPC_CHANNELS.modelsTest, request)
  },
  chat: {
    start: (request) => ipcRenderer.invoke(IPC_CHANNELS.chatStart, request),
    stop: (streamId) => ipcRenderer.invoke(IPC_CHANNELS.chatStop, streamId),
    onEvent: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, streamEvent: ChatStreamEvent) => callback(streamEvent);
      ipcRenderer.on(IPC_CHANNELS.chatEvent, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.chatEvent, listener);
    }
  },
  documents: {
    extract: () => ipcRenderer.invoke(IPC_CHANNELS.documentExtract)
  },
  agent: {
    start: (request) => ipcRenderer.invoke(IPC_CHANNELS.agentStart, request),
    stop: (taskId) => ipcRenderer.invoke(IPC_CHANNELS.agentStop, taskId),
    onEvent: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, agentEvent: AgentStepEvent) => callback(agentEvent);
      ipcRenderer.on(IPC_CHANNELS.agentEvent, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.agentEvent, listener);
    }
  },
  data: {
    exportAll: () => ipcRenderer.invoke(IPC_CHANNELS.dataExport),
    importAll: () => ipcRenderer.invoke(IPC_CHANNELS.dataImport)
  }
};

contextBridge.exposeInMainWorld("overthink", bridge);
