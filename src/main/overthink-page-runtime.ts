import type { WebContents, WebFrameMain } from "electron";

import type { PageBrief, PageFrameBrief } from "@/shared/overthink";

const MAIN_BRIEF_SCRIPT = `(() => {
  const clean = (value) => String(value || "").replace(/\\s+/g, " ").trim();
  const text = clean(document.body?.innerText || "");
  const countWords = (value) => {
    const latinWords = value.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)?/g)?.length || 0;
    const cjkChars = value.match(/[\\u3400-\\u9fff]/g)?.length || 0;
    return latinWords + cjkChars;
  };
  const description =
    document.querySelector('meta[name="description"]')?.getAttribute("content") ||
    document.querySelector('meta[property="og:description"]')?.getAttribute("content") ||
    "";

  return {
    title: clean(document.title) || location.hostname || location.href,
    url: location.href,
    description: clean(description),
    excerpt: text.slice(0, 1800),
    selectedText: clean(String(window.getSelection?.() || "")).slice(0, 1800),
    headings: Array.from(document.querySelectorAll("h1,h2,h3,h4"))
      .map((heading) => ({
        level: Number(heading.tagName.slice(1)) || 0,
        text: clean(heading.textContent)
      }))
      .filter((heading) => heading.text)
      .slice(0, 18),
    links: Array.from(document.links)
      .map((link) => ({ text: clean(link.textContent), href: link.href }))
      .filter((link) => link.text && link.href)
      .slice(0, 24),
    wordCount: countWords(text)
  };
})()`;

const FRAME_TEXT_SCRIPT = `(() => {
  const clean = (value) => String(value || "").replace(/\\s+/g, " ").trim();
  const text = clean(document.body?.innerText || "");
  const latinWords = text.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)?/g)?.length || 0;
  const cjkChars = text.match(/[\\u3400-\\u9fff]/g)?.length || 0;
  return { text: text.slice(0, 1200), wordCount: latinWords + cjkChars };
})()`;

interface FrameTextResult {
  text: string;
  wordCount: number;
}

export class OverthinkPageRuntime {
  async executeJavaScript<T = unknown>(webContents: WebContents, code: string, userGesture = false): Promise<T> {
    return webContents.executeJavaScript(code, userGesture) as Promise<T>;
  }

  async captureBrief(webContents: WebContents): Promise<PageBrief> {
    const mainBrief = await this.executeJavaScript<Omit<PageBrief, "frames" | "capturedAt">>(
      webContents,
      MAIN_BRIEF_SCRIPT
    );

    return {
      ...mainBrief,
      frames: await this.captureFrameBriefs(webContents),
      capturedAt: new Date().toISOString()
    };
  }

  private async captureFrameBriefs(webContents: WebContents): Promise<PageFrameBrief[]> {
    const frames = webContents.mainFrame.framesInSubtree.filter((frame) => frame !== webContents.mainFrame);
    const briefs: PageFrameBrief[] = [];

    for (const frame of frames) {
      const result = await this.executeFrameScript(frame, FRAME_TEXT_SCRIPT);
      if (!result?.text) {
        continue;
      }

      briefs.push({
        frameId: frame.frameTreeNodeId,
        name: frame.name,
        url: frame.url,
        text: result.text,
        wordCount: result.wordCount
      });
    }

    return briefs.slice(0, 8);
  }

  private async executeFrameScript(frame: WebFrameMain, code: string): Promise<FrameTextResult | null> {
    try {
      const executableFrame = frame as WebFrameMain & {
        executeJavaScript?: (source: string, userGesture?: boolean) => Promise<FrameTextResult>;
      };
      const result = await executableFrame.executeJavaScript?.(code, false);
      return (result as FrameTextResult | undefined) ?? null;
    } catch {
      return null;
    }
  }
}
