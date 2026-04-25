import {
  AlertTriangle,
  BookOpenText,
  Camera,
  CheckCircle2,
  ClipboardList,
  Database,
  Download,
  FileText,
  History,
  MessageSquareText,
  Play,
  Plus,
  RotateCcw,
  Save,
  Search,
  SendHorizontal,
  Settings,
  Puzzle,
  Square,
  Trash2,
  Upload
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import type { BrowserTabState } from "@/shared/ipc";
import type {
  AgentStepEvent,
  DeepDiveRecord,
  DocumentExtraction,
  ExtensionRecord,
  ImportSummary,
  ModelProviderConfig,
  ModelProviderDraft,
  ModelSettingsState,
  ModelTestResult,
  OverthinkTask,
  PageBrief,
  RecallItem,
  SearchProviderConfig,
  SearchProviderDraft,
  ThinkChatSession,
  ThinkMessage
} from "@/shared/overthink";

interface OverthinkSidePanelProps {
  activeTab: BrowserTabState | null;
}

type PanelTab = "chat" | "agent" | "dive" | "recall" | "tasks" | "extensions" | "models" | "data";
type BusyState = "idle" | "brief" | "shot" | "doc" | "chat" | "dive" | "model";

const CHAT_KEY = "thinkChatSessions";
const RECALL_KEY = "recallItems";
const DEEP_DIVE_KEY = "deepDiveHistory";

const PANEL_TABS: Array<{ id: PanelTab; icon: LucideIcon; label: string }> = [
  { id: "chat", icon: MessageSquareText, label: "Think Chat" },
  { id: "agent", icon: Play, label: "Agent" },
  { id: "dive", icon: Search, label: "Deep Dive" },
  { id: "recall", icon: Database, label: "Recall" },
  { id: "tasks", icon: ClipboardList, label: "Tasks" },
  { id: "extensions", icon: Puzzle, label: "Extensions" },
  { id: "models", icon: Settings, label: "Models" },
  { id: "data", icon: Upload, label: "Data" }
];

const emptySettings = (): ModelSettingsState => ({
  providers: [],
  activeProviderId: null,
  activeVisionProviderId: null,
  searchProviders: [],
  activeSearchProviderId: null
});

function makeId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function compactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "overthink:" ? parsed.href : parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}...`;
}

function blankProviderDraft(): ModelProviderDraft {
  return {
    id: makeId(),
    name: "",
    kind: "openai-compatible",
    baseUrl: "",
    apiKey: "",
    chatModel: "",
    visionModel: "",
    enabled: true
  };
}

function providerToDraft(provider: ModelProviderConfig | null): ModelProviderDraft {
  if (!provider) {
    return blankProviderDraft();
  }

  return {
    id: provider.id,
    name: provider.name,
    kind: provider.kind,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    chatModel: provider.chatModel,
    visionModel: provider.visionModel,
    enabled: provider.enabled
  };
}

function draftToProvider(draft: ModelProviderDraft, existing?: ModelProviderConfig): ModelProviderConfig {
  const now = nowIso();
  return {
    id: draft.id || makeId(),
    name: draft.name.trim() || "OpenAI-compatible",
    kind: "openai-compatible",
    baseUrl: draft.baseUrl.trim(),
    apiKey: draft.apiKey.trim(),
    chatModel: draft.chatModel.trim(),
    visionModel: draft.visionModel.trim(),
    enabled: draft.enabled,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };
}

function blankSearchProviderDraft(): SearchProviderDraft {
  return {
    id: makeId(),
    name: "",
    kind: "brave",
    baseUrl: "",
    apiKey: "",
    enabled: true
  };
}

function searchProviderToDraft(provider: SearchProviderConfig | null): SearchProviderDraft {
  if (!provider) {
    return blankSearchProviderDraft();
  }

  return {
    id: provider.id,
    name: provider.name,
    kind: provider.kind,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    enabled: provider.enabled
  };
}

function draftToSearchProvider(draft: SearchProviderDraft, existing?: SearchProviderConfig): SearchProviderConfig {
  const now = nowIso();
  return {
    id: draft.id || makeId(),
    name: draft.name.trim() || "Search provider",
    kind: draft.kind,
    baseUrl: draft.baseUrl.trim(),
    apiKey: draft.apiKey.trim(),
    enabled: draft.enabled,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };
}

function createMessage(role: ThinkMessage["role"], content: string): ThinkMessage {
  return {
    id: makeId(),
    role,
    content,
    createdAt: nowIso()
  };
}

function importSummaryLine(summary: ImportSummary): string {
  return `${summary.message} Models ${summary.modelProviders}, chats ${summary.chatSessions}, recall ${summary.recallItems}, research ${summary.deepDives}, tasks ${summary.tasks}, extensions ${summary.extensions}.`;
}

export function OverthinkSidePanel({ activeTab }: OverthinkSidePanelProps) {
  const [selectedTab, setSelectedTab] = useState<PanelTab>("chat");
  const [busy, setBusy] = useState<BusyState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [settings, setSettings] = useState<ModelSettingsState>(emptySettings);
  const [providerDraft, setProviderDraft] = useState<ModelProviderDraft>(blankProviderDraft);
  const [searchProviderDraft, setSearchProviderDraft] = useState<SearchProviderDraft>(blankSearchProviderDraft);
  const [modelTest, setModelTest] = useState<ModelTestResult | null>(null);
  const [pageBrief, setPageBrief] = useState<PageBrief | null>(null);
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | null>(null);
  const [documents, setDocuments] = useState<DocumentExtraction[]>([]);
  const [sessions, setSessions] = useState<ThinkChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState(makeId);
  const [messages, setMessages] = useState<ThinkMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [activeChatStreamId, setActiveChatStreamId] = useState<string | null>(null);
  const [agentObjective, setAgentObjective] = useState("");
  const [agentSteps, setAgentSteps] = useState<AgentStepEvent[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [clickX, setClickX] = useState("120");
  const [clickY, setClickY] = useState("120");
  const [typeText, setTypeText] = useState("");
  const [deepQuery, setDeepQuery] = useState("");
  const [deepOutput, setDeepOutput] = useState("");
  const [deepHistory, setDeepHistory] = useState<DeepDiveRecord[]>([]);
  const [recallItems, setRecallItems] = useState<RecallItem[]>([]);
  const [recallDraft, setRecallDraft] = useState("");
  const [recallQuery, setRecallQuery] = useState("");
  const [tasks, setTasks] = useState<OverthinkTask[]>([]);
  const [extensions, setExtensions] = useState<ExtensionRecord[]>([]);

  const messagesRef = useRef<ThinkMessage[]>([]);
  const sessionsRef = useRef<ThinkChatSession[]>([]);
  const currentSessionIdRef = useRef(currentSessionId);
  const activeTabRef = useRef<BrowserTabState | null>(activeTab);
  const pendingAssistantIdRef = useRef<string | null>(null);
  const activeChatStreamRef = useRef<string | null>(null);
  const activeDeepStreamRef = useRef<string | null>(null);
  const deepOutputRef = useRef("");
  const deepQueryRef = useRef(deepQuery);
  const deepHistoryRef = useRef<DeepDiveRecord[]>([]);
  const activeTaskRef = useRef<string | null>(null);

  const activeProvider = useMemo(
    () => settings.providers.find((provider) => provider.id === settings.activeProviderId) ?? null,
    [settings.activeProviderId, settings.providers]
  );
  const hasModelConfig = Boolean(activeProvider?.enabled && activeProvider.baseUrl && activeProvider.chatModel);
  const isBusy = busy !== "idle";
  const contextUrl = compactUrl(activeTab?.url ?? "");

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    deepQueryRef.current = deepQuery;
  }, [deepQuery]);

  useEffect(() => {
    deepHistoryRef.current = deepHistory;
  }, [deepHistory]);

  useEffect(() => {
    activeChatStreamRef.current = activeChatStreamId;
  }, [activeChatStreamId]);

  useEffect(() => {
    activeTaskRef.current = activeTaskId;
  }, [activeTaskId]);

  useEffect(() => {
    void loadState();
  }, []);

  useEffect(() => {
    const openSection = (event: Event) => {
      const detail = (event as CustomEvent<PanelTab>).detail;
      if (["chat", "agent", "dive", "recall", "tasks", "extensions", "models", "data"].includes(detail)) {
        setSelectedTab(detail);
      }
    };

    window.addEventListener("overthink:open-section", openSection);
    return () => window.removeEventListener("overthink:open-section", openSection);
  }, []);

  useEffect(() => {
    if (!settings.providers.length) {
      setSelectedTab("models");
    }
  }, [settings.providers.length]);

  useEffect(() => {
    setPageBrief(null);
    setScreenshotDataUrl(null);
    setDocuments([]);
  }, [activeTab?.id]);

  useEffect(() => {
    const unsubscribe = window.overthink.chat.onEvent((event) => {
      if (event.streamId === activeChatStreamRef.current) {
        handleChatEvent(event.type, event.delta, event.message);
      }
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = window.overthink.research.onEvent((event) => {
      if (event.researchId === activeDeepStreamRef.current) {
        handleDeepEvent(event.type, event.delta, event.message, event.record);
      }
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = window.overthink.agent.onEvent((event) => {
      if (event.taskId !== activeTaskRef.current) {
        return;
      }

      setAgentSteps((items) => [...items, event]);
      if (event.task) {
        setTasks((items) => [event.task as OverthinkTask, ...items.filter((item) => item.id !== event.task?.id)]);
      }
      if (["complete", "error", "stopped"].includes(event.type)) {
        setActiveTaskId(null);
        activeTaskRef.current = null;
      }
    });

    return unsubscribe;
  }, []);

  const updateMessages = (updater: (items: ThinkMessage[]) => ThinkMessage[]) => {
    setMessages((items) => {
      const next = updater(items);
      messagesRef.current = next;
      return next;
    });
  };

  const loadState = async () => {
    const [nextSettings, stored] = await Promise.all([
      window.overthink.models.getSettings(),
      window.overthink.storage.get<{
        thinkChatSessions?: ThinkChatSession[];
        recallItems?: RecallItem[];
        deepDiveHistory?: DeepDiveRecord[];
      }>("local", [CHAT_KEY, RECALL_KEY, DEEP_DIVE_KEY])
    ]);

    setSettings(nextSettings);
    setProviderDraft(providerToDraft(nextSettings.providers.find((provider) => provider.id === nextSettings.activeProviderId) ?? null));
    setSearchProviderDraft(
      searchProviderToDraft(nextSettings.searchProviders.find((provider) => provider.id === nextSettings.activeSearchProviderId) ?? null)
    );
    setSessions(Array.isArray(stored.thinkChatSessions) ? stored.thinkChatSessions : []);
    setRecallItems(Array.isArray(stored.recallItems) ? stored.recallItems : []);
    setDeepHistory(Array.isArray(stored.deepDiveHistory) ? stored.deepDiveHistory : []);
    setTasks(await window.overthink.tasks.list());
    setExtensions(await window.overthink.extensions.list());
  };

  const saveChatSession = async (nextMessages: ThinkMessage[]) => {
    if (nextMessages.length === 0) {
      return;
    }

    const title = nextMessages.find((message) => message.role === "user")?.content.slice(0, 64) || "Think Chat";
    const session: ThinkChatSession = {
      id: currentSessionIdRef.current,
      title,
      messages: nextMessages,
      pageUrl: activeTabRef.current?.url,
      updatedAt: nowIso()
    };
    const nextSessions = [session, ...sessionsRef.current.filter((item) => item.id !== currentSessionIdRef.current)].slice(
      0,
      20
    );
    sessionsRef.current = nextSessions;
    setSessions(nextSessions);
    await window.overthink.storage.set("local", { [CHAT_KEY]: nextSessions });
  };

  const captureBrief = async () => {
    setBusy("brief");
    setError(null);
    try {
      const brief = await window.overthink.page.captureBrief(activeTab?.id);
      setPageBrief(brief);
      await window.overthink.storage.set("session", { lastPageBrief: brief });
      setNotice(`Page Brief captured: ${brief.title}`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Page Brief failed.");
    } finally {
      setBusy("idle");
    }
  };

  const captureScreenshot = async () => {
    setBusy("shot");
    setError(null);
    try {
      const dataUrl = await window.overthink.browser.captureActiveTab();
      setScreenshotDataUrl(dataUrl);
      setNotice(dataUrl ? "Screenshot captured." : "No active tab to capture.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Screenshot failed.");
    } finally {
      setBusy("idle");
    }
  };

  const attachDocument = async () => {
    setBusy("doc");
    setError(null);
    try {
      const document = await window.overthink.documents.extract();
      if (document) {
        setDocuments((items) => [document, ...items].slice(0, 4));
        setNotice(`Attached ${document.name}.`);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Document Extractor failed.");
    } finally {
      setBusy("idle");
    }
  };

  const startChat = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || activeChatStreamId) {
      return;
    }

    if (!hasModelConfig) {
      setSelectedTab("models");
      setError("Model Settings are required before Think Chat can call a model.");
      return;
    }

    const userMessage = createMessage("user", content);
    const assistantMessage = createMessage("assistant", "");
    const requestMessages = [...messagesRef.current, userMessage].map((message) => ({
      role: message.role,
      content: message.content
    }));

    setDraft("");
    setError(null);
    setBusy("chat");
    pendingAssistantIdRef.current = assistantMessage.id;
    updateMessages((items) => [...items, userMessage, assistantMessage]);

    try {
      const streamId = await window.overthink.chat.start({
        sessionId: currentSessionId,
        providerId: settings.activeProviderId,
        messages: requestMessages,
        context: {
          pageBrief,
          screenshotDataUrl,
          documents
        }
      });
      setActiveChatStreamId(streamId);
      activeChatStreamRef.current = streamId;
    } catch (nextError) {
      pendingAssistantIdRef.current = null;
      setBusy("idle");
      setActiveChatStreamId(null);
      setError(nextError instanceof Error ? nextError.message : "Think Chat failed.");
    }
  };

  const stopChat = async () => {
    if (!activeChatStreamId) {
      return;
    }
    await window.overthink.chat.stop(activeChatStreamId);
  };

  const handleChatEvent = (type: string, delta?: string, message?: string) => {
    const targetId = pendingAssistantIdRef.current;
    if (!targetId) {
      return;
    }

    if (type === "delta" && delta) {
      updateMessages((items) =>
        items.map((item) => (item.id === targetId ? { ...item, content: `${item.content}${delta}` } : item))
      );
      return;
    }

    if (type === "error" || type === "stopped") {
      updateMessages((items) =>
        items.map((item) =>
          item.id === targetId ? { ...item, content: message || (type === "stopped" ? "Stopped." : "Request failed.") } : item
        )
      );
    }

    if (["complete", "error", "stopped"].includes(type)) {
      pendingAssistantIdRef.current = null;
      setActiveChatStreamId(null);
      activeChatStreamRef.current = null;
      setBusy("idle");
      void saveChatSession(messagesRef.current);
    }
  };

  const startNewChat = () => {
    if (activeChatStreamId) {
      void stopChat();
    }
    const nextSessionId = makeId();
    setCurrentSessionId(nextSessionId);
    currentSessionIdRef.current = nextSessionId;
    setMessages([]);
    messagesRef.current = [];
    pendingAssistantIdRef.current = null;
  };

  const restoreSession = (sessionId: string) => {
    const session = sessions.find((item) => item.id === sessionId);
    if (!session) {
      return;
    }

    setCurrentSessionId(session.id);
    currentSessionIdRef.current = session.id;
    setMessages(session.messages);
    messagesRef.current = session.messages;
  };

  const saveModel = async () => {
    if (!providerDraft.baseUrl.trim() || !providerDraft.chatModel.trim()) {
      setModelTest({
        ok: false,
        status: null,
        message: "Base URL and chat model are required.",
        latencyMs: 0
      });
      return;
    }

    const existing = settings.providers.find((provider) => provider.id === providerDraft.id);
    const provider = draftToProvider(providerDraft, existing);
    const providers = existing
      ? settings.providers.map((item) => (item.id === provider.id ? provider : item))
      : [...settings.providers, provider];
    const nextSettings = await window.overthink.models.saveSettings({
      providers,
      activeProviderId: provider.id,
      activeVisionProviderId: provider.visionModel ? provider.id : settings.activeVisionProviderId ?? provider.id,
      searchProviders: settings.searchProviders,
      activeSearchProviderId: settings.activeSearchProviderId
    });
    setSettings(nextSettings);
    setProviderDraft(providerToDraft(provider));
    setModelTest({ ok: true, status: null, message: "Saved.", latencyMs: 0 });
    setError(null);
  };

  const testModel = async (mode: "chat" | "vision") => {
    setBusy("model");
    setModelTest(null);
    try {
      const result = await window.overthink.models.test({ provider: providerDraft, mode });
      setModelTest(result);
    } finally {
      setBusy("idle");
    }
  };

  const deleteModel = async (providerId: string) => {
    const providers = settings.providers.filter((provider) => provider.id !== providerId);
    const nextSettings = await window.overthink.models.saveSettings({
      providers,
      activeProviderId: providers[0]?.id ?? null,
      activeVisionProviderId: providers[0]?.id ?? null,
      searchProviders: settings.searchProviders,
      activeSearchProviderId: settings.activeSearchProviderId
    });
    setSettings(nextSettings);
    setProviderDraft(providerToDraft(nextSettings.providers[0] ?? null));
  };

  const saveSearchProvider = async () => {
    if (!searchProviderDraft.baseUrl.trim()) {
      setModelTest({ ok: false, status: null, message: "Search Base URL is required.", latencyMs: 0 });
      return;
    }

    const existing = settings.searchProviders.find((provider) => provider.id === searchProviderDraft.id);
    const provider = draftToSearchProvider(searchProviderDraft, existing);
    const searchProviders = existing
      ? settings.searchProviders.map((item) => (item.id === provider.id ? provider : item))
      : [...settings.searchProviders, provider];
    const nextSettings = await window.overthink.models.saveSettings({
      ...settings,
      searchProviders,
      activeSearchProviderId: provider.id
    });
    setSettings(nextSettings);
    setSearchProviderDraft(searchProviderToDraft(provider));
    setModelTest({ ok: true, status: null, message: "Search provider saved.", latencyMs: 0 });
  };

  const deleteSearchProvider = async (providerId: string) => {
    const searchProviders = settings.searchProviders.filter((provider) => provider.id !== providerId);
    const nextSettings = await window.overthink.models.saveSettings({
      ...settings,
      searchProviders,
      activeSearchProviderId: searchProviders[0]?.id ?? null
    });
    setSettings(nextSettings);
    setSearchProviderDraft(searchProviderToDraft(nextSettings.searchProviders[0] ?? null));
  };

  const startAgent = async () => {
    const objective = agentObjective.trim();
    if (!objective || activeTaskId) {
      return;
    }

    setAgentSteps([]);
    setError(null);
    const taskId = await window.overthink.agent.start({ objective, tabId: activeTab?.id });
    activeTaskRef.current = taskId;
    setActiveTaskId(taskId);
  };

  const stopAgent = async () => {
    if (!activeTaskId) {
      return;
    }
    await window.overthink.agent.stop(activeTaskId);
  };

  const runDebuggerAction = async (action: "click" | "type" | "scroll" | "enter") => {
    setError(null);
    try {
      if (action === "click") {
        await window.overthink.debugger.click({
          tabId: activeTab?.id,
          x: Number(clickX) || 0,
          y: Number(clickY) || 0
        });
      }

      if (action === "type") {
        await window.overthink.debugger.type({ tabId: activeTab?.id, text: typeText });
      }

      if (action === "scroll") {
        await window.overthink.debugger.scroll({ tabId: activeTab?.id, deltaY: 520 });
      }

      if (action === "enter") {
        await window.overthink.debugger.key({ tabId: activeTab?.id, key: "Enter" });
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Debugger action failed.");
    }
  };

  const runDeepDive = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = deepQuery.trim();
    if (!query || activeDeepStreamRef.current) {
      return;
    }

    setBusy("dive");
    setDeepOutput("");
    deepOutputRef.current = "";
    setError(null);

    try {
      const streamId = await window.overthink.research.start({
        query,
        tabId: activeTab?.id,
        pageBrief,
        documents
      });
      activeDeepStreamRef.current = streamId;
    } catch (nextError) {
      setBusy("idle");
      setError(nextError instanceof Error ? nextError.message : "Deep Dive failed.");
    }
  };

  const handleDeepEvent = (type: string, delta?: string, message?: string, record?: DeepDiveRecord) => {
    if (type === "delta" && delta) {
      deepOutputRef.current += delta;
      setDeepOutput(deepOutputRef.current);
      return;
    }

    if (type === "error" || type === "stopped") {
      deepOutputRef.current = message || (type === "stopped" ? "Stopped." : "Request failed.");
      setDeepOutput(deepOutputRef.current);
    }

    if (["complete", "error", "stopped"].includes(type)) {
      setBusy("idle");
      const nextRecord =
        record ??
        ({
          id: makeId(),
          query: deepQueryRef.current.trim(),
          result: deepOutputRef.current,
          sources: [],
          citations: [],
          createdAt: nowIso()
        } satisfies DeepDiveRecord);
      const nextHistory = [nextRecord, ...deepHistoryRef.current.filter((item) => item.id !== nextRecord.id)].slice(0, 12);
      deepHistoryRef.current = nextHistory;
      setDeepHistory(nextHistory);
      activeDeepStreamRef.current = null;
    }
  };

  const addRecall = async () => {
    const text = recallDraft.trim() || pageBrief?.selectedText || pageBrief?.excerpt || "";
    if (!text) {
      return;
    }

    const item: RecallItem = {
      id: makeId(),
      text,
      source: recallDraft.trim() ? "manual" : "page",
      url: activeTab?.url,
      enabled: true,
      createdAt: nowIso()
    };
    const nextItems = [item, ...recallItems].slice(0, 200);
    setRecallDraft("");
    setRecallItems(nextItems);
    await window.overthink.storage.set("local", { [RECALL_KEY]: nextItems });
  };

  const toggleRecall = async (itemId: string) => {
    const nextItems = recallItems.map((item) => (item.id === itemId ? { ...item, enabled: !item.enabled } : item));
    setRecallItems(nextItems);
    await window.overthink.storage.set("local", { [RECALL_KEY]: nextItems });
  };

  const deleteRecall = async (itemId: string) => {
    const nextItems = recallItems.filter((item) => item.id !== itemId);
    setRecallItems(nextItems);
    await window.overthink.storage.set("local", { [RECALL_KEY]: nextItems });
  };

  const approveAgentAction = async (taskId: string, approvalId: string) => {
    const task = await window.overthink.tasks.approve(taskId, approvalId);
    if (task) {
      setTasks((items) => [task, ...items.filter((item) => item.id !== task.id)]);
    }
  };

  const rejectAgentAction = async (taskId: string, approvalId: string) => {
    const task = await window.overthink.tasks.reject(taskId, approvalId);
    if (task) {
      setTasks((items) => [task, ...items.filter((item) => item.id !== task.id)]);
    }
  };

  const installExtension = async () => {
    const record = await window.overthink.extensions.install();
    if (record) {
      setExtensions(await window.overthink.extensions.list());
      setNotice(`Installed ${record.name}.`);
    }
  };

  const setExtensionEnabled = async (extensionId: string, enabled: boolean) => {
    setExtensions(await window.overthink.extensions.setEnabled(extensionId, enabled));
  };

  const removeExtension = async (extensionId: string) => {
    setExtensions(await window.overthink.extensions.remove(extensionId));
  };

  const exportData = async () => {
    const summary = await window.overthink.data.exportAll();
    setNotice(importSummaryLine(summary));
  };

  const importData = async () => {
    const summary = await window.overthink.data.importAll();
    setNotice(importSummaryLine(summary));
    if (summary.imported) {
      await loadState();
    }
  };

  const visibleRecall = recallItems.filter((item) =>
    item.text.toLowerCase().includes(recallQuery.trim().toLowerCase())
  );

  return (
    <div className="overthink-panel">
      <nav className="side-tabs" aria-label="Overthink sections">
        {PANEL_TABS.map(({ id: tabId, icon: Icon, label }) => (
          <button
            aria-selected={selectedTab === tabId}
            className={selectedTab === tabId ? "side-tab active" : "side-tab"}
            key={tabId}
            onClick={() => setSelectedTab(tabId)}
            role="tab"
            type="button"
          >
            <Icon size={15} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="page-context-line">
        <span>{activeTab?.title || "New Tab"}</span>
        {contextUrl ? <small>{contextUrl}</small> : null}
      </div>

      {error ? (
        <div className="status-banner danger">
          <AlertTriangle size={15} />
          <span>{error}</span>
        </div>
      ) : null}

      {notice ? (
        <div className="status-banner">
          <CheckCircle2 size={15} />
          <span>{notice}</span>
        </div>
      ) : null}

      <section className="side-panel-content">
        {selectedTab === "chat" ? renderChat() : null}
        {selectedTab === "agent" ? renderAgent() : null}
        {selectedTab === "dive" ? renderDeepDive() : null}
        {selectedTab === "recall" ? renderRecall() : null}
        {selectedTab === "tasks" ? renderTasks() : null}
        {selectedTab === "extensions" ? renderExtensions() : null}
        {selectedTab === "models" ? renderModels() : null}
        {selectedTab === "data" ? renderData() : null}
      </section>
    </div>
  );

  function renderContextActions() {
    return (
      <div className="context-actions">
        <button disabled={isBusy || !activeTab} onClick={captureBrief} type="button">
          <BookOpenText size={15} />
          <span>{busy === "brief" ? "Reading" : "Page Brief"}</span>
        </button>
        <button disabled={isBusy || !activeTab} onClick={captureScreenshot} type="button">
          <Camera size={15} />
          <span>{busy === "shot" ? "Capturing" : "Screenshot"}</span>
        </button>
        <button disabled={isBusy} onClick={attachDocument} type="button">
          <FileText size={15} />
          <span>{busy === "doc" ? "Extracting" : "Document"}</span>
        </button>
      </div>
    );
  }

  function renderBrief() {
    if (!pageBrief) {
      return <div className="empty-panel">No Page Brief</div>;
    }

    return (
      <div className="brief-panel">
        <div className="brief-head">
          <strong>{pageBrief.title}</strong>
          <span>{pageBrief.wordCount} words</span>
        </div>
        {pageBrief.description ? <p>{truncate(pageBrief.description, 180)}</p> : null}
        <p>{truncate(pageBrief.selectedText || pageBrief.excerpt || "No readable text found.", 360)}</p>
        {pageBrief.headings.length ? (
          <ol>
            {pageBrief.headings.slice(0, 5).map((heading) => (
              <li key={`${heading.level}-${heading.text}`}>{heading.text}</li>
            ))}
          </ol>
        ) : null}
      </div>
    );
  }

  function renderChat() {
    return (
      <div className="panel-stack">
        {renderContextActions()}
        {renderBrief()}

        <div className="chat-history-row">
          <button onClick={startNewChat} type="button">
            <Plus size={14} />
            <span>New</span>
          </button>
          <select onChange={(event) => restoreSession(event.target.value)} value={currentSessionId}>
            <option value={currentSessionId}>Current chat</option>
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.title}
              </option>
            ))}
          </select>
        </div>

        <div className="message-list">
          {messages.length === 0 ? <div className="empty-panel">Think Chat</div> : null}
          {messages.map((message) => (
            <div className={`think-message ${message.role}`} key={message.id}>
              {message.content || (message.role === "assistant" ? "..." : "")}
            </div>
          ))}
        </div>

        <form className="prompt-row" onSubmit={startChat}>
          <textarea
            aria-label="Think Chat input"
            onChange={(event) => setDraft(event.target.value)}
            placeholder={hasModelConfig ? "Ask from this page" : "Configure a model first"}
            rows={3}
            value={draft}
          />
          <button disabled={!draft.trim() || Boolean(activeChatStreamId)} title="Send" type="submit">
            <SendHorizontal size={17} />
          </button>
          {activeChatStreamId ? (
            <button className="secondary-icon" onClick={stopChat} title="Stop" type="button">
              <Square size={15} />
            </button>
          ) : null}
        </form>

        {documents.length ? (
          <div className="attachment-row">
            {documents.map((document) => (
              <span key={document.id}>{document.name}</span>
            ))}
          </div>
        ) : null}

        {screenshotDataUrl ? <img alt="Current tab screenshot" className="shot-preview" src={screenshotDataUrl} /> : null}
      </div>
    );
  }

  function renderAgent() {
    return (
      <div className="panel-stack">
        <textarea
          aria-label="Agent task"
          className="large-input"
          onChange={(event) => setAgentObjective(event.target.value)}
          placeholder="Objective"
          rows={4}
          value={agentObjective}
        />
        <div className="button-row">
          <button disabled={!agentObjective.trim() || Boolean(activeTaskId)} onClick={startAgent} type="button">
            <Play size={15} />
            <span>Start</span>
          </button>
          <button disabled={!activeTaskId} onClick={stopAgent} type="button">
            <Square size={15} />
            <span>Stop</span>
          </button>
          <button
            onClick={() => {
              setAgentSteps([]);
              setAgentObjective("");
            }}
            type="button"
          >
            <RotateCcw size={15} />
            <span>Reset</span>
          </button>
        </div>

        <div className="tool-grid">
          <input aria-label="Click X" onChange={(event) => setClickX(event.target.value)} value={clickX} />
          <input aria-label="Click Y" onChange={(event) => setClickY(event.target.value)} value={clickY} />
          <button onClick={() => void runDebuggerAction("click")} type="button">
            Click
          </button>
          <button onClick={() => void runDebuggerAction("scroll")} type="button">
            Scroll
          </button>
          <input
            aria-label="Type text"
            className="tool-text"
            onChange={(event) => setTypeText(event.target.value)}
            value={typeText}
          />
          <button onClick={() => void runDebuggerAction("type")} type="button">
            Type
          </button>
          <button onClick={() => void runDebuggerAction("enter")} type="button">
            Enter
          </button>
        </div>

        <div className="step-list">
          {agentSteps.length === 0 ? <div className="empty-panel">Overthink Agent</div> : null}
          {agentSteps.map((step, index) => (
            <div className={`agent-step ${step.type}`} key={`${step.taskId}-${index}`}>
              <strong>{step.title}</strong>
              {step.detail ? <p>{step.detail}</p> : null}
              {step.approval?.status === "pending" ? (
                <div className="approval-actions">
                  <button onClick={() => void approveAgentAction(step.taskId, step.approval?.id ?? "")} type="button">
                    Approve
                  </button>
                  <button onClick={() => void rejectAgentAction(step.taskId, step.approval?.id ?? "")} type="button">
                    Reject
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderDeepDive() {
    return (
      <div className="panel-stack">
        {renderContextActions()}
        <form className="deep-form" onSubmit={runDeepDive}>
          <textarea
            aria-label="Deep Dive query"
            onChange={(event) => setDeepQuery(event.target.value)}
            placeholder={hasModelConfig ? "Research question" : "Configure a model first"}
            rows={4}
            value={deepQuery}
          />
          <button disabled={!deepQuery.trim() || busy === "dive"} type="submit">
            <Search size={15} />
            <span>{busy === "dive" ? "Running" : "Run"}</span>
          </button>
        </form>
        <div className="report-panel">{deepOutput || "Deep Dive"}</div>
        <div className="history-list">
          {deepHistory.map((record) => (
            <button
              key={record.id}
              onClick={() => {
                setDeepQuery(record.query);
                setDeepOutput(record.result);
              }}
              type="button"
            >
              <History size={13} />
              <span>{truncate(record.query, 44)}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  function renderRecall() {
    return (
      <div className="panel-stack">
        <textarea
          aria-label="Recall text"
          className="large-input"
          onChange={(event) => setRecallDraft(event.target.value)}
          placeholder="Recall item"
          rows={3}
          value={recallDraft}
        />
        <div className="button-row">
          <button onClick={addRecall} type="button">
            <Plus size={15} />
            <span>Add</span>
          </button>
          <input
            aria-label="Search Recall"
            onChange={(event) => setRecallQuery(event.target.value)}
            placeholder="Search"
            value={recallQuery}
          />
        </div>
        <div className="recall-list">
          {visibleRecall.length === 0 ? <div className="empty-panel">Recall</div> : null}
          {visibleRecall.map((item) => (
            <div className={item.enabled ? "recall-item" : "recall-item muted"} key={item.id}>
              <p>{truncate(item.text, 260)}</p>
              <div>
                <button onClick={() => void toggleRecall(item.id)} type="button">
                  {item.enabled ? "On" : "Off"}
                </button>
                <button onClick={() => void deleteRecall(item.id)} type="button">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderTasks() {
    const pendingApprovals = tasks.flatMap((task) =>
      task.approvals.filter((approval) => approval.status === "pending").map((approval) => ({ task, approval }))
    );

    return (
      <div className="panel-stack">
        {pendingApprovals.length ? (
          <div className="card-list">
            {pendingApprovals.map(({ task, approval }) => (
              <div className="task-card" key={approval.id}>
                <strong>{approval.title}</strong>
                <small>{task.objective}</small>
                <p>{approval.detail}</p>
                <div className="approval-actions">
                  <button onClick={() => void approveAgentAction(task.id, approval.id)} type="button">
                    Approve
                  </button>
                  <button onClick={() => void rejectAgentAction(task.id, approval.id)} type="button">
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div className="card-list">
          {tasks.length === 0 ? <div className="empty-panel">Tasks</div> : null}
          {tasks.map((task) => (
            <div className="task-card" key={task.id}>
              <strong>{task.objective}</strong>
              <small>
                {task.status} - {task.steps.length} steps
              </small>
              {task.finalAnswer ? <p>{truncate(task.finalAnswer, 260)}</p> : null}
              {task.error ? <p>{task.error}</p> : null}
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderExtensions() {
    return (
      <div className="panel-stack">
        <div className="button-row">
          <button onClick={installExtension} type="button">
            <Plus size={15} />
            <span>Install</span>
          </button>
          <button onClick={() => void window.overthink.extensions.list().then(setExtensions)} type="button">
            <RotateCcw size={15} />
            <span>Refresh</span>
          </button>
        </div>
        <div className="card-list">
          {extensions.length === 0 ? <div className="empty-panel">Extensions</div> : null}
          {extensions.map((extension) => (
            <div className="task-card" key={extension.id}>
              <strong>{extension.name}</strong>
              <small>
                {extension.version} - {extension.enabled ? "Enabled" : "Disabled"}
              </small>
              <p>{truncate(extension.path, 180)}</p>
              {extension.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
              <div className="approval-actions">
                <button onClick={() => void setExtensionEnabled(extension.id, !extension.enabled)} type="button">
                  {extension.enabled ? "Disable" : "Enable"}
                </button>
                <button onClick={() => void removeExtension(extension.id)} type="button">
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderModels() {
    return (
      <div className="panel-stack">
        <div className="model-list">
          {settings.providers.map((provider) => (
            <button
              className={provider.id === providerDraft.id ? "model-pill active" : "model-pill"}
              key={provider.id}
              onClick={() => {
                setProviderDraft(providerToDraft(provider));
                setModelTest(null);
              }}
              type="button"
            >
              <span>{provider.name}</span>
              <small>{provider.chatModel}</small>
            </button>
          ))}
          <button
            className="model-pill"
            onClick={() => {
              setProviderDraft(blankProviderDraft());
              setModelTest(null);
            }}
            type="button"
          >
            <Plus size={14} />
            <span>New provider</span>
          </button>
        </div>

        <label className="field-label">
          <span>Name</span>
          <input
            onChange={(event) => setProviderDraft((draft) => ({ ...draft, name: event.target.value }))}
            value={providerDraft.name}
          />
        </label>
        <label className="field-label">
          <span>Base URL</span>
          <input
            onChange={(event) => setProviderDraft((draft) => ({ ...draft, baseUrl: event.target.value }))}
            placeholder="https://host/v1"
            value={providerDraft.baseUrl}
          />
        </label>
        <label className="field-label">
          <span>API Key</span>
          <input
            onChange={(event) => setProviderDraft((draft) => ({ ...draft, apiKey: event.target.value }))}
            type="password"
            value={providerDraft.apiKey}
          />
        </label>
        <label className="field-label">
          <span>Chat Model</span>
          <input
            onChange={(event) => setProviderDraft((draft) => ({ ...draft, chatModel: event.target.value }))}
            value={providerDraft.chatModel}
          />
        </label>
        <label className="field-label">
          <span>Vision Model</span>
          <input
            onChange={(event) => setProviderDraft((draft) => ({ ...draft, visionModel: event.target.value }))}
            value={providerDraft.visionModel}
          />
        </label>
        <label className="toggle-label">
          <input
            checked={providerDraft.enabled}
            onChange={(event) => setProviderDraft((draft) => ({ ...draft, enabled: event.target.checked }))}
            type="checkbox"
          />
          <span>Enabled</span>
        </label>

        <div className="button-row">
          <button onClick={saveModel} type="button">
            <Save size={15} />
            <span>Save</span>
          </button>
          <button disabled={busy === "model"} onClick={() => void testModel("chat")} type="button">
            Chat Test
          </button>
          <button disabled={busy === "model" || !providerDraft.visionModel} onClick={() => void testModel("vision")} type="button">
            Vision Test
          </button>
          {settings.providers.some((provider) => provider.id === providerDraft.id) ? (
            <button onClick={() => void deleteModel(providerDraft.id)} type="button">
              <Trash2 size={14} />
            </button>
          ) : null}
        </div>

        {modelTest ? (
          <div className={modelTest.ok ? "test-result ok" : "test-result"}>
            <strong>{modelTest.ok ? "OK" : "Failed"}</strong>
            <span>{modelTest.message}</span>
            <small>{modelTest.latencyMs} ms</small>
          </div>
        ) : null}

        <div className="section-divider">Search Providers</div>
        <div className="model-list">
          {settings.searchProviders.map((provider) => (
            <button
              className={provider.id === searchProviderDraft.id ? "model-pill active" : "model-pill"}
              key={provider.id}
              onClick={() => {
                setSearchProviderDraft(searchProviderToDraft(provider));
                setModelTest(null);
              }}
              type="button"
            >
              <span>{provider.name}</span>
              <small>{provider.kind}</small>
            </button>
          ))}
          <button
            className="model-pill"
            onClick={() => {
              setSearchProviderDraft(blankSearchProviderDraft());
              setModelTest(null);
            }}
            type="button"
          >
            <Plus size={14} />
            <span>New search</span>
          </button>
        </div>
        <label className="field-label">
          <span>Search Name</span>
          <input
            onChange={(event) => setSearchProviderDraft((draft) => ({ ...draft, name: event.target.value }))}
            value={searchProviderDraft.name}
          />
        </label>
        <label className="field-label">
          <span>Search Kind</span>
          <select
            onChange={(event) =>
              setSearchProviderDraft((draft) => ({
                ...draft,
                kind: event.target.value as SearchProviderDraft["kind"]
              }))
            }
            value={searchProviderDraft.kind}
          >
            <option value="brave">Brave</option>
            <option value="tavily">Tavily</option>
            <option value="serpapi">SerpAPI</option>
            <option value="generic">Generic</option>
          </select>
        </label>
        <label className="field-label">
          <span>Search Base URL</span>
          <input
            onChange={(event) => setSearchProviderDraft((draft) => ({ ...draft, baseUrl: event.target.value }))}
            placeholder="https://api.search.example/search"
            value={searchProviderDraft.baseUrl}
          />
        </label>
        <label className="field-label">
          <span>Search API Key</span>
          <input
            onChange={(event) => setSearchProviderDraft((draft) => ({ ...draft, apiKey: event.target.value }))}
            type="password"
            value={searchProviderDraft.apiKey}
          />
        </label>
        <label className="toggle-label">
          <input
            checked={searchProviderDraft.enabled}
            onChange={(event) => setSearchProviderDraft((draft) => ({ ...draft, enabled: event.target.checked }))}
            type="checkbox"
          />
          <span>Enabled</span>
        </label>
        <div className="button-row">
          <button onClick={saveSearchProvider} type="button">
            <Save size={15} />
            <span>Save Search</span>
          </button>
          {settings.searchProviders.some((provider) => provider.id === searchProviderDraft.id) ? (
            <button onClick={() => void deleteSearchProvider(searchProviderDraft.id)} type="button">
              <Trash2 size={14} />
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  function renderData() {
    return (
      <div className="panel-stack">
        <div className="data-grid">
          <button onClick={importData} type="button">
            <Upload size={16} />
            <span>Import</span>
          </button>
          <button onClick={exportData} type="button">
            <Download size={16} />
            <span>Export</span>
          </button>
        </div>
        <div className="data-stats">
          <span>Models {settings.providers.length}</span>
          <span>Chats {sessions.length}</span>
          <span>Recall {recallItems.length}</span>
          <span>Deep Dive {deepHistory.length}</span>
          <span>Tasks {tasks.length}</span>
          <span>Extensions {extensions.length}</span>
        </div>
      </div>
    );
  }
}
