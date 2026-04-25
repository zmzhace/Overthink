import { BrowserWindow, dialog } from "electron";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

import type {
  ImportExportPayload,
  ImportSummary,
  ModelProviderConfig,
  ModelSettingsState,
  RecallItem,
  ThinkChatSession,
  ThinkMessage
} from "@/shared/overthink";

import type { OverthinkStorage } from "./overthink-storage";

const SETTINGS_KEY = "modelSettings";
const CHAT_KEY = "thinkChatSessions";
const RECALL_KEY = "recallItems";

export class OverthinkDataService {
  constructor(
    private readonly mainWindow: BrowserWindow,
    private readonly storage: OverthinkStorage
  ) {}

  async exportAll(): Promise<ImportSummary> {
    const local = this.storage.get("local");
    const payload: ImportExportPayload = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      modelSettings: this.coerceSettings(local[SETTINGS_KEY]),
      thinkChatSessions: this.coerceSessions(local[CHAT_KEY]),
      recallItems: this.coerceRecall(local[RECALL_KEY])
    };

    const result = await dialog.showSaveDialog(this.mainWindow, {
      title: "Export Overthink data",
      defaultPath: `overthink-export-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: "JSON", extensions: ["json"] }]
    });

    if (result.canceled || !result.filePath) {
      return this.summary(false, payload, "Export canceled.");
    }

    await writeFile(result.filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    return this.summary(true, payload, "Export complete.");
  }

  async importAll(): Promise<ImportSummary> {
    const result = await dialog.showOpenDialog(this.mainWindow, {
      title: "Import Overthink data",
      properties: ["openFile"],
      filters: [{ name: "JSON", extensions: ["json"] }]
    });

    if (result.canceled || !result.filePaths[0]) {
      return {
        imported: false,
        modelProviders: 0,
        chatSessions: 0,
        recallItems: 0,
        message: "Import canceled."
      };
    }

    const raw = JSON.parse(await readFile(result.filePaths[0], "utf8")) as Record<string, unknown>;
    const payload: ImportExportPayload = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      modelSettings: this.coerceSettings(raw.modelSettings ?? raw.settings ?? raw.models),
      thinkChatSessions: this.coerceSessions(raw.thinkChatSessions ?? raw.chatSessions ?? raw.conversations ?? raw.history),
      recallItems: this.coerceRecall(raw.recallItems ?? raw.memories ?? raw.memory)
    };

    this.storage.set("local", {
      [SETTINGS_KEY]: payload.modelSettings,
      [CHAT_KEY]: payload.thinkChatSessions,
      [RECALL_KEY]: payload.recallItems
    });

    return this.summary(true, payload, "Import complete.");
  }

  private coerceSettings(value: unknown): ModelSettingsState {
    const empty: ModelSettingsState = {
      providers: [],
      activeProviderId: null,
      activeVisionProviderId: null
    };

    if (!value || typeof value !== "object") {
      return empty;
    }

    const record = value as Record<string, unknown>;
    const rawProviders = Array.isArray(record.providers) ? record.providers : Array.isArray(value) ? value : [];
    const providers = rawProviders.flatMap((item) => this.coerceProvider(item));
    const providerIds = new Set(providers.map((provider) => provider.id));
    const activeProviderId =
      typeof record.activeProviderId === "string" && providerIds.has(record.activeProviderId)
        ? record.activeProviderId
        : providers[0]?.id ?? null;

    return {
      providers,
      activeProviderId,
      activeVisionProviderId:
        typeof record.activeVisionProviderId === "string" && providerIds.has(record.activeVisionProviderId)
          ? record.activeVisionProviderId
          : activeProviderId
    };
  }

  private coerceProvider(value: unknown): ModelProviderConfig[] {
    if (!value || typeof value !== "object") {
      return [];
    }

    const record = value as Record<string, unknown>;
    const now = new Date().toISOString();
    const baseUrl = this.stringValue(record.baseUrl ?? record.endpoint ?? record.url);
    const chatModel = this.stringValue(record.chatModel ?? record.model ?? record.modelName);

    if (!baseUrl && !chatModel) {
      return [];
    }

    return [
      {
        id: this.stringValue(record.id) || randomUUID(),
        name: this.stringValue(record.name) || "Imported model",
        kind: "openai-compatible",
        baseUrl,
        apiKey: this.stringValue(record.apiKey ?? record.key),
        chatModel,
        visionModel: this.stringValue(record.visionModel),
        enabled: typeof record.enabled === "boolean" ? record.enabled : true,
        createdAt: this.stringValue(record.createdAt) || now,
        updatedAt: now
      }
    ];
  }

  private coerceSessions(value: unknown): ThinkChatSession[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.flatMap((item) => {
      if (!item || typeof item !== "object") {
        return [];
      }

      const record = item as Record<string, unknown>;
      const messages = this.coerceMessages(record.messages);
      if (messages.length === 0) {
        return [];
      }

      return [
        {
          id: this.stringValue(record.id) || randomUUID(),
          title: this.stringValue(record.title) || messages[0]?.content.slice(0, 48) || "Imported chat",
          messages,
          pageUrl: this.stringValue(record.pageUrl ?? record.url) || undefined,
          updatedAt: this.stringValue(record.updatedAt) || new Date().toISOString()
        }
      ];
    });
  }

  private coerceMessages(value: unknown): ThinkMessage[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.flatMap((item) => {
      if (!item || typeof item !== "object") {
        return [];
      }

      const record = item as Record<string, unknown>;
      const role = this.stringValue(record.role);
      const content = this.stringValue(record.content ?? record.text ?? record.message);
      if (!content || !["system", "user", "assistant"].includes(role)) {
        return [];
      }

      return [
        {
          id: this.stringValue(record.id) || randomUUID(),
          role: role as ThinkMessage["role"],
          content,
          createdAt: this.stringValue(record.createdAt) || new Date().toISOString()
        }
      ];
    });
  }

  private coerceRecall(value: unknown): RecallItem[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.flatMap((item) => {
      if (!item || typeof item !== "object") {
        return [];
      }

      const record = item as Record<string, unknown>;
      const text = this.stringValue(record.text ?? record.content ?? record.value);
      if (!text) {
        return [];
      }

      return [
        {
          id: this.stringValue(record.id) || randomUUID(),
          text,
          source: "import",
          url: this.stringValue(record.url) || undefined,
          enabled: typeof record.enabled === "boolean" ? record.enabled : true,
          createdAt: this.stringValue(record.createdAt) || new Date().toISOString()
        }
      ];
    });
  }

  private summary(imported: boolean, payload: ImportExportPayload, message: string): ImportSummary {
    return {
      imported,
      modelProviders: payload.modelSettings.providers.length,
      chatSessions: payload.thinkChatSessions.length,
      recallItems: payload.recallItems.length,
      message
    };
  }

  private stringValue(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
  }
}
