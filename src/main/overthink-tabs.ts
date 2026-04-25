import { BrowserWindow, WebContentsView } from "electron";

import { IPC_CHANNELS, type BrowserBounds, type BrowserTabState, type TabsSnapshot } from "@/shared/ipc";
import type { PageBrief } from "@/shared/overthink";
import { OVERTHINK_SCHEME } from "@/shared/branding";

import { OverthinkDebugger } from "./overthink-debugger";
import { OverthinkPageRuntime } from "./overthink-page-runtime";
import { DEFAULT_HOME_URL, normalizeNavigationInput } from "./url";

interface BrowserTab extends BrowserTabState {
  view: WebContentsView;
}

const HIDDEN_BOUNDS = { x: -32000, y: -32000, width: 1, height: 1 };

export class OverthinkTabs {
  private readonly tabs = new Map<number, BrowserTab>();
  private readonly debuggerRuntime = new OverthinkDebugger();
  private readonly pageRuntime = new OverthinkPageRuntime();
  private nextTabId = 1;
  private activeTabId: number | null = null;
  private bounds: BrowserBounds = HIDDEN_BOUNDS;

  constructor(private readonly mainWindow: BrowserWindow) {}

  getSnapshot(): TabsSnapshot {
    return {
      activeTabId: this.activeTabId,
      tabs: Array.from(this.tabs.values()).map((tab) => this.toState(tab))
    };
  }

