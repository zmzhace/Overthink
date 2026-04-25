import type { WebContents } from "electron";
import { randomUUID } from "node:crypto";

import { IPC_CHANNELS } from "@/shared/ipc";
import type {
  AgentStepEvent,
  AgentTaskRequest,
  ApprovalRequest,
  OverthinkTask,
  OverthinkTaskStep,
  ToolCallName,
  ToolCallRequest,
  ToolCallResult,
  ToolRiskLevel
} from "@/shared/overthink";

import type { OverthinkModelService } from "./overthink-model-service";
import type { OverthinkStorage } from "./overthink-storage";
import type { OverthinkTabs } from "./overthink-tabs";

const TASKS_KEY = "overthinkTasks";
const LOW_RISK_TOOLS = new Set<ToolCallName>([
  "read_page",
  "capture_screenshot",
  "search_web",
  "extract_links",
  "scroll",
  "wait_for_page",
  "recall_search"
]);

export class OverthinkAgentRuntime {
  private readonly activeTasks = new Map<string, AbortController>();
  private readonly liveSenders = new Map<string, WebContents>();

  constructor(
    private readonly tabs: OverthinkTabs,
    private readonly storage: OverthinkStorage,
    private readonly modelService: OverthinkModelService
  ) {}

  list(): OverthinkTask[] {
    return this.readTasks();
  }

  get(taskId: string): OverthinkTask | null {
    return this.readTasks().find((task) => task.id === taskId) ?? null;
  }

  start(sender: WebContents, request: AgentTaskRequest): string {
    const task = this.createTask(request);
    const controller = new AbortController();
    this.activeTasks.set(task.id, controller);
    this.liveSenders.set(task.id, sender);
    this.saveTask(task);

    void this.run(sender, task, controller).finally(() => {
      this.activeTasks.delete(task.id);
    });

    return task.id;
  }

  stop(taskId: string): void {
    this.activeTasks.get(taskId)?.abort();
    const task = this.get(taskId);
    if (task) {
      this.updateTask({ ...task, status: "stopped", updatedAt: new Date().toISOString() });
    }
  }

  async approve(taskId: string, approvalId: string): Promise<OverthinkTask | null> {
    const task = this.get(taskId);
    if (!task) {
      return null;
    }

    const approval = task.approvals.find((item) => item.id === approvalId);
    if (!approval || approval.status !== "pending") {
      return task;
    }

    approval.status = "approved";
    approval.decidedAt = new Date().toISOString();
    const running = this.updateTask({
      ...task,
      status: "running",
      updatedAt: new Date().toISOString(),
      steps: [...task.steps, this.step("approval", "Approved", approval.detail)]
    });

    const sender = this.liveSenders.get(taskId);
    const nextTask = await this.executeActions(sender, running, approval.actions);
    return this.completeIfNoPending(sender, nextTask);
  }

  async reject(taskId: string, approvalId: string): Promise<OverthinkTask | null> {
    const task = this.get(taskId);
    if (!task) {
      return null;
    }

    const approval = task.approvals.find((item) => item.id === approvalId);
    if (!approval || approval.status !== "pending") {
      return task;
    }

    approval.status = "rejected";
    approval.decidedAt = new Date().toISOString();
    const nextTask = this.updateTask({
      ...task,
      status: "paused",
      updatedAt: new Date().toISOString(),
      steps: [...task.steps, this.step("approval", "Rejected", approval.detail)]
    });
    this.emit(this.liveSenders.get(taskId), {
      taskId,
      type: "stopped",
      title: "Approval rejected",
      detail: "The task was paused.",
      task: nextTask
    });
    return nextTask;
  }

