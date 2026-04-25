import type {
  SkillInstallRequest,
  SkillManifest,
  SkillMarketplaceEntry,
  SkillMarketplaceSource,
  SkillMarketplaceState,
  SkillRecord
} from "@/shared/overthink";

import type { OverthinkStorage } from "./overthink-storage";

const SKILLS_KEY = "skills";
const SOURCES_KEY = "skillMarketplaceSources";
const CACHE_KEY = "skillMarketplaceCache";

const BUILTIN_SOURCE: SkillMarketplaceSource = {
  id: "builtin",
  name: "Overthink Essentials",
  kind: "builtin",
  enabled: true
};

const BUILTIN_SKILLS: SkillManifest[] = [
  {
    id: "page-analyst",
    name: "Page Analyst",
    version: "0.1.0",
    description: "Read the current page, extract claims, and produce a concise answer grounded in page context.",
    author: "Overthink",
    tags: ["page", "reading", "summary"],
    permissions: ["page", "storage"],
    triggers: ["summarize this page", "what is on this page", "analyze current page"],
    prompt:
      "When this skill is relevant, read the active page first, identify the user's actual question, and answer with page-grounded evidence.",
    tools: ["read_page", "extract_links", "recall_search"]
  },
  {
    id: "web-researcher",
    name: "Web Researcher",
    version: "0.1.0",
    description: "Search the web, compare sources, and return a source-aware research summary.",
    author: "Overthink",
    tags: ["research", "search"],
    permissions: ["network", "browser", "storage"],
    triggers: ["research", "compare sources", "find recent information"],
    prompt:
      "When this skill is relevant, search first, prefer primary sources, keep track of uncertainty, and summarize the answer clearly.",
    tools: ["search_web", "read_page", "extract_links", "recall_search"]
  },
  {
    id: "browser-operator",
    name: "Browser Operator",
    version: "0.1.0",
    description: "Operate the active page with explicit approval for clicks, typing, navigation, and other visible actions.",
    author: "Overthink",
    tags: ["browser", "automation"],
    permissions: ["browser", "page"],
    triggers: ["click", "open", "type", "fill", "scroll"],
    prompt:
      "When this skill is relevant, plan browser actions carefully and request approval before actions that change page state.",
    tools: ["read_page", "capture_screenshot", "open_url", "click", "type", "scroll", "press_key", "wait_for_page"]
  }
];

interface MarketplaceCache {
  [sourceId: string]: SkillManifest[];
}

export class OverthinkSkillService {
  constructor(private readonly storage: OverthinkStorage) {}

  listMarketplace(): SkillMarketplaceState {
    const sources = this.readSources();
    const installed = this.listInstalled();
    const installedById = new Map(installed.map((skill) => [skill.id, skill]));
    const entries: SkillMarketplaceEntry[] = [];

    for (const manifest of BUILTIN_SKILLS) {
      const record = installedById.get(manifest.id);
      entries.push(this.entryFromManifest(manifest, BUILTIN_SOURCE, Boolean(record), record?.enabled ?? false));
    }

    const cache = this.readCache();
    for (const source of sources.filter((item) => item.kind !== "builtin" && item.enabled)) {
      for (const manifest of cache[source.id] ?? []) {
        const record = installedById.get(manifest.id);
        entries.push(this.entryFromManifest(manifest, source, Boolean(record), record?.enabled ?? false));
      }
    }

    return {
      sources,
      entries: this.dedupeEntries(entries)
    };
  }

  listInstalled(): SkillRecord[] {
    const stored = this.storage.get("local", SKILLS_KEY) as { skills?: SkillRecord[] };
    return Array.isArray(stored.skills) ? stored.skills.flatMap((skill) => this.normalizeRecord(skill)) : [];
  }