  async createTab(url = DEFAULT_HOME_URL): Promise<TabsSnapshot> {
    const id = this.nextTabId++;
    const targetUrl = normalizeNavigationInput(url);
    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true
      }
    });

    const tab: BrowserTab = {
      id,
      view,
      title: "新标签页",
      url: targetUrl,
      canGoBack: false,
      canGoForward: false,
      isLoading: false
    };

    this.tabs.set(id, tab);
    this.bindTabEvents(tab);
    this.activateTab(id);
    await this.loadTabUrl(tab, targetUrl);

    return this.broadcast();
  }

  activateTab(tabId: number): TabsSnapshot {
    if (!this.tabs.has(tabId)) {
      return this.getSnapshot();
    }

    this.activeTabId = tabId;
    this.syncActiveView();
    return this.broadcast();
  }

  closeTab(tabId: number): TabsSnapshot {
    const tab = this.tabs.get(tabId);
    if (!tab) {
      return this.getSnapshot();
    }

    this.detachView(tab.view);
    if (!tab.view.webContents.isDestroyed()) {
      tab.view.webContents.close({ waitForBeforeUnload: false });
    }
    this.tabs.delete(tabId);

    if (this.activeTabId === tabId) {
      this.activeTabId = Array.from(this.tabs.keys()).at(-1) ?? null;
    }

    if (this.tabs.size === 0) {
      void this.createTab(DEFAULT_HOME_URL);
      return this.getSnapshot();
    }

    this.syncActiveView();
    return this.broadcast();
  }

  async navigate(tabId: number, input: string): Promise<TabsSnapshot> {
    const tab = this.tabs.get(tabId);
    if (!tab) {
      return this.getSnapshot();
    }

    return this.loadTabUrl(tab, input);
  }

  async goBack(tabId: number): Promise<TabsSnapshot> {
    const tab = this.tabs.get(tabId);
    if (tab?.view.webContents.navigationHistory.canGoBack()) {
      tab.view.webContents.navigationHistory.goBack();
    }
    return this.broadcast();
  }

  async goForward(tabId: number): Promise<TabsSnapshot> {
    const tab = this.tabs.get(tabId);
    if (tab?.view.webContents.navigationHistory.canGoForward()) {
      tab.view.webContents.navigationHistory.goForward();
    }
    return this.broadcast();
  }

  async reload(tabId: number): Promise<TabsSnapshot> {
    const tab = this.tabs.get(tabId);
    tab?.view.webContents.reload();
    return this.broadcast();
  }

  async home(tabId: number): Promise<TabsSnapshot> {
    return this.navigate(tabId, DEFAULT_HOME_URL);
  }

  setBounds(bounds: BrowserBounds): void {
    this.bounds = {
      x: Math.max(0, Math.round(bounds.x)),
      y: Math.max(0, Math.round(bounds.y)),
      width: Math.max(1, Math.round(bounds.width)),
      height: Math.max(1, Math.round(bounds.height))
    };
    this.syncActiveView();
  }

  async captureActiveTab(): Promise<string | null> {
    const tab = this.getActiveTab();
    if (!tab) {
      return null;
    }

    const image = await tab.view.webContents.capturePage();
    return image.toDataURL();
  }

  async executeJavaScript<T = unknown>(tabId: number | undefined, code: string, userGesture = false): Promise<T> {
    const tab = this.resolveTab(tabId);
    if (!tab) {
      throw new Error("No active browser tab");
    }

    return this.pageRuntime.executeJavaScript<T>(tab.view.webContents, code, userGesture);
  }

  async sendDebuggerCommand<T = unknown>(
    tabId: number | undefined,
    method: string,
    params?: Record<string, unknown>,
    detachAfterCommand?: boolean
  ): Promise<T> {
    const tab = this.resolveTab(tabId);
    if (!tab) {
      throw new Error("No active browser tab");
    }

    return this.debuggerRuntime.sendCommand<T>(tab.view.webContents, method, params, detachAfterCommand);
  }

  async capturePageBrief(tabId?: number): Promise<PageBrief> {
    const tab = this.resolveTab(tabId);
    if (!tab) {
      throw new Error("No active browser tab");
    }

    return this.pageRuntime.captureBrief(tab.view.webContents);
  }

  async debuggerClick(tabId: number | undefined, x: number, y: number): Promise<void> {
    const tab = this.resolveTab(tabId);
    if (!tab) {
      throw new Error("No active browser tab");
    }

    await this.debuggerRuntime.click(tab.view.webContents, x, y);
  }

  async debuggerType(tabId: number | undefined, text: string): Promise<void> {
    const tab = this.resolveTab(tabId);
    if (!tab) {
      throw new Error("No active browser tab");
    }

    await this.debuggerRuntime.type(tab.view.webContents, text);
  }

  async debuggerScroll(
    tabId: number | undefined,
    deltaX: number | undefined,
    deltaY: number | undefined,
    x: number | undefined,
    y: number | undefined
  ): Promise<void> {
    const tab = this.resolveTab(tabId);
    if (!tab) {
      throw new Error("No active browser tab");
    }

    await this.debuggerRuntime.scroll(tab.view.webContents, deltaX, deltaY, x, y);
  }

  async debuggerKey(tabId: number | undefined, key: string): Promise<void> {
    const tab = this.resolveTab(tabId);
    if (!tab) {
      throw new Error("No active browser tab");
    }

    await this.debuggerRuntime.key(tab.view.webContents, key);
  }

  getFrames(tabId?: number): Array<{ frameId: number; url: string; name: string }> {
    const tab = this.resolveTab(tabId);
    if (!tab) {
      return [];
    }

    return tab.view.webContents.mainFrame.framesInSubtree.map((frame) => ({
      frameId: frame.frameTreeNodeId,
      url: frame.url,
      name: frame.name
    }));
  }

  destroy(): void {
    this.tabs.forEach((tab) => {
      this.detachView(tab.view);
      if (!tab.view.webContents.isDestroyed()) {
        tab.view.webContents.close({ waitForBeforeUnload: false });
      }
    });
    this.tabs.clear();
  }

  private bindTabEvents(tab: BrowserTab): void {
    const webContents = tab.view.webContents;

    webContents.setWindowOpenHandler(({ url }) => {
      if (this.sendHomeAgentPrompt(tab, url)) {
        return { action: "deny" };
      }
      void this.createTab(url);
      return { action: "deny" };
    });

    webContents.on("will-navigate", (event, url) => {
      if (this.sendHomeAgentPrompt(tab, url)) {
        event.preventDefault();
      }
    });

    const updateNavigationState = () => {
      if (webContents.isDestroyed()) {
        return;
      }

      tab.url = webContents.getURL() || tab.url;
      tab.title = webContents.getTitle() || tab.title;
      tab.canGoBack = webContents.navigationHistory.canGoBack();
      tab.canGoForward = webContents.navigationHistory.canGoForward();
      this.broadcast();
    };

    webContents.on("page-title-updated", (_event, title) => {
      tab.title = title || tab.title;
      this.broadcast();
    });
    webContents.on("page-favicon-updated", (_event, favicons) => {
      tab.favicon = favicons[0];
      this.broadcast();
    });
    webContents.on("did-start-loading", () => {
      tab.isLoading = true;
      updateNavigationState();
    });
    webContents.on("did-stop-loading", () => {
      tab.isLoading = false;
      updateNavigationState();
    });
    webContents.on("did-navigate", updateNavigationState);
    webContents.on("did-navigate-in-page", updateNavigationState);
    webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
      if (errorCode === -3 || isMainFrame === false) {
        return;
      }

      tab.isLoading = false;
      tab.title = errorDescription || "加载失败";
      tab.url = validatedUrl || tab.url;
      this.broadcast();
    });
  }

  private async loadTabUrl(tab: BrowserTab, input: string): Promise<TabsSnapshot> {
    const targetUrl = normalizeNavigationInput(input);
    tab.url = targetUrl;
    tab.isLoading = true;
    this.broadcast();

    try {
      await tab.view.webContents.loadURL(targetUrl);
    } catch (error) {
      if (this.isNavigationAbort(error)) {
        return this.broadcast();
      }

      tab.isLoading = false;
      tab.title = error instanceof Error ? error.message : "加载失败";
      this.broadcast();
    }

    return this.broadcast();
  }

  private sendHomeAgentPrompt(tab: BrowserTab, url: string): boolean {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== `${OVERTHINK_SCHEME}:` || parsed.hostname !== "agent") {
        return false;
      }

      const prompt = parsed.searchParams.get("prompt")?.trim();
      if (!prompt) {
        return true;
      }

      if (!this.mainWindow.webContents.isDestroyed()) {
        this.mainWindow.webContents.send(IPC_CHANNELS.homeAgentPrompt, {
          tabId: tab.id,
          prompt
        });
      }
      return true;
    } catch {
      return false;
    }
  }

  private isNavigationAbort(error: unknown): boolean {
    return error instanceof Error && error.message.includes("ERR_ABORTED");
  }

  private syncActiveView(): void {
    this.tabs.forEach((tab) => {
      if (tab.id !== this.activeTabId) {
        tab.view.setBounds(HIDDEN_BOUNDS);
        this.detachView(tab.view);
      }
    });

    const activeTab = this.getActiveTab();
    if (!activeTab) {
      return;
    }

    try {
      this.mainWindow.contentView.addChildView(activeTab.view);
    } catch {
      // Already attached.
    }
    activeTab.view.setBounds(this.bounds);
  }

  private detachView(view: WebContentsView): void {
    try {
      this.mainWindow.contentView.removeChildView(view);
    } catch {
      // The view may already be detached.
    }
  }

  private getActiveTab(): BrowserTab | undefined {
    return this.activeTabId == null ? undefined : this.tabs.get(this.activeTabId);
  }

  private resolveTab(tabId?: number): BrowserTab | undefined {
    if (tabId != null) {
      return this.tabs.get(tabId);
    }

    return this.getActiveTab();
  }

  private broadcast(): TabsSnapshot {
    const snapshot = this.getSnapshot();
    if (!this.mainWindow.webContents.isDestroyed()) {
      this.mainWindow.webContents.send(IPC_CHANNELS.tabsState, snapshot);
    }
    return snapshot;
  }

  private toState(tab: BrowserTab): BrowserTabState {
    return {
      id: tab.id,
      title: tab.title,
      url: tab.url,
      favicon: tab.favicon,
      canGoBack: tab.canGoBack,
      canGoForward: tab.canGoForward,
      isLoading: tab.isLoading
    };
  }
}
