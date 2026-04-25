import type { WebContents } from "electron";

const DEBUGGER_PROTOCOL_VERSION = "1.3";

export class OverthinkDebugger {
  async sendCommand<T = unknown>(
    webContents: WebContents,
    method: string,
    params?: Record<string, unknown>,
    detachAfterCommand = false
  ): Promise<T> {
    if (!webContents.debugger.isAttached()) {
      webContents.debugger.attach(DEBUGGER_PROTOCOL_VERSION);
    }

    try {
      return (await webContents.debugger.sendCommand(method, params)) as T;
    } finally {
      if (detachAfterCommand && webContents.debugger.isAttached()) {
        webContents.debugger.detach();
      }
    }
  }

  async click(webContents: WebContents, x: number, y: number): Promise<void> {
    const roundedX = Math.round(x);
    const roundedY = Math.round(y);
    await this.sendCommand(webContents, "Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: roundedX,
      y: roundedY,
      button: "left",
      clickCount: 1
    });
    await this.sendCommand(webContents, "Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: roundedX,
      y: roundedY,
      button: "left",
      clickCount: 1
    });
  }

  async type(webContents: WebContents, text: string): Promise<void> {
    await this.sendCommand(webContents, "Input.insertText", { text });
  }

  async scroll(webContents: WebContents, deltaX = 0, deltaY = 480, x = 120, y = 120): Promise<void> {
    await this.sendCommand(webContents, "Input.dispatchMouseEvent", {
      type: "mouseWheel",
      x: Math.round(x),
      y: Math.round(y),
      deltaX,
      deltaY
    });
  }

  async key(webContents: WebContents, key: string): Promise<void> {
    await this.sendCommand(webContents, "Input.dispatchKeyEvent", {
      type: "keyDown",
      key,
      windowsVirtualKeyCode: key.length === 1 ? key.toUpperCase().charCodeAt(0) : undefined
    });
    await this.sendCommand(webContents, "Input.dispatchKeyEvent", {
      type: "keyUp",
      key,
      windowsVirtualKeyCode: key.length === 1 ? key.toUpperCase().charCodeAt(0) : undefined
    });
  }
}
