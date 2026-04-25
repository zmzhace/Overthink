import {
  ArrowLeft,
  ArrowRight,
  BrainCircuit,
  Home,
  PanelRight,
  Plus,
  RefreshCw,
  Search,
  Settings,
  X
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { APP_NAME } from "@/shared/branding";
import type { BrowserTabState, HomeAgentPromptEvent, TabsSnapshot } from "@/shared/ipc";

import { OverthinkSidePanel } from "../sidepanel/OverthinkSidePanel";

const emptySnapshot: TabsSnapshot = {
  activeTabId: null,
  tabs: []
};

export function BrowserShell() {
  const browserAreaRef = useRef<HTMLDivElement>(null);
  const addressInputRef = useRef<HTMLInputElement>(null);
  const [snapshot, setSnapshot] = useState<TabsSnapshot>(emptySnapshot);
  const [addressValue, setAddressValue] = useState("");
  const [sidePanelOpen, setSidePanelOpen] = useState(true);
  const [agentPrompt, setAgentPrompt] = useState<{ id: string; prompt: string; tabId: number } | null>(null);

  const activeTab = useMemo(
    () => snapshot.tabs.find((tab) => tab.id === snapshot.activeTabId) ?? null,
    [snapshot.activeTabId, snapshot.tabs]
  );

  const syncBrowserBounds = useCallback(() => {
    const node = browserAreaRef.current;
    if (!node) {
      return;
    }

    const rect = node.getBoundingClientRect();
    void window.overthink.browser.setBounds({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height
    });
  }, []);

  useEffect(() => {
    let disposed = false;

    window.overthink.tabs.getState().then((nextSnapshot) => {
      if (!disposed) {
        setSnapshot(nextSnapshot);
      }
    });

    const unsubscribe = window.overthink.tabs.onState(setSnapshot);

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    return window.overthink.home.onAgentPrompt((event: HomeAgentPromptEvent) => {
      setSidePanelOpen(true);
      setAgentPrompt({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        prompt: event.prompt,
        tabId: event.tabId
      });
    });
  }, []);

  useEffect(() => {
    setAddressValue(activeTab?.url ?? "");
  }, [activeTab?.id, activeTab?.url]);

  useEffect(() => {
    syncBrowserBounds();
    const observer = new ResizeObserver(syncBrowserBounds);
    if (browserAreaRef.current) {
      observer.observe(browserAreaRef.current);
    }
    window.addEventListener("resize", syncBrowserBounds);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncBrowserBounds);
    };
  }, [sidePanelOpen, syncBrowserBounds]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isMod = event.ctrlKey || event.metaKey;
      if (!isMod) {
        return;
      }

      if (event.key.toLowerCase() === "l") {
        event.preventDefault();
        addressInputRef.current?.focus();
        addressInputRef.current?.select();
      }

      if (event.key.toLowerCase() === "t") {
        event.preventDefault();
        void window.overthink.tabs.create();
      }

      if (event.key.toLowerCase() === "w" && activeTab) {
        event.preventDefault();
        void window.overthink.tabs.close(activeTab.id);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTab]);

  const navigateActiveTab = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeTab) {
      void window.overthink.tabs.create(addressValue);
      return;
    }

    void window.overthink.tabs.navigate(activeTab.id, addressValue);
  };

  const runTabCommand = (command: (tab: BrowserTabState) => Promise<TabsSnapshot>) => {
    if (!activeTab) {
      return;
    }
    void command(activeTab);
  };

  return (
    <div className="app-shell">
      <header className="top-chrome">
        <div className="window-brand" title={APP_NAME}>
          <span className="window-brand-mark">O</span>
          <span className="window-brand-name">{APP_NAME}</span>
        </div>
        <div className="tab-strip" role="tablist">
          {snapshot.tabs.map((tab) => (
            <div
              aria-selected={tab.id === snapshot.activeTabId}
              className={`tab-item ${tab.id === snapshot.activeTabId ? "active" : ""}`}
              key={tab.id}
              onClick={() => void window.overthink.tabs.activate(tab.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  void window.overthink.tabs.activate(tab.id);
                }
              }}
              role="tab"
              tabIndex={0}
              title={tab.title || tab.url}
            >
              {tab.favicon ? <img alt="" className="tab-favicon" src={tab.favicon} /> : <span className="tab-dot" />}
              <span className="tab-title">{tab.title || tab.url || "New tab"}</span>
              <span className={tab.isLoading ? "tab-loading active" : "tab-loading"} />
              <button
                aria-label="Close tab"
                className="tab-close"
                onClick={(event) => {
                  event.stopPropagation();
                  void window.overthink.tabs.close(tab.id);
                }}
                title="Close"
                type="button"
              >
                <X size={14} />
              </button>
            </div>
          ))}
          <button
            aria-label="New tab"
            className="icon-button new-tab-button"
            onClick={() => void window.overthink.tabs.create()}
            title="New tab"
            type="button"
          >
            <Plus size={16} />
          </button>
        </div>
      </header>

      <div className="toolbar">
        <button
          aria-label="Back"
          className="icon-button"
          disabled={!activeTab?.canGoBack}
          onClick={() => runTabCommand((tab) => window.overthink.tabs.goBack(tab.id))}
          title="Back"
          type="button"
        >
          <ArrowLeft size={17} />
        </button>
        <button
          aria-label="Forward"
          className="icon-button"
          disabled={!activeTab?.canGoForward}
          onClick={() => runTabCommand((tab) => window.overthink.tabs.goForward(tab.id))}
          title="Forward"
          type="button"
        >
          <ArrowRight size={17} />
        </button>
        <button
          aria-label="Reload"
          className="icon-button"
          onClick={() => runTabCommand((tab) => window.overthink.tabs.reload(tab.id))}
          title="Reload"
          type="button"
        >
          <RefreshCw size={16} />
        </button>
        <button
          aria-label="Home"
          className="icon-button"
          onClick={() => runTabCommand((tab) => window.overthink.tabs.home(tab.id))}
          title="Home"
          type="button"
        >
          <Home size={16} />
        </button>

        <form className="address-form" onSubmit={navigateActiveTab}>
          <Search className="address-icon" size={16} />
          <input
            aria-label="Address bar"
            className="address-input"
            onChange={(event) => setAddressValue(event.target.value)}
            placeholder="Search or enter address"
            ref={addressInputRef}
            spellCheck={false}
            value={addressValue}
          />
        </form>

        <button
          aria-label="Overthink"
          className={`icon-button panel-toggle ${sidePanelOpen ? "active" : ""}`}
          onClick={() => setSidePanelOpen((open) => !open)}
          title="Overthink"
          type="button"
        >
          <PanelRight size={17} />
        </button>
      </div>

      <main className={sidePanelOpen ? "workspace with-panel" : "workspace"}>
        <section className="browser-pane">
          <div className="browser-native-view" ref={browserAreaRef} />
        </section>

        {sidePanelOpen ? (
          <aside className="overthink-pane">
            <div className="overthink-pane-header">
              <div className="overthink-brand">
                <BrainCircuit size={18} />
                <span>{APP_NAME}</span>
              </div>
              <button
                aria-label="Settings"
                className="icon-button"
                onClick={() => window.dispatchEvent(new CustomEvent("overthink:open-section", { detail: "settings" }))}
                title="Settings"
                type="button"
              >
                <Settings size={16} />
              </button>
            </div>
            <OverthinkSidePanel activeTab={activeTab} agentPrompt={agentPrompt} />
          </aside>
        ) : null}
      </main>
    </div>
  );
}
