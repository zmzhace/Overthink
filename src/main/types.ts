import type { BrowserWindow } from "electron";

import type { BrowserTabState, TabsSnapshot } from "@/shared/ipc";
import type { PageBrief } from "@/shared/overthink";

export interface BrowserTab extends BrowserTabState {
  view: Electron.WebContentsView;
}

export interface IpcContext {
  mainWindow: BrowserWindow;
  tabs: {
    getSnapshot: () => TabsSnapshot;
    createTab: (url?: string) => Promise<TabsSnapshot>;
    activateTab: (tabId: number) => TabsSnapshot;
    closeTab: (tabId: number) => TabsSnapshot;
    navigate: (tabId: number, input: string) => Promise<TabsSnapshot>;
    goBack: (tabId: number) => Promise<TabsSnapshot>;
    goForward: (tabId: number) => Promise<TabsSnapshot>;
    reload: (tabId: number) => Promise<TabsSnapshot>;
    home: (tabId: number) => Promise<TabsSnapshot>;
    setBounds: (bounds: Electron.Rectangle) => void;
    captureActiveTab: () => Promise<string | null>;
    executeJavaScript: <T = unknown>(tabId: number | undefined, code: string, userGesture?: boolean) => Promise<T>;
    sendDebuggerCommand: <T = unknown>(
      tabId: number | undefined,
      method: string,
      params?: Record<string, unknown>,
      detachAfterCommand?: boolean
    ) => Promise<T>;
    capturePageBrief: (tabId?: number) => Promise<PageBrief>;
    debuggerClick: (tabId: number | undefined, x: number, y: number) => Promise<void>;
    debuggerType: (tabId: number | undefined, text: string) => Promise<void>;
    debuggerScroll: (
      tabId: number | undefined,
      deltaX: number | undefined,
      deltaY: number | undefined,
      x: number | undefined,
      y: number | undefined
    ) => Promise<void>;
    debuggerKey: (tabId: number | undefined, key: string) => Promise<void>;
    getFrames: (tabId?: number) => Array<{ frameId: number; url: string; name: string }>;
    destroy: () => void;
  };
}
