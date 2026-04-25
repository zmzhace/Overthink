import type {
  BrowserBounds,
  DebuggerCommandRequest,
  ExecuteJavaScriptRequest,
  HomeAgentPromptEvent,
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
  ExtensionInstallRequest,
  ExtensionRecord,
  ImportSummary,
  ModelSettingsState,
  ModelTestRequest,
  ModelTestResult,
  OverthinkTask,
  PageBrief,
  RecallItem,
  RecallSearchRequest,
  ResearchEvent,
  ResearchRequest,
  SkillInstallRequest,
  SkillMarketplaceSource,
  SkillMarketplaceState,
  SkillRecord
} from "./overthink";

export interface OverthinkBridge {
  window: {
    minimize: () => Promise<void>;
    toggleMaximize: () => Promise<void>;
    close: () => Promise<void>;
  };
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
  tasks: {
    list: () => Promise<OverthinkTask[]>;
    get: (taskId: string) => Promise<OverthinkTask | null>;
    approve: (taskId: string, approvalId: string) => Promise<OverthinkTask | null>;
    reject: (taskId: string, approvalId: string) => Promise<OverthinkTask | null>;
  };
  research: {
    start: (request: ResearchRequest) => Promise<string>;
    stop: (researchId: string) => Promise<void>;
    onEvent: (callback: (event: ResearchEvent) => void) => () => void;
  };
  recall: {
    search: (request: RecallSearchRequest) => Promise<RecallItem[]>;
  };
  extensions: {
    install: (request?: ExtensionInstallRequest) => Promise<ExtensionRecord | null>;
    list: () => Promise<ExtensionRecord[]>;
    setEnabled: (extensionId: string, enabled: boolean) => Promise<ExtensionRecord[]>;
    remove: (extensionId: string) => Promise<ExtensionRecord[]>;
  };
  skills: {
    listMarketplace: () => Promise<SkillMarketplaceState>;
    listInstalled: () => Promise<SkillRecord[]>;
    install: (request: SkillInstallRequest) => Promise<SkillRecord>;
    setEnabled: (skillId: string, enabled: boolean) => Promise<SkillRecord[]>;
    remove: (skillId: string) => Promise<SkillRecord[]>;
    refreshSources: () => Promise<SkillMarketplaceState>;
    saveSources: (sources: SkillMarketplaceSource[]) => Promise<SkillMarketplaceState>;
  };
  data: {
    exportAll: () => Promise<ImportSummary>;
    importAll: () => Promise<ImportSummary>;
  };
  home: {
    onAgentPrompt: (callback: (event: HomeAgentPromptEvent) => void) => () => void;
  };
}

declare global {
  interface Window {
    overthink: OverthinkBridge;
  }
}
