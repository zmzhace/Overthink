import type { WebContents } from "electron";
import { randomUUID } from "node:crypto";

import { IPC_CHANNELS } from "@/shared/ipc";
import type {
  ChatStreamEvent,
  ChatStreamRequest,
  ModelProviderConfig,
  ModelProviderDraft,
  ModelSettingsState,
  ModelTestRequest,
  ModelTestResult
} from "@/shared/overthink";

import type { OverthinkStorage } from "./overthink-storage";

const SETTINGS_KEY = "modelSettings";

const emptySettings = (): ModelSettingsState => ({
  providers: [],
  activeProviderId: null,
  activeVisionProviderId: null
});

interface OpenAiMessage {
  role: "system" | "user" | "assistant";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >;
}

export class OverthinkModelService {
  private readonly activeStreams = new Map<string, AbortController>();

  constructor(private readonly storage: OverthinkStorage) {}

  getSettings(): ModelSettingsState {
    const storedValues = this.storage.get("local", SETTINGS_KEY) as { modelSettings?: ModelSettingsState };
    const stored = storedValues.modelSettings;
    if (!stored || !Array.isArray(stored.providers)) {
      return emptySettings();
    }

    return {
      providers: stored.providers.map((provider) => this.normalizeProvider(provider)),
      activeProviderId: stored.activeProviderId ?? null,
      activeVisionProviderId: stored.activeVisionProviderId ?? null
    };
  }

  saveSettings(settings: ModelSettingsState): ModelSettingsState {
    const providers = settings.providers.map((provider) => this.normalizeProvider(provider));
    const providerIds = new Set(providers.map((provider) => provider.id));
    const activeProviderId =
      settings.activeProviderId && providerIds.has(settings.activeProviderId) ? settings.activeProviderId : providers[0]?.id ?? null;
    const activeVisionProviderId =
      settings.activeVisionProviderId && providerIds.has(settings.activeVisionProviderId)
        ? settings.activeVisionProviderId
        : activeProviderId;
    const nextSettings: ModelSettingsState = {
      providers,
      activeProviderId,
      activeVisionProviderId
    };

    this.storage.set("local", { [SETTINGS_KEY]: nextSettings });
    return nextSettings;
  }

  async test(request: ModelTestRequest): Promise<ModelTestResult> {
    const provider = this.normalizeDraft(request.provider);
    const startedAt = Date.now();

    if (!provider.baseUrl || !provider.chatModel) {
      return {
        ok: false,
        status: null,
        message: "Base URL and chat model are required.",
        latencyMs: Date.now() - startedAt
      };
    }

    if (request.mode === "vision" && !provider.visionModel) {
      return {
        ok: false,
        status: null,
        message: "Vision model is not configured.",
        latencyMs: Date.now() - startedAt
      };
    }

    try {
      const response = await fetch(this.chatCompletionsUrl(provider.baseUrl), {
        method: "POST",
        headers: this.headers(provider),
        body: JSON.stringify({
          model: request.mode === "vision" ? provider.visionModel : provider.chatModel,
          messages: [{ role: "user", content: "Reply with OK." }],
          max_tokens: 8,
          stream: false
        })
      });
      const latencyMs = Date.now() - startedAt;
      const bodyText = await response.text();

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          message: this.formatHttpError(response.status, bodyText),
          latencyMs
        };
      }

      const content = this.extractMessageFromJson(bodyText);
      if (!content) {
        return {
          ok: false,
          status: response.status,
          message: "Endpoint responded, but the response was not OpenAI-compatible.",
          latencyMs
        };
      }

