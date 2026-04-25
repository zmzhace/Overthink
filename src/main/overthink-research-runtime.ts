import type { WebContents } from "electron";
import { randomUUID } from "node:crypto";

import { IPC_CHANNELS } from "@/shared/ipc";
import type { DeepDiveRecord, ResearchEvent, ResearchRequest, ResearchSource, SearchProviderConfig } from "@/shared/overthink";

import type { OverthinkStorage } from "./overthink-storage";
import type { OverthinkTabs } from "./overthink-tabs";
import type { OverthinkModelService } from "./overthink-model-service";

const DEEP_DIVE_KEY = "deepDiveHistory";
const MAX_SOURCES = 6;

interface SearchCandidate {
  title: string;
  url: string;
  snippet: string;
}

export class OverthinkResearchRuntime {
  private readonly activeRuns = new Map<string, AbortController>();

  constructor(
    private readonly tabs: OverthinkTabs,
    private readonly storage: OverthinkStorage,
    private readonly modelService: OverthinkModelService
  ) {}

  start(sender: WebContents, request: ResearchRequest): string {
    const researchId = randomUUID();
    const controller = new AbortController();
    this.activeRuns.set(researchId, controller);

    void this.run(sender, researchId, request, controller).finally(() => {
      this.activeRuns.delete(researchId);
    });

    return researchId;
  }

  stop(researchId: string): void {
    this.activeRuns.get(researchId)?.abort();
  }

  private async run(
    sender: WebContents,
    researchId: string,
    request: ResearchRequest,
    controller: AbortController
  ): Promise<void> {
    const query = request.query.trim();
    this.emit(sender, { researchId, type: "start", message: query });

    try {
      const candidates = await this.search(query, controller);
      const sources: ResearchSource[] = [];

      for (const candidate of candidates.slice(0, MAX_SOURCES)) {
        this.assertRunning(controller);
        const source = await this.captureSource(candidate, controller);
        sources.push(source);
        this.emit(sender, { researchId, type: "source", source });
      }

      if (sources.length === 0 && request.pageBrief) {
        sources.push({
          id: randomUUID(),
          title: request.pageBrief.title,
          url: request.pageBrief.url,
          excerpt: request.pageBrief.excerpt || request.pageBrief.description || "Current page context.",
          capturedAt: new Date().toISOString(),
          provider: "page"
        });
      }

      const result = await this.writeReport(query, request, sources);
      const citations = sources.map((source, index) => ({
        id: randomUUID(),
        claim: `Research source ${index + 1} for: ${query}`,
        sourceId: source.id,
        sourceUrl: source.url,
        title: source.title,
        excerpt: source.excerpt.slice(0, 500),
        capturedAt: source.capturedAt
      }));
      const record: DeepDiveRecord = {
        id: researchId,
        query,
        result,
        sources,
        citations,
        createdAt: new Date().toISOString()
      };

      this.saveRecord(record);
      this.emit(sender, { researchId, type: "delta", delta: result });
      this.emit(sender, { researchId, type: "complete", record });
    } catch (error) {
      if (controller.signal.aborted) {
        this.emit(sender, { researchId, type: "stopped", message: "Stopped." });
        return;
      }

      this.emit(sender, {
        researchId,
        type: "error",
        message: error instanceof Error ? error.message : "Research failed."
      });
    }
  }

  private async search(query: string, controller: AbortController): Promise<SearchCandidate[]> {
    const provider = this.modelService.getActiveSearchProvider();
    if (provider) {
      try {
        const apiResults = await this.searchViaApi(provider, query, controller);
        if (apiResults.length > 0) {
          return apiResults;
        }
      } catch {
        // Browser search below is the configured fallback.
      }
    }

    return this.searchViaBrowser(query);
  }

