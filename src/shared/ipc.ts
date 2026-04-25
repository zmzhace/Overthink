import type { Rectangle } from "electron";

export const IPC_CHANNELS = {
  tabsState: "overthink:tabs:state",
  tabsGetState: "overthink:tabs:get-state",
  tabsCreate: "overthink:tabs:create",
  tabsActivate: "overthink:tabs:activate",
  tabsClose: "overthink:tabs:close",
  tabsNavigate: "overthink:tabs:navigate",
  tabsGoBack: "overthink:tabs:go-back",
  tabsGoForward: "overthink:tabs:go-forward",
  tabsReload: "overthink:tabs:reload",
  tabsHome: "overthink:tabs:home",
  homeAgentPrompt: "overthink:home:agent-prompt",
  windowMinimize: "overthink:window:minimize",
  windowToggleMaximize: "overthink:window:toggle-maximize",
  windowClose: "overthink:window:close",
  browserSetBounds: "overthink:browser:set-bounds",
  browserCaptureActiveTab: "overthink:browser:capture-active-tab",
  browserExecuteJavaScript: "overthink:browser:execute-javascript",
  browserSendDebuggerCommand: "overthink:browser:send-debugger-command",
  browserGetFrames: "overthink:browser:get-frames",
  pageCaptureBrief: "overthink:page:capture-brief",
  debuggerClick: "overthink:debugger:click",
  debuggerType: "overthink:debugger:type",
  debuggerScroll: "overthink:debugger:scroll",
  debuggerKey: "overthink:debugger:key",
  storageGet: "overthink:storage:get",
  storageSet: "overthink:storage:set",
  storageRemove: "overthink:storage:remove",
  storageClear: "overthink:storage:clear",
  modelsGetSettings: "overthink:models:get-settings",
  modelsSaveSettings: "overthink:models:save-settings",
  modelsTest: "overthink:models:test",
  chatStart: "overthink:chat:start",
  chatStop: "overthink:chat:stop",
  chatEvent: "overthink:chat:event",
  documentExtract: "overthink:document:extract",
  agentStart: "overthink:agent:start",
  agentStop: "overthink:agent:stop",
  agentEvent: "overthink:agent:event",
  tasksList: "overthink:tasks:list",
  tasksGet: "overthink:tasks:get",
  tasksApprove: "overthink:tasks:approve",
  tasksReject: "overthink:tasks:reject",
  researchStart: "overthink:research:start",
  researchStop: "overthink:research:stop",
  researchEvent: "overthink:research:event",
  recallSearch: "overthink:recall:search",
  extensionsInstall: "overthink:extensions:install",
  extensionsList: "overthink:extensions:list",
  extensionsSetEnabled: "overthink:extensions:set-enabled",
  extensionsRemove: "overthink:extensions:remove",
  skillsListMarketplace: "overthink:skills:list-marketplace",
  skillsListInstalled: "overthink:skills:list-installed",
  skillsInstall: "overthink:skills:install",
  skillsSetEnabled: "overthink:skills:set-enabled",
  skillsRemove: "overthink:skills:remove",
  skillsRefreshSources: "overthink:skills:refresh-sources",
  skillsSaveSources: "overthink:skills:save-sources",
  dataExport: "overthink:data:export",
  dataImport: "overthink:data:import"
} as const;

export type StorageArea = "local" | "session";

export interface BrowserTabState {
  id: number;
  title: string;
  url: string;
  favicon?: string;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
}

export interface TabsSnapshot {
  activeTabId: number | null;
  tabs: BrowserTabState[];
}

export type BrowserBounds = Pick<Rectangle, "x" | "y" | "width" | "height">;

export interface HomeAgentPromptEvent {
  tabId: number;
  prompt: string;
}

export interface DebuggerCommandRequest {
  tabId?: number;
  method: string;
  params?: Record<string, unknown>;
  detachAfterCommand?: boolean;
}

export interface ExecuteJavaScriptRequest {
  tabId?: number;
  code: string;
  userGesture?: boolean;
}