  private async run(sender: WebContents, task: OverthinkTask, controller: AbortController): Promise<void> {
    this.emit(sender, { taskId: task.id, type: "start", title: "Task started", detail: task.objective, task });

    try {
      let nextTask = this.updateTask({ ...task, status: "running", updatedAt: new Date().toISOString() });
      const snapshot = this.tabs.getSnapshot();
      const tab = snapshot.tabs.find((item) => item.id === (task.tabId ?? snapshot.activeTabId)) ?? null;
      nextTask = this.appendStep(nextTask, "thought", "Current tab", tab ? `${tab.title || tab.url}\n${tab.url}` : "No active tab.");
      this.emit(sender, { taskId: task.id, type: "step", title: "Current tab", detail: tab?.url, tab, task: nextTask });

      this.assertRunning(controller);
      const actions = await this.planActions(nextTask);
      const lowRiskActions = actions.filter((action) => this.canAutoApprove(action));
      const gatedActions = actions.filter((action) => !this.canAutoApprove(action));

      if (lowRiskActions.length) {
        const approval = this.makeApproval(nextTask.id, lowRiskActions, "Low-risk browser context actions", "auto_approved");
        approval.autoReason = "Read-only or reversible navigation support action.";
        nextTask = this.updateTask({
          ...nextTask,
          approvals: [...nextTask.approvals, approval],
          steps: [...nextTask.steps, this.step("approval", "Auto approved", approval.detail)]
        });
        nextTask = await this.executeActions(sender, nextTask, lowRiskActions);
      }

      if (gatedActions.length) {
        const approval = this.makeApproval(nextTask.id, gatedActions, "Approve browser actions", "pending");
        nextTask = this.updateTask({
          ...nextTask,
          status: "awaiting_approval",
          approvals: [...nextTask.approvals, approval],
          steps: [...nextTask.steps, this.step("approval", approval.title, approval.detail)],
          updatedAt: new Date().toISOString()
        });
        this.emit(sender, {
          taskId: nextTask.id,
          type: "approval",
          title: approval.title,
          detail: approval.detail,
          approval,
          task: nextTask
        });
        return;
      }

      await this.completeIfNoPending(sender, nextTask);
    } catch (error) {
      if (controller.signal.aborted) {
        this.emit(sender, { taskId: task.id, type: "stopped", title: "Stopped" });
        return;
      }

      const failedTask = this.updateTask({
        ...task,
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
        updatedAt: new Date().toISOString(),
        steps: [...task.steps, this.step("error", "Task failed", error instanceof Error ? error.message : "Unknown error")]
      });
      this.emit(sender, {
        taskId: task.id,
        type: "error",
        title: "Task failed",
        detail: failedTask.error,
        task: failedTask
      });
    }
  }

  private async planActions(task: OverthinkTask): Promise<ToolCallRequest[]> {
    const brief = await this.tabs.capturePageBrief(task.tabId);
    const recall = this.modelService.searchRecall(`${task.objective}\n${brief.title}\n${brief.excerpt}`, 4);
    const prompt = [
      "Create a browser task plan for Overthink.",
      "Return only JSON with shape {\"actions\":[{\"name\":\"read_page|capture_screenshot|search_web|open_url|extract_links|click|type|scroll|press_key|wait_for_page|recall_search\",\"args\":{},\"risk\":\"low|medium|high\",\"reason\":\"...\"}]}",
      "Prefer read-only actions first. Use click/type/open_url only when required.",
      `Objective: ${task.objective}`,
      `Current page: ${brief.title}\n${brief.url}\n${brief.excerpt.slice(0, 1200)}`,
      recall.length ? `Relevant recall:\n${recall.map((item) => item.text).join("\n")}` : "No relevant recall."
    ].join("\n\n");

    try {
      const content = await this.modelService.completeText({
        sessionId: task.id,
        messages: [{ role: "user", content: prompt }],
        context: { pageBrief: brief }
      });
      const parsed = this.parsePlan(content);
      if (parsed.length) {
        return parsed;
      }
    } catch {
      // Heuristic fallback below keeps the agent usable without model access.
    }

    return [
      {
        id: randomUUID(),
        name: "read_page",
        args: {},
        risk: "low",
        reason: "Understand the current page before acting."
      },
      {
        id: randomUUID(),
        name: "recall_search",
        args: { query: task.objective },
        risk: "low",
        reason: "Find related local memory."
      }
    ];
  }

  private parsePlan(content: string): ToolCallRequest[] {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) {
      return [];
    }

