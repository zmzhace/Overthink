import { BrowserWindow, dialog, session } from "electron";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { ExtensionInstallRequest, ExtensionRecord } from "@/shared/overthink";

import type { OverthinkStorage } from "./overthink-storage";

const EXTENSIONS_KEY = "extensions";

interface ExtensionManifest {
  name?: string;
  version?: string;
  manifest_version?: number;
  permissions?: string[];
  host_permissions?: string[];
}

export class OverthinkExtensionService {
  constructor(
    private readonly mainWindow: BrowserWindow,
    private readonly storage: OverthinkStorage
  ) {}

  async install(request?: ExtensionInstallRequest): Promise<ExtensionRecord | null> {
    const extensionPath = request?.path?.trim() || (await this.pickExtensionPath());
    if (!extensionPath) {
      return null;
    }

    const manifest = await this.readManifest(extensionPath);
    const now = new Date().toISOString();
    const record: ExtensionRecord = {
      id: randomUUID(),
      name: manifest.name || path.basename(extensionPath),
      version: manifest.version || "0.0.0",
      path: extensionPath,
      enabled: true,
      permissions: [...(manifest.permissions ?? []), ...(manifest.host_permissions ?? [])],
      warnings: this.warningsForManifest(manifest),
      createdAt: now,
      updatedAt: now,
      syncState: "local"
    };

    const loaded = await this.load(record);
    const nextRecord = { ...record, id: loaded?.id ?? record.id, loadedAt: loaded ? now : undefined };
    this.saveRecords([nextRecord, ...this.list().filter((item) => item.path !== extensionPath)]);
    return nextRecord;
  }

  list(): ExtensionRecord[] {
    const stored = this.storage.get("local", EXTENSIONS_KEY) as { extensions?: ExtensionRecord[] };
    return Array.isArray(stored.extensions) ? stored.extensions : [];
  }

  async loadEnabledExtensions(): Promise<void> {
    for (const record of this.list().filter((item) => item.enabled)) {
      await this.load(record);
    }
  }

  async setEnabled(extensionId: string, enabled: boolean): Promise<ExtensionRecord[]> {
    const records = this.list();
    const record = records.find((item) => item.id === extensionId);
    if (!record) {
      return records;
    }

    if (enabled) {
      await this.load(record);
    } else {
      await this.unload(record.id);
    }

    const now = new Date().toISOString();
    const next = records.map((item) =>
      item.id === extensionId ? { ...item, enabled, updatedAt: now, loadedAt: enabled ? now : item.loadedAt } : item
    );
    this.saveRecords(next);
    return next;
  }

  async remove(extensionId: string): Promise<ExtensionRecord[]> {
    await this.unload(extensionId);
    const next = this.list().filter((item) => item.id !== extensionId);
    this.saveRecords(next);
    return next;
  }

  private async pickExtensionPath(): Promise<string | null> {
    const result = await dialog.showOpenDialog(this.mainWindow, {
      title: "Install unpacked extension",
      properties: ["openDirectory"]
    });

    return result.canceled ? null : result.filePaths[0] ?? null;
  }

  private async readManifest(extensionPath: string): Promise<ExtensionManifest> {
    const manifestPath = path.join(extensionPath, "manifest.json");
    const raw = JSON.parse(await readFile(manifestPath, "utf8")) as ExtensionManifest;
    if (raw.manifest_version !== 3) {
      return { ...raw, manifest_version: raw.manifest_version };
    }
    return raw;
  }

  private warningsForManifest(manifest: ExtensionManifest): string[] {
    const warnings: string[] = [];
    if (manifest.manifest_version !== 3) {
      warnings.push("Only MV3 extensions are targeted for Overthink compatibility.");
    }
    warnings.push("Electron supports a subset of Chrome extension APIs; Overthink shims common runtime/storage/tabs/scripting/webRequest flows.");
    return warnings;
  }

  private async load(record: ExtensionRecord): Promise<Electron.Extension | null> {
    try {
      return await session.defaultSession.loadExtension(record.path, {
        allowFileAccess: true
      });
    } catch {
      return null;
    }
  }

  private async unload(extensionId: string): Promise<void> {
    try {
      const extension = session.defaultSession.getExtension(extensionId);
      if (extension) {
        await session.defaultSession.removeExtension(extension.id);
      }
    } catch {
      // Missing or already unloaded extensions are harmless.
    }
  }

  private saveRecords(records: ExtensionRecord[]): void {
    this.storage.set("local", { [EXTENSIONS_KEY]: records });
  }
}