  private async searchViaApi(
    provider: SearchProviderConfig,
    query: string,
    controller: AbortController
  ): Promise<SearchCandidate[]> {
    const baseUrl = provider.baseUrl.trim();
    if (!baseUrl) {
      return [];
    }

    if (provider.kind === "tavily") {
      const response = await fetch(baseUrl, {
        method: "POST",
        signal: controller.signal,
        headers: this.searchHeaders(provider),
        body: JSON.stringify({
          api_key: provider.apiKey,
          query,
          max_results: MAX_SOURCES
        })
      });
      return this.parseSearchPayload(await this.readJson(response));
    }

    const url = new URL(baseUrl);
    url.searchParams.set("q", query);
    if (provider.kind === "serpapi" && provider.apiKey) {
      url.searchParams.set("api_key", provider.apiKey);
    }

    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: this.searchHeaders(provider)
    });

    return this.parseSearchPayload(await this.readJson(response));
  }

  private searchHeaders(provider: SearchProviderConfig): HeadersInit {
    const headers: HeadersInit = {
      accept: "application/json",
      "content-type": "application/json"
    };

    if (provider.apiKey && provider.kind === "brave") {
      headers["x-subscription-token"] = provider.apiKey;
    } else if (provider.apiKey && provider.kind !== "serpapi") {
      headers.authorization = `Bearer ${provider.apiKey}`;
    }

    return headers;
  }

  private async readJson(response: Response): Promise<unknown> {
    const text = await response.text();
    if (!response.ok) {
      throw new Error(text ? `Search HTTP ${response.status}: ${text.slice(0, 200)}` : `Search HTTP ${response.status}`);
    }

    return JSON.parse(text) as unknown;
  }

  private parseSearchPayload(payload: unknown): SearchCandidate[] {
    const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
    const rawResults =
      this.arrayAt(record, "organic_results") ??
      this.arrayAt(record, "results") ??
      this.arrayAt(record, "items") ??
      this.arrayAt(record, "web", "results") ??
      [];

    return rawResults.flatMap((item) => {
      if (!item || typeof item !== "object") {
        return [];
      }

      const result = item as Record<string, unknown>;
      const title = this.stringValue(result.title ?? result.name);
      const url = this.stringValue(result.url ?? result.link);
      const snippet = this.stringValue(result.snippet ?? result.description ?? result.content);

      if (!title || !url) {
        return [];
      }

      return [{ title, url, snippet }];
    });
  }

  private arrayAt(record: Record<string, unknown>, key: string, nestedKey?: string): unknown[] | null {
    const value = record[key];
    if (!nestedKey) {
      return Array.isArray(value) ? value : null;
    }

    if (value && typeof value === "object") {
      const nested = (value as Record<string, unknown>)[nestedKey];
      return Array.isArray(nested) ? nested : null;
    }

    return null;
  }

  private async searchViaBrowser(query: string): Promise<SearchCandidate[]> {
    const snapshot = await this.tabs.createTab(`https://www.bing.com/search?q=${encodeURIComponent(query)}`);
    await this.delay(1600);
    const brief = await this.tabs.capturePageBrief(snapshot.activeTabId ?? undefined);

    return brief.links
      .filter((link) => /^https?:\/\//i.test(link.href) && !link.href.includes("bing.com"))
      .slice(0, MAX_SOURCES)
      .map((link) => ({
        title: link.text || link.href,
        url: link.href,
        snippet: brief.excerpt
      }));
  }

  private async captureSource(candidate: SearchCandidate, controller: AbortController): Promise<ResearchSource> {
    let excerpt = candidate.snippet;
    let title = candidate.title;

    try {
      const response = await fetch(candidate.url, {
        signal: controller.signal,
        headers: {
          accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
          "user-agent": "Overthink/0.1"
        }
      });
      const body = await response.text();
      if (response.ok && body) {
        title = this.extractTitle(body) || title;
        excerpt = this.cleanHtml(body).slice(0, 1800) || excerpt;
      }
    } catch {
      // Keep the search snippet if direct fetch is blocked.
    }

    return {
      id: randomUUID(),
      title: title || candidate.url,
      url: candidate.url,
      excerpt: excerpt || "No readable excerpt captured.",
      capturedAt: new Date().toISOString(),
      provider: "search-api"
    };
  }

  private async writeReport(query: string, request: ResearchRequest, sources: ResearchSource[]): Promise<string> {
    const sourceBlock = sources
      .map((source, index) => `[S${index + 1}] ${source.title}\nURL: ${source.url}\nCaptured: ${source.capturedAt}\nExcerpt: ${source.excerpt}`)
      .join("\n\n");

    try {
      return await this.modelService.completeText({
        sessionId: randomUUID(),
        messages: [
          {
            role: "user",
            content: [
              `Deep Dive request: ${query}`,
              "Use the sources below. Write a structured report with findings, evidence, conflicts or uncertainty, and next checks.",
              "Cite sources inline as [S1], [S2], etc. Do not invent citations.",
              sourceBlock || "No external sources were captured."
            ].join("\n\n")
          }
        ],
        context: {
          pageBrief: request.pageBrief,
          documents: request.documents
        }
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Model unavailable.";
      return [
        `Deep Dive: ${query}`,
        "",
        `Model report generation failed: ${reason}`,
        "",
        "Captured sources:",
        sources.map((source, index) => `[S${index + 1}] ${source.title}\n${source.url}\n${source.excerpt}`).join("\n\n")
      ].join("\n");
    }
  }

  private saveRecord(record: DeepDiveRecord): void {
    const stored = this.storage.get("local", DEEP_DIVE_KEY) as { deepDiveHistory?: DeepDiveRecord[] };
    const history = Array.isArray(stored.deepDiveHistory) ? stored.deepDiveHistory : [];
    this.storage.set("local", { [DEEP_DIVE_KEY]: [record, ...history.filter((item) => item.id !== record.id)].slice(0, 50) });
  }

  private extractTitle(html: string): string {
    return this.decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim();
  }

  private cleanHtml(html: string): string {
    return this.decodeEntities(
      html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    );
  }

  private decodeEntities(value: string): string {
    return value
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }

  private assertRunning(controller: AbortController): void {
    if (controller.signal.aborted) {
      throw new Error("Stopped");
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  private stringValue(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
  }

  private emit(sender: WebContents, event: ResearchEvent): void {
    if (!sender.isDestroyed()) {
      sender.send(IPC_CHANNELS.researchEvent, event);
    }
  }
}