    try {
      const parsed = JSON.parse(match[0]) as { actions?: Array<Record<string, unknown>> };
      return (parsed.actions ?? []).flatMap((action) => {
        const name = this.toolName(action.name);
        if (!name) {
          return [];
        }

        return [
          {
            id: randomUUID(),
            name,
            args: action.args && typeof action.args === "object" ? (action.args as Record<string, unknown>) : {},
            risk: this.risk(action.risk),
            reason: typeof action.reason === "string" ? action.reason : `Run ${name}.`
          }
        ];
      });
    } catch {
      return [];
    }
  }

  private async executeActions(
    sender: WebContents | undefined,
    task: OverthinkTask,
    actions: ToolCallRequest[]
  ): Promise<OverthinkTask> {
    let nextTask = task;

    for (const action of actions) {
      const result = await this.executeTool(nextTask, action);
      nextTask = this.updateTask({
        ...nextTask,
        toolResults: [...nextTask.toolResults, result],
        steps: [...nextTask.steps, this.step(result.ok ? "tool" : "error", action.name, result.summary)],
        updatedAt: new Date().toISOString()
      });
      this.emit(sender, {
        taskId: nextTask.id,
        type: "step",
        title: action.name,
        detail: result.summary,
        task: nextTask
      });
    }

    return nextTask;
  }

  private async executeTool(task: OverthinkTask, action: ToolCallRequest): Promise<ToolCallResult> {
    try {
      if (action.name === "read_page") {
        const brief = await this.tabs.capturePageBrief(task.tabId);
        return this.result(action, true, `${brief.wordCount} words, ${brief.headings.length} headings.`, brief);
      }

      if (action.name === "capture_screenshot") {
        const dataUrl = await this.tabs.captureActiveTab();
        return this.result(action, Boolean(dataUrl), dataUrl ? "Screenshot captured." : "No active tab to capture.", {
          dataUrl
        });
      }

      if (action.name === "recall_search") {
        const query = this.stringArg(action.args.query) || task.objective;
        const items = this.modelService.searchRecall(query, 6);
        return this.result(action, true, `${items.length} recall items found.`, items);
      }

      if (action.name === "extract_links") {
        const brief = await this.tabs.capturePageBrief(task.tabId);
        return this.result(action, true, `${brief.links.length} links captured.`, brief.links);
      }

      if (action.name === "scroll") {
        await this.tabs.debuggerScroll(task.tabId, this.numberArg(action.args.deltaX), this.numberArg(action.args.deltaY) ?? 520, undefined, undefined);
        return this.result(action, true, "Scrolled page.");
      }

      if (action.name === "click") {
        await this.tabs.debuggerClick(task.tabId, this.numberArg(action.args.x) ?? 0, this.numberArg(action.args.y) ?? 0);
        return this.result(action, true, "Clicked page.");
      }

      if (action.name === "type") {
        await this.tabs.debuggerType(task.tabId, this.stringArg(action.args.text));
        return this.result(action, true, "Typed text.");
      }

      if (action.name === "press_key") {
        await this.tabs.debuggerKey(task.tabId, this.stringArg(action.args.key) || "Enter");
        return this.result(action, true, "Pressed key.");
      }

      if (action.name === "open_url") {
        const url = this.stringArg(action.args.url);
        if (!url) {
          throw new Error("open_url requires args.url.");
        }
        const snapshot = await this.tabs.navigate(task.tabId ?? this.tabs.getSnapshot().activeTabId ?? 0, url);
        return this.result(action, true, `Opened ${url}.`, snapshot);
      }

      if (action.name === "search_web") {
        const query = this.stringArg(action.args.query) || task.objective;
        const snapshot = await this.tabs.createTab(`https://www.bing.com/search?q=${encodeURIComponent(query)}`);
        return this.result(action, true, `Searched web for ${query}.`, snapshot);
      }

      if (action.name === "wait_for_page") {
        await this.delay(this.numberArg(action.args.ms) ?? 1000);
        return this.result(action, true, "Waited for page.");
      }

      return this.result(action, false, `${action.name} is not available in this runtime.`);
    } catch (error) {
      return this.result(action, false, error instanceof Error ? error.message : "Tool failed.");
    }
  }

  private async completeIfNoPending(sender: WebContents | undefined, task: OverthinkTask): Promise<OverthinkTask> {
    const pending = task.approvals.some((approval) => approval.status === "pending");
    if (pending) {
      return task;
    }

    let finalAnswer = "Task completed.";
    try {
      finalAnswer = await this.modelService.completeText({
        sessionId: task.id,
        messages: [
          {
            role: "user",
            content: [
              `Summarize this browser task result for the user: ${task.objective}`,
              task.toolResults.map((result) => `${result.name}: ${result.summary}`).join("\n")
            ].join("\n\n")
          }
        ]
      });
    } catch {
      // Keep local summary when model access is not configured.
    }

    const completed = this.updateTask({
      ...task,
      status: "completed",
      finalAnswer,
      steps: [...task.steps, this.step("result", "Complete", finalAnswer)],
      updatedAt: new Date().toISOString()
    });
    this.emit(sender, {
      taskId: task.id,
      type: "complete",
      title: "Complete",
      detail: finalAnswer,
      task: completed
    });
    return completed;
  }

  private createTask(request: AgentTaskRequest): OverthinkTask {
    const now = new Date().toISOString();
    return {
      id: randomUUID(),
      objective: request.objective.trim(),
      status: "queued",
      tabId: request.tabId,
      steps: [],
      approvals: [],
      toolResults: [],
      syncState: "local",
      createdAt: now,
      updatedAt: now
    };
  }

  private makeApproval(
    taskId: string,
    actions: ToolCallRequest[],
    title: string,
    status: ApprovalRequest["status"]
  ): ApprovalRequest {
    return {
      id: randomUUID(),
      taskId,
      title,
      detail: actions.map((action) => `${action.name}: ${action.reason}`).join("\n"),
      risk: actions.reduce<ToolRiskLevel>((highest, action) => this.maxRisk(highest, action.risk), "low"),
      actions,
      status,
      createdAt: new Date().toISOString(),
      decidedAt: status === "pending" ? undefined : new Date().toISOString()
    };
  }

  private canAutoApprove(action: ToolCallRequest): boolean {
    return action.risk === "low" && LOW_RISK_TOOLS.has(action.name);
  }

  private maxRisk(left: ToolRiskLevel, right: ToolRiskLevel): ToolRiskLevel {
    const weights: Record<ToolRiskLevel, number> = { low: 1, medium: 2, high: 3 };
    return weights[right] > weights[left] ? right : left;
  }

  private appendStep(task: OverthinkTask, type: OverthinkTaskStep["type"], title: string, detail: string): OverthinkTask {
    return this.updateTask({
      ...task,
      steps: [...task.steps, this.step(type, title, detail)],
      updatedAt: new Date().toISOString()
    });
  }

  private step(type: OverthinkTaskStep["type"], title: string, detail: string): OverthinkTaskStep {
    return {
      id: randomUUID(),
      type,
      title,
      detail,
      createdAt: new Date().toISOString()
    };
  }

  private result(action: ToolCallRequest, ok: boolean, summary: string, data?: unknown): ToolCallResult {
    return {
      id: randomUUID(),
      callId: action.id,
      name: action.name,
      ok,
      summary,
      data,
      error: ok ? undefined : summary,
      createdAt: new Date().toISOString()
    };
  }

  private toolName(value: unknown): ToolCallName | null {
    const names: ToolCallName[] = [
      "read_page",
      "capture_screenshot",
      "search_web",
      "open_url",
      "extract_links",
      "click",
      "type",
      "scroll",
      "press_key",
      "wait_for_page",
      "attach_document",
      "recall_search"
    ];
    return typeof value === "string" && names.includes(value as ToolCallName) ? (value as ToolCallName) : null;
  }

  private risk(value: unknown): ToolRiskLevel {
    return value === "high" || value === "medium" || value === "low" ? value : "medium";
  }

  private readTasks(): OverthinkTask[] {
    const stored = this.storage.get("local", TASKS_KEY) as { overthinkTasks?: OverthinkTask[] };
    return Array.isArray(stored.overthinkTasks) ? stored.overthinkTasks : [];
  }

  private saveTask(task: OverthinkTask): OverthinkTask {
    const tasks = [task, ...this.readTasks().filter((item) => item.id !== task.id)].slice(0, 100);
    this.storage.set("local", { [TASKS_KEY]: tasks });
    return task;
  }

  private updateTask(task: OverthinkTask): OverthinkTask {
    return this.saveTask(task);
  }

  private assertRunning(controller: AbortController): void {
    if (controller.signal.aborted) {
      throw new Error("Stopped");
    }
  }

  private stringArg(value: unknown): string {
    return typeof value === "string" ? value : "";
  }

  private numberArg(value: unknown): number | undefined {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  private emit(sender: WebContents | undefined, event: AgentStepEvent): void {
    if (sender && !sender.isDestroyed()) {
      sender.send(IPC_CHANNELS.agentEvent, event);
    }
  }
}