      return {
        ok: true,
        status: response.status,
        message: `Connected. ${content}`,
        latencyMs
      };
    } catch (error) {
      return {
        ok: false,
        status: null,
        message: error instanceof Error ? error.message : "Network request failed.",
        latencyMs: Date.now() - startedAt
      };
    }
  }

  startChat(sender: WebContents, request: ChatStreamRequest): string {
    const settings = this.getSettings();
    const provider = this.resolveProvider(settings, request.providerId ?? settings.activeProviderId);

    if (!provider) {
      throw new Error("Model Settings are required before Think Chat can call a model.");
    }

    const streamId = randomUUID();
    const controller = new AbortController();
    this.activeStreams.set(streamId, controller);

    void this.runChatStream(sender, streamId, provider, request, controller).finally(() => {
      this.activeStreams.delete(streamId);
    });

    return streamId;
  }

  stopChat(streamId: string): void {
    this.activeStreams.get(streamId)?.abort();
  }

  private async runChatStream(
    sender: WebContents,
    streamId: string,
    provider: ModelProviderConfig,
    request: ChatStreamRequest,
    controller: AbortController
  ): Promise<void> {
    this.emit(sender, { streamId, type: "start" });

    try {
      const hasScreenshot = Boolean(request.context?.screenshotDataUrl);
      const model = hasScreenshot && provider.visionModel ? provider.visionModel : provider.chatModel;
      const response = await fetch(this.chatCompletionsUrl(provider.baseUrl), {
        method: "POST",
        headers: this.headers(provider),
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages: this.buildMessages(provider, request),
          temperature: 0.4,
          stream: true
        })
      });

      if (!response.ok) {
        this.emit(sender, {
          streamId,
          type: "error",
          message: this.formatHttpError(response.status, await response.text())
        });
        return;
      }

      if (!response.body) {
        this.emit(sender, { streamId, type: "error", message: "Endpoint did not return a readable stream." });
        return;
      }

      await this.readStream(sender, streamId, response);
    } catch (error) {
      if (controller.signal.aborted) {
        this.emit(sender, { streamId, type: "stopped", message: "Stopped." });
        return;
      }

      this.emit(sender, {
        streamId,
        type: "error",
        message: error instanceof Error ? error.message : "Chat request failed."
      });
    }
  }

  private async readStream(sender: WebContents, streamId: string, response: Response): Promise<void> {
    const contentType = response.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const content = this.extractMessageFromJson(await response.text());
      if (content) {
        this.emit(sender, { streamId, type: "delta", delta: content });
        this.emit(sender, { streamId, type: "complete" });
        return;
      }
    }

    const reader = response.body?.getReader();
    if (!reader) {
      this.emit(sender, { streamId, type: "error", message: "Endpoint did not return a readable stream." });
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let completed = false;

    while (!completed) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith("data:")) {
          continue;
        }

        const data = line.slice(5).trim();
        if (data === "[DONE]") {
          completed = true;
          break;
        }

        const delta = this.extractDelta(data);
        if (delta) {
          this.emit(sender, { streamId, type: "delta", delta });
        }
      }
    }

    this.emit(sender, { streamId, type: "complete" });
  }

  private buildMessages(provider: ModelProviderConfig, request: ChatStreamRequest): OpenAiMessage[] {
    const context = request.context;
    const messages: OpenAiMessage[] = [
      {
        role: "system",
        content:
          "You are Overthink Agent inside a desktop browser. Use page context when provided, answer directly, and call out uncertainty."
      }
    ];

    if (context?.pageBrief) {
      const brief = context.pageBrief;
      messages.push({
        role: "system",
        content: [
          `Page Brief: ${brief.title}`,
          `URL: ${brief.url}`,
          brief.description ? `Description: ${brief.description}` : "",
          brief.headings.length > 0 ? `Headings: ${brief.headings.map((heading) => heading.text).join(" | ")}` : "",
          brief.selectedText ? `Selection: ${brief.selectedText}` : `Excerpt: ${brief.excerpt}`,
          brief.frames.length > 0 ? `Frame excerpts: ${brief.frames.map((frame) => frame.text).join("\n")}` : ""
        ]
          .filter(Boolean)
          .join("\n")
      });
    }

    if (context?.documents?.length) {
      messages.push({
        role: "system",
        content: context.documents
          .map((document) => `Document ${document.name}:\n${document.text.slice(0, 4000)}`)
          .join("\n\n")
      });
    }

    request.messages.forEach((message, index) => {
      const isLastUser = message.role === "user" && index === request.messages.length - 1;
      const screenshotDataUrl = context?.screenshotDataUrl;

      if (isLastUser && screenshotDataUrl && provider.visionModel) {
        messages.push({
          role: "user",
          content: [
            { type: "text", text: message.content },
            { type: "image_url", image_url: { url: screenshotDataUrl } }
          ]
        });
        return;
      }

      if (isLastUser && screenshotDataUrl && !provider.visionModel) {
        messages.push({
          role: "system",
          content: "A screenshot was captured locally, but no vision model is configured."
        });
      }

      messages.push({
        role: message.role === "system" ? "system" : message.role === "assistant" ? "assistant" : "user",
        content: message.content
      });
    });

    return messages;
  }

  private resolveProvider(settings: ModelSettingsState, providerId?: string | null): ModelProviderConfig | null {
    return settings.providers.find((provider) => provider.id === providerId && provider.enabled) ?? null;
  }

  private normalizeProvider(provider: ModelProviderConfig): ModelProviderConfig {
    const now = new Date().toISOString();
    return {
      id: provider.id || randomUUID(),
      name: provider.name.trim() || "OpenAI-compatible",
      kind: "openai-compatible",
      baseUrl: provider.baseUrl.trim(),
      apiKey: provider.apiKey,
      chatModel: provider.chatModel.trim(),
      visionModel: provider.visionModel.trim(),
      enabled: provider.enabled,
      createdAt: provider.createdAt || now,
      updatedAt: now
    };
  }

  private normalizeDraft(provider: ModelProviderDraft): ModelProviderConfig {
    const now = new Date().toISOString();
    return {
      id: provider.id || randomUUID(),
      name: provider.name.trim() || "OpenAI-compatible",
      kind: "openai-compatible",
      baseUrl: provider.baseUrl.trim(),
      apiKey: provider.apiKey.trim(),
      chatModel: provider.chatModel.trim(),
      visionModel: provider.visionModel.trim(),
      enabled: provider.enabled,
      createdAt: now,
      updatedAt: now
    };
  }

  private chatCompletionsUrl(baseUrl: string): string {
    const trimmed = baseUrl.trim().replace(/\/+$/, "");
    return trimmed.endsWith("/chat/completions") ? trimmed : `${trimmed}/chat/completions`;
  }

  private headers(provider: ModelProviderConfig): HeadersInit {
    const headers: HeadersInit = {
      "content-type": "application/json"
    };

    if (provider.apiKey) {
      headers.authorization = `Bearer ${provider.apiKey}`;
    }

    return headers;
  }

  private extractDelta(data: string): string {
    try {
      const parsed = JSON.parse(data) as {
        choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
      };
      return parsed.choices?.[0]?.delta?.content ?? parsed.choices?.[0]?.message?.content ?? "";
    } catch {
      return "";
    }
  }

  private extractMessageFromJson(bodyText: string): string {
    try {
      const parsed = JSON.parse(bodyText) as {
        choices?: Array<{ message?: { content?: string }; text?: string }>;
      };
      return parsed.choices?.[0]?.message?.content ?? parsed.choices?.[0]?.text ?? "";
    } catch {
      return "";
    }
  }

  private formatHttpError(status: number, bodyText: string): string {
    const snippet = bodyText.replace(/\s+/g, " ").trim().slice(0, 220);
    return snippet ? `HTTP ${status}: ${snippet}` : `HTTP ${status}`;
  }

  private emit(sender: WebContents, event: ChatStreamEvent): void {
    if (!sender.isDestroyed()) {
      sender.send(IPC_CHANNELS.chatEvent, event);
    }
  }
}
