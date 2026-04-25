import type { BrowserTabState } from "./ipc";

export interface PageHeading {
  level: number;
  text: string;
}

export interface PageLink {
  text: string;
  href: string;
}

export interface PageFrameBrief {
  frameId: number;
  name: string;
  url: string;
  text: string;
  wordCount: number;
}

export interface PageBrief {
  title: string;
  url: string;
  description: string;
  excerpt: string;
  selectedText: string;
  headings: PageHeading[];
  links: PageLink[];
  frames: PageFrameBrief[];
  wordCount: number;
  capturedAt: string;
}

export type ModelProviderKind = "openai-compatible";

export interface ModelProviderConfig {
  id: string;
  name: string;
  kind: ModelProviderKind;
  baseUrl: string;
  apiKey: string;
  chatModel: string;
  visionModel: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ModelSettingsState {
  providers: ModelProviderConfig[];
  activeProviderId: string | null;
  activeVisionProviderId: string | null;
}

export type ModelProviderDraft = Pick<
  ModelProviderConfig,
  "id" | "name" | "kind" | "baseUrl" | "apiKey" | "chatModel" | "visionModel" | "enabled"
>;

export interface ModelTestRequest {
  provider: ModelProviderDraft;
  mode: "chat" | "vision";
}

export interface ModelTestResult {
  ok: boolean;
  status: number | null;
  message: string;
  latencyMs: number;
}

export type ThinkMessageRole = "system" | "user" | "assistant";

export interface ThinkMessage {
  id: string;
  role: ThinkMessageRole;
  content: string;
  createdAt: string;
}

export interface ThinkChatSession {
  id: string;
  title: string;
  messages: ThinkMessage[];
  pageUrl?: string;
  updatedAt: string;
}

export interface ChatContext {
  pageBrief?: PageBrief | null;
  screenshotDataUrl?: string | null;
  documents?: DocumentExtraction[];
}

export interface ChatStreamRequest {
  sessionId: string;
  providerId?: string | null;
  messages: Array<Pick<ThinkMessage, "role" | "content">>;
  context?: ChatContext;
}

export interface ChatStreamEvent {
  streamId: string;
  type: "start" | "delta" | "complete" | "error" | "stopped";
  delta?: string;
  message?: string;
}

export interface DocumentExtraction {
  id: string;
  name: string;
  path: string;
  kind: "text" | "pdf" | "ocr";
  text: string;
  wordCount: number;
  warnings: string[];
  extractedAt: string;
}

export interface DebuggerClickRequest {
  tabId?: number;
  x: number;
  y: number;
}

export interface DebuggerTypeRequest {
  tabId?: number;
  text: string;
}

export interface DebuggerScrollRequest {
  tabId?: number;
  deltaX?: number;
  deltaY?: number;
  x?: number;
  y?: number;
}

export interface DebuggerKeyRequest {
  tabId?: number;
  key: string;
}

export interface AgentTaskRequest {
  objective: string;
  tabId?: number;
}

export interface AgentStepEvent {
  taskId: string;
  type: "start" | "step" | "complete" | "error" | "stopped";
  title: string;
  detail?: string;
  tab?: BrowserTabState | null;
}

export interface RecallItem {
  id: string;
  text: string;
  source: "manual" | "page" | "import";
  url?: string;
  enabled: boolean;
  createdAt: string;
}

export interface ImportExportPayload {
  schemaVersion: 1;
  exportedAt: string;
  modelSettings: ModelSettingsState;
  thinkChatSessions: ThinkChatSession[];
  recallItems: RecallItem[];
}

export interface ImportSummary {
  imported: boolean;
  modelProviders: number;
  chatSessions: number;
  recallItems: number;
  message: string;
}
