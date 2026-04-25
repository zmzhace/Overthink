import type {
  BrowserBounds,
  DebuggerCommandRequest,
  ExecuteJavaScriptRequest,
  StorageArea,
  TabsSnapshot
} from "./ipc";
import type {
  AgentStepEvent,
  AgentTaskRequest,
  ChatStreamEvent,
  ChatStreamRequest,
  DebuggerClickRequest,
  DebuggerKeyRequest,
  DebuggerScrollRequest,
  DebuggerTypeRequest,
  DocumentExtraction,
  ImportSummary,
  ModelSettingsState,
  ModelTestRequest,
  ModelTestResult,
  PageBrief
} from "./overthink";

export interface OverthinkBridge {
  tabs: {
    getState: () => Promise<TabsSnapshot>;
    create: (url?: string) => Promise<TabsSnapshot>;
    activate: (tabId: number) => Promise<TabsSnapshot>;
    close: (tabId: number) => Promise<TabsSnapshot>;
    navigate: (tabId: number, input: string) => Promise<TabsSnapshot>;
    goBack: (tabId: number) => Promise<TabsSnapshot>;
    goForward: (tabId: number) => Promise<TabsSnapshot>;
    reload: (tabId: number) => Promise<TabsSnapshot>;
    home: (tabId: number) => Promise<TabsSnapshot>;
    onState: (callback: (snapshot: TabsSnapshot) => void) => () => void;
  };
  browser: {
    setBounds: (bounds: BrowserBounds) => Promise<void>;
    captureActiveTab: () => Promise<string | null>;
    executeJavaScript: <T = unknown>(request: ExecuteJavaScriptRequest) => Promise<T>;
    sendDebuggerCommand: <T = unknown>(request: DebuggerCommandRequest) => Promise<T>;
    getFrames: (tabId?: number) => Promise<Array<{ frameId: number; url: string; name: string }>>;
  };
  page: {
    captureBrief: (tabId?: number) => Promise<PageBrief>;
  };
  debugger: {
    click: (request: DebuggerClickRequest) => Promise<void>;
    type: (request: DebuggerTypeRequest) => Promise<void>;
    scroll: (request: DebuggerScrollRequest) => Promise<void>;
    key: (request: DebuggerKeyRequest) => Promise<void>;
  };
  storage: {
    get: <T = Record<string, unknown>>(area: StorageArea, keys?: string | string[]) => Promise<T>;
    set: (area: StorageArea, values: Record<string, unknown>) => Promise<void>;
    remove: (area: StorageArea, keys: string | string[]) => Promise<void>;
    clear: (area: StorageArea) => Promise<void>;
  };
  models: {
    getSettings: () => Promise<ModelSettingsState>;
    saveSettings: (settings: ModelSettingsState) => Promise<ModelSettingsState>;
    test: (request: ModelTestRequest) => Promise<ModelTestResult>;
  };
  chat: {
    start: (request: ChatStreamRequest) => Promise<string>;
    stop: (streamId: string) => Promise<void>;
    onEvent: (callback: (event: ChatStreamEvent) => void) => () => void;
  };
  documents: {
    extract: () => Promise<DocumentExtraction | null>;
  };
  agent: {
    start: (request: AgentTaskRequest) => Promise<string>;
    stop: (taskId: string) => Promise<void>;
    onEvent: (callback: (event: AgentStepEvent) => void) => () => void;
  };
  data: {
    exportAll: () => Promise<ImportSummary>;
    importAll: () => Promise<ImportSummary>;
  };
}

declare global {
  interface Window {
    overthink: OverthinkBridge;
  }
}
