import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Database,
  Download,
  FilePlus2,
  Globe2,
  Loader2,
  PackagePlus,
  Plus,
  RefreshCw,
  Save,
  Search,
  SendHorizontal,
  Settings,
  Sparkles,
  Square,
  Store,
  Trash2,
  Upload
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import type { BrowserTabState } from "@/shared/ipc";
import type {
  AgentStepEvent,
  DocumentExtraction,
  ImportSummary,
  ModelProviderConfig,
  ModelProviderDraft,
  ModelSettingsState,
  ModelTestResult,
  PageBrief,
  RecallItem,
  SearchProviderConfig,
  SearchProviderDraft,
  SkillMarketplaceEntry,
  SkillMarketplaceSource,
  SkillMarketplaceState,
  SkillRecord,
  ThinkChatSession,
  ThinkMessage
} from "@/shared/overthink";

interface OverthinkSidePanelProps {
  activeTab: BrowserTabState | null;
  agentPrompt?: { id: string; prompt: string; tabId: number } | null;
}

type PanelView = "agent" | "skills" | "settings";
type BusyState = "idle" | "chat" | "agent" | "brief" | "doc" | "model" | "skills" | "data";

const CHAT_KEY = "thinkChatSessions";
const RECALL_KEY = "recallItems";

const emptySettings = (): ModelSettingsState => ({
  providers: [],
  activeProviderId: null,
  activeVisionProviderId: null,
  searchProviders: [],
  activeSearchProviderId: null
});

const emptyMarketplace: SkillMarketplaceState = {
  sources: [],
  entries: []
};

const NAV_ITEMS: Array<{ id: PanelView; icon: LucideIcon; label: string }> = [
  { id: "agent", icon: Bot, label: "Agent" },
  { id: "skills", icon: Store, label: "Skills" },
  { id: "settings", icon: Settings, label: "Settings" }
];

