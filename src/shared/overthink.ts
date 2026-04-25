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

export type SearchProviderKind = "brave" | "tavily" | "serpapi" | "generic";

export interface SearchProviderConfig {
  id: string;
  name: string;
  kind: SearchProviderKind;
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ModelSettingsState {
  providers: ModelProviderConfig[];
  activeProviderId: string | null;
  activeVisionProviderId: string | null;
  searchProviders: SearchProviderConfig[];
  activeSearchProviderId: string | null;
}

export type ModelProviderDraft = Pick<
  ModelProviderConfig,
  "id" | "name" | "kind" | "baseUrl" | "apiKey" | "chatModel" | "visionModel" | "enabled"
>;

export type SearchProviderDraft = Pick<
  SearchProviderConfig,
  "id" | "name" | "kind" | "baseUrl" | "apiKey" | "enabled"
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

export type ToolCallName =
  | "read_page"
  | "capture_screenshot"
  | "search_web"
  | "open_url"
  | "extract_links"
  | "click"
  | "type"
  | "scroll"
  | "press_key"
  | "wait_for_page"
  | "attach_document"
  | "recall_search";

export type ToolRiskLevel = "low" | "medium" | "high";

export interface ToolCallRequest {
  id: string;
  name: ToolCallName;
  args: Record<string, unknown>;
  risk: ToolRiskLevel;
  reason: string;
}

export interface ToolCallResult {
  id: string;
  callId: string;
  name: ToolCallName;
  ok: boolean;
  summary: string;
  data?: unknown;
  error?: string;
  createdAt: string;
}

export type ApprovalStatus = "pending" | "approved" | "rejected" | "auto_approved";

export interface ApprovalRequest {
  id: string;
  taskId: string;
  title: string;
  detail: string;
  risk: ToolRiskLevel;
  actions: ToolCallRequest[];
  status: ApprovalStatus;
  createdAt: string;
  decidedAt?: string;
  autoReason?: string;
}

export type TaskStatus = "queued" | "running" | "awaiting_approval" | "paused" | "completed" | "error" | "stopped";

export interface OverthinkTaskStep {
  id: string;
  type: "thought" | "tool" | "approval" | "result" | "error";
  title: string;
  detail: string;
  createdAt: string;
}

export interface OverthinkTask {
  id: string;
  objective: string;
  status: TaskStatus;
  tabId?: number;
  pageUrl?: string;
  pageTitle?: string;
  steps: OverthinkTaskStep[];
  approvals: ApprovalRequest[];
  toolResults: ToolCallResult[];
  finalAnswer?: string;
  error?: string;
  syncState: "local" | "pending" | "synced";
  createdAt: string;
  updatedAt: string;
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
  type: "start" | "step" | "approval" | "complete" | "error" | "stopped";
  title: string;
  detail?: string;
  tab?: BrowserTabState | null;
  task?: OverthinkTask;
  approval?: ApprovalRequest;
}

export interface RecallItem {
  id: string;
  text: string;
  source: "manual" | "page" | "import";
  url?: string;
  enabled: boolean;
  createdAt: string;
}

export interface ResearchSource {
  id: string;
  title: string;
  url: string;
  excerpt: string;
  capturedAt: string;
  provider: "search-api" | "browser" | "page" | "manual";
}

export interface Citation {
  id: string;
  claim: string;
  sourceId: string;
  sourceUrl: string;
  title: string;
  excerpt: string;
  capturedAt: string;
}

export interface DeepDiveRecord {
  id: string;
  query: string;
  result: string;
  sources: ResearchSource[];
  citations: Citation[];
  createdAt: string;
}

export interface ResearchRequest {
  query: string;
  tabId?: number;
  pageBrief?: PageBrief | null;
  documents?: DocumentExtraction[];
}

export interface ResearchEvent {
  researchId: string;
  type: "start" | "source" | "delta" | "complete" | "error" | "stopped";
  delta?: string;
  message?: string;
  source?: ResearchSource;
  record?: DeepDiveRecord;
}

export interface RecallSearchRequest {
  query: string;
  limit?: number;
}

export interface ExtensionRecord {
  id: string;
  name: string;
  version: string;
  path: string;
  enabled: boolean;
  permissions: string[];
  warnings: string[];
  loadedAt?: string;
  createdAt: string;
  updatedAt: string;
  syncState: "local" | "pending" | "synced";
}

export interface ExtensionInstallRequest {
  path?: string;
}

export interface ImportExportPayload {
  schemaVersion: 1 | 2;
  exportedAt: string;
  modelSettings: ModelSettingsState;
  thinkChatSessions: ThinkChatSession[];
  recallItems: RecallItem[];
  deepDiveHistory?: DeepDiveRecord[];
  tasks?: OverthinkTask[];
  extensions?: ExtensionRecord[];
  syncState?: "local" | "pending" | "synced";
}

export interface ImportSummary {
  imported: boolean;
  modelProviders: number;
  chatSessions: number;
  recallItems: number;
  deepDives: number;
  tasks: number;
  extensions: number;
  message: string;
}