  async refreshSources(): Promise<SkillMarketplaceState> {
    const sources = this.readSources();
    const cache = this.readCache();
    const nextSources: SkillMarketplaceSource[] = [];

    for (const source of sources) {
      if (source.kind !== "remote" || !source.enabled || !source.url) {
        nextSources.push(source);
        continue;
      }

      try {
        const response = await fetch(source.url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const body = (await response.json()) as unknown;
        cache[source.id] = this.parseRemoteManifestList(body);
        nextSources.push({ ...source, lastRefreshedAt: new Date().toISOString(), error: undefined });
      } catch (error) {
        nextSources.push({
          ...source,
          error: error instanceof Error ? error.message : "Refresh failed."
        });
      }
    }

    this.saveSources(nextSources);
    this.storage.set("local", { [CACHE_KEY]: cache });
    return this.listMarketplace();
  }

  saveMarketplaceSources(sources: SkillMarketplaceSource[]): SkillMarketplaceState {
    this.saveSources(sources);
    return this.listMarketplace();
  }

  install(request: SkillInstallRequest): SkillRecord {
    const sourceId = request.sourceId || "builtin";
    const manifest = request.manifest ?? this.findManifest(request.skillId, sourceId);
    if (!manifest) {
      throw new Error("Skill manifest was not found.");
    }

    const source = this.readSources().find((item) => item.id === sourceId) ?? BUILTIN_SOURCE;
    const now = new Date().toISOString();
    const record: SkillRecord = {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      sourceId: source.id,
      sourceName: source.name,
      sourceKind: source.kind,
      manifest: this.normalizeManifest(manifest),
      enabled: true,
      installedAt: now,
      updatedAt: now,
      syncState: "local"
    };
    const next = [record, ...this.listInstalled().filter((skill) => skill.id !== record.id)];
    this.saveInstalled(next);
    return record;
  }

  setEnabled(skillId: string, enabled: boolean): SkillRecord[] {
    const now = new Date().toISOString();
    const next = this.listInstalled().map((skill) => (skill.id === skillId ? { ...skill, enabled, updatedAt: now } : skill));
    this.saveInstalled(next);
    return next;
  }

  remove(skillId: string): SkillRecord[] {
    const next = this.listInstalled().filter((skill) => skill.id !== skillId);
    this.saveInstalled(next);
    return next;
  }

  private findManifest(skillId: string | undefined, sourceId: string): SkillManifest | null {
    if (!skillId) {
      return null;
    }

    if (sourceId === "builtin") {
      return BUILTIN_SKILLS.find((skill) => skill.id === skillId) ?? null;
    }

    return this.readCache()[sourceId]?.find((skill) => skill.id === skillId) ?? null;
  }

  private readSources(): SkillMarketplaceSource[] {
    const stored = this.storage.get("local", SOURCES_KEY) as { skillMarketplaceSources?: SkillMarketplaceSource[] };
    const userSources = Array.isArray(stored.skillMarketplaceSources)
      ? stored.skillMarketplaceSources.flatMap((source) => this.normalizeSource(source))
      : [];
    return [BUILTIN_SOURCE, ...userSources.filter((source) => source.id !== BUILTIN_SOURCE.id)];
  }

  private saveSources(sources: SkillMarketplaceSource[]): void {
    const next = sources
      .filter((source) => source.id !== BUILTIN_SOURCE.id)
      .flatMap((source) => this.normalizeSource(source));
    this.storage.set("local", { [SOURCES_KEY]: next });
  }

  private readCache(): MarketplaceCache {
    const stored = this.storage.get("local", CACHE_KEY) as { skillMarketplaceCache?: MarketplaceCache };
    if (!stored.skillMarketplaceCache || typeof stored.skillMarketplaceCache !== "object") {
      return {};
    }
    return stored.skillMarketplaceCache;
  }

  private parseRemoteManifestList(body: unknown): SkillManifest[] {
    const rawSkills =
      Array.isArray(body)
        ? body
        : body && typeof body === "object" && Array.isArray((body as Record<string, unknown>).skills)
          ? ((body as Record<string, unknown>).skills as unknown[])
          : [];
    return rawSkills.flatMap((item) => {
      if (!item || typeof item !== "object") {
        return [];
      }
      return [this.normalizeManifest(item as SkillManifest)].filter((manifest) => manifest.id && manifest.name);
    });
  }

  private entryFromManifest(
    manifest: SkillManifest,
    source: SkillMarketplaceSource,
    installed: boolean,
    enabled: boolean
  ): SkillMarketplaceEntry {
    return {
      ...this.normalizeManifest(manifest),
      sourceId: source.id,
      sourceName: source.name,
      sourceKind: source.kind,
      installed,
      enabled
    };
  }

  private dedupeEntries(entries: SkillMarketplaceEntry[]): SkillMarketplaceEntry[] {
    const seen = new Set<string>();
    return entries.filter((entry) => {
      const key = `${entry.sourceId}:${entry.id}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  private normalizeRecord(skill: SkillRecord): SkillRecord[] {
    if (!skill?.id || !skill.name || !skill.manifest) {
      return [];
    }

    return [
      {
        ...skill,
        manifest: this.normalizeManifest(skill.manifest),
        sourceKind:
          skill.sourceKind === "builtin" || skill.sourceKind === "remote" || skill.sourceKind === "local"
            ? skill.sourceKind
            : "local",
        enabled: Boolean(skill.enabled),
        syncState: "local"
      }
    ];
  }

  private normalizeSource(source: SkillMarketplaceSource): SkillMarketplaceSource[] {
    if (!source?.id || !source.name) {
      return [];
    }

    const kind = source.kind === "remote" || source.kind === "local" || source.kind === "builtin" ? source.kind : "remote";
    return [
      {
        id: source.id,
        name: source.name,
        kind,
        url: source.url?.trim() || undefined,
        enabled: Boolean(source.enabled),
        lastRefreshedAt: source.lastRefreshedAt,
        error: source.error
      }
    ];
  }

  private normalizeManifest(manifest: SkillManifest): SkillManifest {
    return {
      id: String(manifest.id ?? "").trim(),
      name: String(manifest.name ?? "").trim(),
      version: String(manifest.version ?? "0.1.0").trim() || "0.1.0",
      description: String(manifest.description ?? "").trim(),
      author: manifest.author ? String(manifest.author).trim() : undefined,
      homepage: manifest.homepage ? String(manifest.homepage).trim() : undefined,
      tags: this.stringList(manifest.tags),
      permissions: this.stringList(manifest.permissions).filter((permission) =>
        ["page", "browser", "network", "files", "clipboard", "shell", "storage"].includes(permission)
      ) as SkillManifest["permissions"],
      triggers: this.stringList(manifest.triggers),
      prompt: String(manifest.prompt ?? "").trim(),
      tools: this.stringList(manifest.tools).filter((tool) =>
        [
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
        ].includes(tool)
      ) as SkillManifest["tools"]
    };
  }

  private saveInstalled(skills: SkillRecord[]): void {
    this.storage.set("local", { [SKILLS_KEY]: skills });
  }

  private stringList(value: unknown): string[] {
    return Array.isArray(value) ? value.flatMap((item) => (typeof item === "string" ? [item.trim()] : [])).filter(Boolean) : [];
  }
}