function makeId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 1)}...`;
}

function compactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "overthink:" ? parsed.href : parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function createMessage(role: ThinkMessage["role"], content: string): ThinkMessage {
  return {
    id: makeId(),
    role,
    content,
    createdAt: nowIso()
  };
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

function importSummaryLine(summary: ImportSummary): string {
  return `${summary.message} Models ${summary.modelProviders}, chats ${summary.chatSessions}, recall ${summary.recallItems}, tasks ${summary.tasks}, skills ${summary.skills}.`;
}

function shouldCapturePage(prompt: string): boolean {
  return /current page|this page|page|tab|article|summarize|summary|analyze|read|网页|页面|当前|总结|分析|阅读/i.test(prompt);
}

function shouldRunBrowserAction(prompt: string): boolean {
  return /click|type|fill|open|visit|go to|scroll|press|navigate|submit|登录|点击|输入|填写|打开|滚动|按下|提交/i.test(
    prompt
  );
}

export function OverthinkSidePanel({ activeTab, agentPrompt }: OverthinkSidePanelProps) {
  const [view, setView] = useState<PanelView>("agent");
  const [busy, setBusy] = useState<BusyState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [settings, setSettings] = useState<ModelSettingsState>(emptySettings);
  const [providerDraft, setProviderDraft] = useState<ModelProviderDraft>(blankProviderDraft);
  const [searchProviderDraft, setSearchProviderDraft] = useState<SearchProviderDraft>(blankSearchProviderDraft);
  const [modelTest, setModelTest] = useState<ModelTestResult | null>(null);
  const [sessions, setSessions] = useState<ThinkChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState(makeId);
  const [messages, setMessages] = useState<ThinkMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [pageBrief, setPageBrief] = useState<PageBrief | null>(null);
  const [documents, setDocuments] = useState<DocumentExtraction[]>([]);
  const [recallItems, setRecallItems] = useState<RecallItem[]>([]);
  const [recallDraft, setRecallDraft] = useState("");
  const [recallQuery, setRecallQuery] = useState("");
  const [marketplace, setMarketplace] = useState<SkillMarketplaceState>(emptyMarketplace);
  const [installedSkills, setInstalledSkills] = useState<SkillRecord[]>([]);
  const [sourceUrl, setSourceUrl] = useState("");
  const [skillQuery, setSkillQuery] = useState("");
  const [agentSteps, setAgentSteps] = useState<AgentStepEvent[]>([]);
  const [activeChatStreamId, setActiveChatStreamId] = useState<string | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  const messagesRef = useRef<ThinkMessage[]>([]);
  const sessionsRef = useRef<ThinkChatSession[]>([]);
  const currentSessionIdRef = useRef(currentSessionId);
  const activeTabRef = useRef<BrowserTabState | null>(activeTab);
  const pendingAssistantIdRef = useRef<string | null>(null);
  const activeChatStreamRef = useRef<string | null>(null);
  const activeTaskRef = useRef<string | null>(null);
  const consumedPromptRef = useRef<string | null>(null);

  const activeProvider = useMemo(
    () => settings.providers.find((provider) => provider.id === settings.activeProviderId) ?? null,
    [settings.activeProviderId, settings.providers]
  );
  const hasModelConfig = Boolean(activeProvider?.enabled && activeProvider.baseUrl && activeProvider.chatModel);
  const isBusy = busy !== "idle";
  const contextUrl = compactUrl(activeTab?.url ?? "");
  const pendingApprovalSteps = agentSteps.filter((step) => step.approval?.status === "pending");
  const visibleRecall = recallItems.filter((item) =>
    recallQuery.trim() ? item.text.toLowerCase().includes(recallQuery.trim().toLowerCase()) : true
  );
  const visibleSkills = marketplace.entries.filter((entry) => {
    const query = skillQuery.trim().toLowerCase();
    if (!query) {
      return true;
    }
    return [entry.name, entry.description, entry.tags.join(" "), entry.triggers.join(" ")]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });

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
      const detail = (event as CustomEvent<PanelView | "models">).detail;
      setView(detail === "models" ? "settings" : detail);
    };

    window.addEventListener("overthink:open-section", openSection);
    return () => window.removeEventListener("overthink:open-section", openSection);
  }, []);

  useEffect(() => {
    const unsubscribe = window.overthink.chat.onEvent((event) => {
      if (event.streamId === activeChatStreamRef.current) {
        handleChatEvent(event.type, event.delta, event.message);
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

      if (event.type === "approval") {
        setBusy("idle");
      }

      if (["complete", "error", "stopped"].includes(event.type)) {
        const targetId = pendingAssistantIdRef.current;
        const content = event.detail || event.title;
        if (targetId) {
          const nextMessages = updateMessages((items) =>
            items.map((item) => (item.id === targetId ? { ...item, content } : item))
          );
          void saveChatSession(nextMessages);
        }
        pendingAssistantIdRef.current = null;
        activeTaskRef.current = null;
        setActiveTaskId(null);
        setBusy("idle");
      }
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    setPageBrief(null);
    setDocuments([]);
  }, [activeTab?.id]);

  useEffect(() => {
    if (!agentPrompt || consumedPromptRef.current === agentPrompt.id) {
      return;
    }

    consumedPromptRef.current = agentPrompt.id;
    setView("agent");
    void runAgentTurn(agentPrompt.prompt);
  }, [agentPrompt]);

  async function loadState() {
    const [nextSettings, stored, nextMarketplace, nextInstalled] = await Promise.all([
      window.overthink.models.getSettings(),
      window.overthink.storage.get<{
        thinkChatSessions?: ThinkChatSession[];
        recallItems?: RecallItem[];
      }>("local", [CHAT_KEY, RECALL_KEY]),
      window.overthink.skills.listMarketplace(),
      window.overthink.skills.listInstalled()
    ]);

    setSettings(nextSettings);
    setProviderDraft(providerToDraft(nextSettings.providers.find((provider) => provider.id === nextSettings.activeProviderId) ?? null));
    setSearchProviderDraft(
      searchProviderToDraft(nextSettings.searchProviders.find((provider) => provider.id === nextSettings.activeSearchProviderId) ?? null)
    );
    setSessions(Array.isArray(stored.thinkChatSessions) ? stored.thinkChatSessions : []);
    sessionsRef.current = Array.isArray(stored.thinkChatSessions) ? stored.thinkChatSessions : [];
    setRecallItems(Array.isArray(stored.recallItems) ? stored.recallItems : []);
    setMarketplace(nextMarketplace);
    setInstalledSkills(nextInstalled);

    if (!nextSettings.providers.length) {
      setView("settings");
    }
  }

  function updateMessages(updater: (items: ThinkMessage[]) => ThinkMessage[]): ThinkMessage[] {
    const nextMessages = updater(messagesRef.current);
    messagesRef.current = nextMessages;
    setMessages(nextMessages);
    return nextMessages;
  }

  async function saveChatSession(nextMessages: ThinkMessage[]) {
    if (nextMessages.length === 0) {
      return;
    }

    const title = nextMessages.find((message) => message.role === "user")?.content.slice(0, 64) || "Agent chat";
    const session: ThinkChatSession = {
      id: currentSessionIdRef.current,
      title,
      messages: nextMessages,
      pageUrl: activeTabRef.current?.url,
      updatedAt: nowIso()
    };
    const nextSessions = [session, ...sessionsRef.current.filter((item) => item.id !== currentSessionIdRef.current)].slice(0, 30);
    sessionsRef.current = nextSessions;
    setSessions(nextSessions);
    await window.overthink.storage.set("local", { [CHAT_KEY]: nextSessions });
  }

  async function captureBrief(): Promise<PageBrief | null> {
    setBusy("brief");
    setError(null);
    try {
      const brief = await window.overthink.page.captureBrief(activeTab?.id);
      setPageBrief(brief);
      setNotice(`Page context ready: ${brief.title || compactUrl(brief.url)}`);
      return brief;
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Page capture failed.");
      return null;
    } finally {
      setBusy("idle");
    }
  }

  async function attachDocument() {
    setBusy("doc");
    setError(null);
    try {
      const document = await window.overthink.documents.extract();
      if (document) {
        setDocuments((items) => [document, ...items].slice(0, 4));
        setNotice(`Attached ${document.name}.`);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Document extraction failed.");
    } finally {
      setBusy("idle");
    }
  }

  async function submitAgentTurn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAgentTurn(draft);
  }

  async function runAgentTurn(rawContent: string) {
    const content = rawContent.trim();
    if (!content || activeChatStreamRef.current || activeTaskRef.current) {
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
    setNotice(null);
    setAgentSteps([]);
    pendingAssistantIdRef.current = assistantMessage.id;
    updateMessages((items) => [...items, userMessage, assistantMessage]);

    if (shouldRunBrowserAction(content)) {
      setBusy("agent");
      try {
        const taskId = await window.overthink.agent.start({ objective: content, tabId: activeTab?.id });
        activeTaskRef.current = taskId;
        setActiveTaskId(taskId);
      } catch (nextError) {
        pendingAssistantIdRef.current = null;
        setBusy("idle");
        setError(nextError instanceof Error ? nextError.message : "Agent task failed.");
      }
      return;
    }

    if (!hasModelConfig) {
      setView("settings");
      setBusy("idle");
      const nextMessages = updateMessages((items) =>
        items.map((item) =>
          item.id === assistantMessage.id
            ? { ...item, content: "Configure a chat model before Overthink can answer." }
            : item
        )
      );
      await saveChatSession(nextMessages);
      return;
    }

    const brief = shouldCapturePage(content) ? pageBrief ?? (await captureBrief()) : pageBrief;

    setBusy("chat");
    try {
      const streamId = await window.overthink.chat.start({
        sessionId: currentSessionIdRef.current,
        providerId: settings.activeProviderId,
        messages: requestMessages,
        context: {
          pageBrief: brief,
          documents
        }
      });
      activeChatStreamRef.current = streamId;
      setActiveChatStreamId(streamId);
    } catch (nextError) {
      pendingAssistantIdRef.current = null;
      activeChatStreamRef.current = null;
      setActiveChatStreamId(null);
      setBusy("idle");
      setError(nextError instanceof Error ? nextError.message : "Agent chat failed.");
    }
  }

  async function stopActiveTurn() {
    if (activeChatStreamId) {
      await window.overthink.chat.stop(activeChatStreamId);
    }

    if (activeTaskId) {
      await window.overthink.agent.stop(activeTaskId);
    }
  }

  function handleChatEvent(type: string, delta?: string, message?: string) {
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
      activeChatStreamRef.current = null;
      setActiveChatStreamId(null);
      setBusy("idle");
      void saveChatSession(messagesRef.current);
    }
  }

  function startNewChat() {
    void stopActiveTurn();
    const nextSessionId = makeId();
    setCurrentSessionId(nextSessionId);
    currentSessionIdRef.current = nextSessionId;
    setMessages([]);
    messagesRef.current = [];
    setAgentSteps([]);
    pendingAssistantIdRef.current = null;
    activeTaskRef.current = null;
    activeChatStreamRef.current = null;
    setActiveTaskId(null);
    setActiveChatStreamId(null);
  }

  function restoreSession(sessionId: string) {
    const session = sessions.find((item) => item.id === sessionId);
    if (!session) {
      return;
    }

    setCurrentSessionId(session.id);
    currentSessionIdRef.current = session.id;
    setMessages(session.messages);
    messagesRef.current = session.messages;
    setAgentSteps([]);
  }

  async function approveAgentAction(taskId: string, approvalId: string) {
    setBusy("agent");
    await window.overthink.tasks.approve(taskId, approvalId);
  }

  async function rejectAgentAction(taskId: string, approvalId: string) {
    await window.overthink.tasks.reject(taskId, approvalId);
  }

  async function saveModel() {
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
    setNotice("Model settings saved.");
  }

  async function testModel(mode: "chat" | "vision") {
    setBusy("model");
    setModelTest(null);
    try {
      const result = await window.overthink.models.test({ provider: providerDraft, mode });
      setModelTest(result);
    } finally {
      setBusy("idle");
    }
  }

  async function deleteModel(providerId: string) {
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
  }

  async function saveSearchProvider() {
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
    setNotice("Search provider saved.");
  }

  async function deleteSearchProvider(providerId: string) {
    const searchProviders = settings.searchProviders.filter((provider) => provider.id !== providerId);
    const nextSettings = await window.overthink.models.saveSettings({
      ...settings,
      searchProviders,
      activeSearchProviderId: searchProviders[0]?.id ?? null
    });
    setSettings(nextSettings);
    setSearchProviderDraft(searchProviderToDraft(nextSettings.searchProviders[0] ?? null));
  }

  async function addRecall() {
    const text = recallDraft.trim();
    if (!text) {
      return;
    }

    const item: RecallItem = {
      id: makeId(),
      text,
      source: "manual",
      enabled: true,
      createdAt: nowIso()
    };
    const nextItems = [item, ...recallItems].slice(0, 200);
    setRecallItems(nextItems);
    setRecallDraft("");
    await window.overthink.storage.set("local", { [RECALL_KEY]: nextItems });
  }

  async function toggleRecall(itemId: string) {
    const nextItems = recallItems.map((item) => (item.id === itemId ? { ...item, enabled: !item.enabled } : item));
    setRecallItems(nextItems);
    await window.overthink.storage.set("local", { [RECALL_KEY]: nextItems });
  }

  async function deleteRecall(itemId: string) {
    const nextItems = recallItems.filter((item) => item.id !== itemId);
    setRecallItems(nextItems);
    await window.overthink.storage.set("local", { [RECALL_KEY]: nextItems });
  }

  async function importData() {
    setBusy("data");
    try {
      const summary = await window.overthink.data.importAll();
      setNotice(importSummaryLine(summary));
      await loadState();
    } finally {
      setBusy("idle");
    }
  }

  async function exportData() {
    setBusy("data");
    try {
      const summary = await window.overthink.data.exportAll();
      setNotice(importSummaryLine(summary));
    } finally {
      setBusy("idle");
    }
  }

  async function refreshSkills() {
    setBusy("skills");
    try {
      const nextMarketplace = await window.overthink.skills.refreshSources();
      const nextInstalled = await window.overthink.skills.listInstalled();
      setMarketplace(nextMarketplace);
      setInstalledSkills(nextInstalled);
    } finally {
      setBusy("idle");
    }
  }

  async function installSkill(entry: SkillMarketplaceEntry) {
    setBusy("skills");
    try {
      await window.overthink.skills.install({ skillId: entry.id, sourceId: entry.sourceId });
      const [nextMarketplace, nextInstalled] = await Promise.all([
        window.overthink.skills.listMarketplace(),
        window.overthink.skills.listInstalled()
      ]);
      setMarketplace(nextMarketplace);
      setInstalledSkills(nextInstalled);
    } finally {
      setBusy("idle");
    }
  }

  async function setSkillEnabled(skillId: string, enabled: boolean) {
    const nextInstalled = await window.overthink.skills.setEnabled(skillId, enabled);
    const nextMarketplace = await window.overthink.skills.listMarketplace();
    setInstalledSkills(nextInstalled);
    setMarketplace(nextMarketplace);
  }

  async function removeSkill(skillId: string) {
    const nextInstalled = await window.overthink.skills.remove(skillId);
    const nextMarketplace = await window.overthink.skills.listMarketplace();
    setInstalledSkills(nextInstalled);
    setMarketplace(nextMarketplace);
  }

  async function addRemoteSource() {
    const url = sourceUrl.trim();
    if (!url) {
      return;
    }

    let sourceName = "Remote source";
    try {
      sourceName = new URL(url).hostname.replace(/^www\./, "") || sourceName;
    } catch {
      setError("Enter a valid marketplace JSON URL.");
      return;
    }

    const source: SkillMarketplaceSource = {
      id: `remote-${makeId()}`,
      name: sourceName,
      kind: "remote",
      url,
      enabled: true
    };
    const nextMarketplace = await window.overthink.skills.saveSources([...marketplace.sources, source]);
    setMarketplace(nextMarketplace);
    setSourceUrl("");
    await refreshSkills();
  }

  function renderStatus() {
    if (error) {
      return (
        <div className="agent-status danger">
          <AlertTriangle size={15} />
          <span>{error}</span>
        </div>
      );
    }

    if (notice) {
      return (
        <div className="agent-status">
          <CheckCircle2 size={15} />
          <span>{notice}</span>
        </div>
      );
    }

    return null;
  }

  function renderContextCard() {
    return (
      <section className="agent-context-card">
        <div>
          <span className="eyebrow">Current tab</span>
          <strong>{activeTab?.title || "No active page"}</strong>
          <small>{contextUrl || "Open a page to give the agent browsing context."}</small>
        </div>
        <div className="context-mini-actions">
          <button disabled={!activeTab || isBusy} onClick={() => void captureBrief()} title="Read page" type="button">
            <Globe2 size={14} />
          </button>
          <button disabled={isBusy} onClick={() => void attachDocument()} title="Attach document" type="button">
            <FilePlus2 size={14} />
          </button>
          <button onClick={startNewChat} title="New chat" type="button">
            <Plus size={14} />
          </button>
        </div>
      </section>
    );
  }

  function renderAgent() {
    return (
      <div className="agent-view">
        {renderContextCard()}
        <div className="agent-session-row">
          <select onChange={(event) => restoreSession(event.target.value)} value={currentSessionId}>
            <option value={currentSessionId}>Current conversation</option>
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.title}
              </option>
            ))}
          </select>
        </div>

        <div className="agent-timeline">
          {messages.length === 0 ? (
            <div className="agent-empty">
              <Sparkles size={18} />
              <strong>Ask from the page, or ask the agent to act.</strong>
              <span>Overthink will answer directly, read the page, search, or request approval before browser actions.</span>
            </div>
          ) : null}
          {messages.map((message) => (
            <div className={`agent-message ${message.role}`} key={message.id}>
              {message.content || (message.role === "assistant" ? "Thinking..." : "")}
            </div>
          ))}
          {agentSteps.length ? (
            <div className="agent-step-stack">
              {agentSteps.map((step, index) => (
                <div className={`agent-step-card ${step.type}`} key={`${step.taskId}-${index}`}>
                  <strong>{step.title}</strong>
                  {step.detail ? <p>{step.detail}</p> : null}
                  {step.approval?.status === "pending" ? (
                    <div className="approval-row">
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
          ) : null}
        </div>

        {documents.length ? (
          <div className="attachment-row">
            {documents.map((document) => (
              <span key={document.id}>{document.name}</span>
            ))}
          </div>
        ) : null}

        {pendingApprovalSteps.length ? <div className="approval-banner">Approval required before continuing.</div> : null}

        <form className="agent-composer" onSubmit={submitAgentTurn}>
          <textarea
            aria-label="Ask Overthink"
            disabled={Boolean(activeChatStreamId || activeTaskId)}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={hasModelConfig ? "Ask, research, or tell the agent what to do" : "Configure a model or ask for browser actions"}
            rows={3}
            value={draft}
          />
          <button disabled={!draft.trim() || Boolean(activeChatStreamId || activeTaskId)} title="Send" type="submit">
            <SendHorizontal size={17} />
          </button>
          {activeChatStreamId || activeTaskId ? (
            <button className="secondary" onClick={() => void stopActiveTurn()} title="Stop" type="button">
              <Square size={15} />
            </button>
          ) : null}
        </form>
      </div>
    );
  }

  function renderSkills() {
    return (
      <div className="agent-view">
        <div className="section-head">
          <div>
            <span className="eyebrow">Marketplace</span>
            <strong>Local skills and remote sources</strong>
          </div>
          <button disabled={busy === "skills"} onClick={() => void refreshSkills()} type="button">
            {busy === "skills" ? <Loader2 className="spin" size={14} /> : <RefreshCw size={14} />}
            <span>Refresh</span>
          </button>
        </div>

        <div className="source-row">
          <input
            aria-label="Remote marketplace JSON URL"
            onChange={(event) => setSourceUrl(event.target.value)}
            placeholder="Remote marketplace JSON URL"
            value={sourceUrl}
          />
          <button onClick={() => void addRemoteSource()} type="button">
            <PackagePlus size={14} />
          </button>
        </div>

        <div className="agent-search-row">
          <Search size={14} />
          <input onChange={(event) => setSkillQuery(event.target.value)} placeholder="Search skills" value={skillQuery} />
        </div>

        <div className="skill-source-strip">
          {marketplace.sources.map((source) => (
            <span className={source.error ? "source-pill error" : "source-pill"} key={source.id} title={source.error}>
              {source.name}
            </span>
          ))}
        </div>

        <div className="skill-list">
          {visibleSkills.map((entry) => (
            <article className="skill-card" key={`${entry.sourceId}-${entry.id}`}>
              <div>
                <strong>{entry.name}</strong>
                <p>{entry.description}</p>
              </div>
              <div className="skill-meta">
                <span>{entry.sourceName}</span>
                <span>{entry.permissions.join(", ") || "no permissions"}</span>
              </div>
              <div className="skill-tags">
                {entry.tags.slice(0, 4).map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              <div className="skill-actions">
                {entry.installed ? (
                  <>
                    <button onClick={() => void setSkillEnabled(entry.id, !entry.enabled)} type="button">
                      {entry.enabled ? "Disable" : "Enable"}
                    </button>
                    <button onClick={() => void removeSkill(entry.id)} title="Remove" type="button">
                      <Trash2 size={14} />
                    </button>
                  </>
                ) : (
                  <button onClick={() => void installSkill(entry)} type="button">
                    <PackagePlus size={14} />
                    <span>Install</span>
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>

        <div className="section-head compact">
          <div>
            <span className="eyebrow">Installed</span>
            <strong>{installedSkills.length} skills</strong>
          </div>
        </div>
      </div>
    );
  }

  function renderSettings() {
    return (
      <div className="agent-view settings-view">
        <div className="section-head">
          <div>
            <span className="eyebrow">Models</span>
            <strong>OpenAI-compatible provider</strong>
          </div>
          <button
            onClick={() => {
              setProviderDraft(blankProviderDraft());
              setModelTest(null);
            }}
            type="button"
          >
            <Plus size={14} />
            <span>New</span>
          </button>
        </div>

        <div className="model-pill-row">
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
        </div>

        <label className="field-label">
          <span>Name</span>
          <input onChange={(event) => setProviderDraft((item) => ({ ...item, name: event.target.value }))} value={providerDraft.name} />
        </label>
        <label className="field-label">
          <span>Base URL</span>
          <input
            onChange={(event) => setProviderDraft((item) => ({ ...item, baseUrl: event.target.value }))}
            placeholder="https://host/v1"
            value={providerDraft.baseUrl}
          />
        </label>
        <label className="field-label">
          <span>API Key</span>
          <input
            onChange={(event) => setProviderDraft((item) => ({ ...item, apiKey: event.target.value }))}
            type="password"
            value={providerDraft.apiKey}
          />
        </label>
        <label className="field-label">
          <span>Chat Model</span>
          <input
            onChange={(event) => setProviderDraft((item) => ({ ...item, chatModel: event.target.value }))}
            value={providerDraft.chatModel}
          />
        </label>
        <label className="field-label">
          <span>Vision Model</span>
          <input
            onChange={(event) => setProviderDraft((item) => ({ ...item, visionModel: event.target.value }))}
            value={providerDraft.visionModel}
          />
        </label>
        <label className="toggle-label">
          <input
            checked={providerDraft.enabled}
            onChange={(event) => setProviderDraft((item) => ({ ...item, enabled: event.target.checked }))}
            type="checkbox"
          />
          <span>Enabled</span>
        </label>

        <div className="settings-actions">
          <button onClick={() => void saveModel()} type="button">
            <Save size={14} />
            <span>Save</span>
          </button>
          <button disabled={busy === "model"} onClick={() => void testModel("chat")} type="button">
            Chat test
          </button>
          <button disabled={busy === "model" || !providerDraft.visionModel} onClick={() => void testModel("vision")} type="button">
            Vision test
          </button>
          {settings.providers.some((provider) => provider.id === providerDraft.id) ? (
            <button onClick={() => void deleteModel(providerDraft.id)} title="Delete model" type="button">
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

        <div className="section-head compact">
          <div>
            <span className="eyebrow">Search</span>
            <strong>Research provider</strong>
          </div>
          <button
            onClick={() => {
              setSearchProviderDraft(blankSearchProviderDraft());
              setModelTest(null);
            }}
            type="button"
          >
            <Plus size={14} />
            <span>New</span>
          </button>
        </div>
        <div className="model-pill-row">
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
        </div>
        <label className="field-label">
          <span>Search Name</span>
          <input
            onChange={(event) => setSearchProviderDraft((item) => ({ ...item, name: event.target.value }))}
            value={searchProviderDraft.name}
          />
        </label>
        <label className="field-label">
          <span>Search Kind</span>
          <select
            onChange={(event) =>
              setSearchProviderDraft((item) => ({
                ...item,
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
            onChange={(event) => setSearchProviderDraft((item) => ({ ...item, baseUrl: event.target.value }))}
            placeholder="https://api.search.example/search"
            value={searchProviderDraft.baseUrl}
          />
        </label>
        <label className="field-label">
          <span>Search API Key</span>
          <input
            onChange={(event) => setSearchProviderDraft((item) => ({ ...item, apiKey: event.target.value }))}
            type="password"
            value={searchProviderDraft.apiKey}
          />
        </label>
        <label className="toggle-label">
          <input
            checked={searchProviderDraft.enabled}
            onChange={(event) => setSearchProviderDraft((item) => ({ ...item, enabled: event.target.checked }))}
            type="checkbox"
          />
          <span>Enabled</span>
        </label>
        <div className="settings-actions">
          <button onClick={() => void saveSearchProvider()} type="button">
            <Save size={14} />
            <span>Save search</span>
          </button>
          {settings.searchProviders.some((provider) => provider.id === searchProviderDraft.id) ? (
            <button onClick={() => void deleteSearchProvider(searchProviderDraft.id)} title="Delete search provider" type="button">
              <Trash2 size={14} />
            </button>
          ) : null}
        </div>

        <div className="section-head compact">
          <div>
            <span className="eyebrow">Recall</span>
            <strong>Local memory</strong>
          </div>
        </div>
        <textarea
          className="compact-textarea"
          onChange={(event) => setRecallDraft(event.target.value)}
          placeholder="Add a local memory for the agent"
          rows={2}
          value={recallDraft}
        />
        <div className="source-row">
          <button onClick={() => void addRecall()} type="button">
            <Plus size={14} />
            <span>Add recall</span>
          </button>
          <input onChange={(event) => setRecallQuery(event.target.value)} placeholder="Filter recall" value={recallQuery} />
        </div>
        <div className="recall-list compact-list">
          {visibleRecall.slice(0, 12).map((item) => (
            <div className={item.enabled ? "recall-card" : "recall-card muted"} key={item.id}>
              <p>{truncate(item.text, 180)}</p>
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

        <div className="section-head compact">
          <div>
            <span className="eyebrow">Data</span>
            <strong>Import and export</strong>
          </div>
        </div>
        <div className="settings-actions">
          <button onClick={() => void importData()} type="button">
            <Upload size={14} />
            <span>Import</span>
          </button>
          <button onClick={() => void exportData()} type="button">
            <Download size={14} />
            <span>Export</span>
          </button>
          <span className="data-stat">
            <Database size={14} />
            {sessions.length} chats, {installedSkills.length} skills
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="agent-panel">
      <nav className="agent-nav" aria-label="Overthink sections">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <button className={view === item.id ? "active" : ""} key={item.id} onClick={() => setView(item.id)} type="button">
              <Icon size={15} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
      {renderStatus()}
      {view === "agent" ? renderAgent() : null}
      {view === "skills" ? renderSkills() : null}
      {view === "settings" ? renderSettings() : null}
    </div>
  );
}
