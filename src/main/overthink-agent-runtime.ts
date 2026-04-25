import type { WebContents } from "electron";
import { randomUUID } from "node:crypto";

import { IPC_CHANNELS } from "@/shared/ipc";
import type { AgentStepEvent, AgentTaskRequest } from "@/shared/overthink";

import type { OverthinkTabs } from "./overthink-tabs";

export class OverthinkAgentRuntime {
  private readonly activeTasks = new Map<string, AbortController>();

  constructor(private readonly tabs: OverthinkTabs) {}

  start(sender: WebContents, request: AgentTaskRequest): string {
    const taskId = randomUUID();
    const controller = new AbortController();
    this.activeTasks.set(taskId, controller);

    void this.run(sender, taskId, request, controller).finally(() => {
      this.activeTasks.delete(taskId);
    });

    return taskId;
  }

  stop(taskId: string): void {
    this.activeTasks.get(taskId)?.abort();
  }

  private async run(
    sender: WebContents,
    taskId: string,
    request: AgentTaskRequest,
    controller: AbortController
  ): Promise<void> {
    const objective = request.objective.trim();
    this.emit(sender, {
      taskId,
      type: "start",
      title: "Task started",
      detail: objective
    });

    try {
      const snapshot = this.tabs.getSnapshot();
      const tab = snapshot.tabs.find((item) => item.id === (request.tabId ?? snapshot.activeTabId)) ?? null;
      this.assertRunning(controller);
      this.emit(sender, {
        taskId,
        type: "step",
        title: "Current tab",
        detail: tab ? `${tab.title || tab.url}\n${tab.url}` : "No active tab.",
        tab
      });

      this.assertRunning(controller);
      const brief = await this.tabs.capturePageBrief(request.tabId);
      this.emit(sender, {
        taskId,
        type: "step",
        title: "Page state",
        detail: `${brief.wordCount} words, ${brief.headings.length} headings, ${brief.links.length} links.`
      });

      this.assertRunning(controller);
      this.emit(sender, {
        taskId,
        type: "step",
        title: "Available tools",
        detail: "read page, click, type, scroll, press key, screenshot, open tabs"
      });

      this.assertRunning(controller);
      this.emit(sender, {
        taskId,
        type: "complete",
        title: "Ready",
        detail: "Planning model calls are enabled after Model Settings are configured."
      });
    } catch (error) {
      if (controller.signal.aborted) {
        this.emit(sender, { taskId, type: "stopped", title: "Stopped" });
        return;
      }

      this.emit(sender, {
        taskId,
        type: "error",
        title: "Task failed",
        detail: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }

  private assertRunning(controller: AbortController): void {
    if (controller.signal.aborted) {
      throw new Error("Stopped");
    }
  }

  private emit(sender: WebContents, event: AgentStepEvent): void {
    if (!sender.isDestroyed()) {
      sender.send(IPC_CHANNELS.agentEvent, event);
    }
  }
}
