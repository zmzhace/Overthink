import { BrowserWindow, dialog } from "electron";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { DocumentExtraction } from "@/shared/overthink";

import type { OverthinkModelService } from "./overthink-model-service";

const TEXT_EXTENSIONS = new Set([".txt", ".md", ".markdown", ".csv", ".json", ".log"]);
const IMAGE_MIME_TYPES = new Map([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".gif", "image/gif"]
]);

export class OverthinkDocumentExtractor {
  constructor(
    private readonly mainWindow: BrowserWindow,
    private readonly modelService: OverthinkModelService
  ) {}

  async pickAndExtract(): Promise<DocumentExtraction | null> {
    const result = await dialog.showOpenDialog(this.mainWindow, {
      title: "Select document",
      properties: ["openFile"],
      filters: [
        { name: "Documents", extensions: ["txt", "md", "markdown", "csv", "json", "log", "pdf", "png", "jpg", "jpeg", "webp", "gif"] },
        { name: "All Files", extensions: ["*"] }
      ]
    });

    if (result.canceled || !result.filePaths[0]) {
      return null;
    }

    return this.extract(result.filePaths[0]);
  }

  private async extract(filePath: string): Promise<DocumentExtraction> {
    const buffer = await readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    const warnings: string[] = [];
    let text = "";
    let kind: DocumentExtraction["kind"] = "text";

    if (TEXT_EXTENSIONS.has(extension)) {
      text = buffer.toString("utf8").replace(/^\uFEFF/, "");
    } else if (IMAGE_MIME_TYPES.has(extension)) {
      kind = "ocr";
      try {
        text = await this.extractImageText(buffer, IMAGE_MIME_TYPES.get(extension) ?? "image/png");
      } catch (error) {
        warnings.push(error instanceof Error ? error.message : "Vision OCR failed.");
      }
    } else if (extension === ".pdf") {
      kind = "pdf";
      text = this.extractPdfText(buffer);
      if (!text) {
        kind = "ocr";
        try {
          text = await this.extractPdfWithVision(buffer);
        } catch (error) {
          warnings.push(
            error instanceof Error
              ? `No embedded PDF text was found. Vision OCR failed: ${error.message}`
              : "No embedded PDF text was found. Vision OCR failed."
          );
        }
      }
    } else {
      kind = "ocr";
      warnings.push("This file type needs a configured OCR endpoint.");
    }

    return {
      id: randomUUID(),
      name: path.basename(filePath),
      path: filePath,
      kind,
      text: this.cleanText(text).slice(0, 100_000),
      wordCount: this.wordCount(text),
      warnings,
      extractedAt: new Date().toISOString()
    };
  }

  private extractPdfText(buffer: Buffer): string {
    const raw = buffer.toString("latin1");
    const pieces: string[] = [];

    for (const match of raw.matchAll(/\(([^()]*(?:\\.[^()]*)*)\)\s*Tj/g)) {
      pieces.push(this.decodePdfLiteral(match[1]));
    }

    for (const match of raw.matchAll(/\[((?:.|\n|\r)*?)\]\s*TJ/g)) {
      const segment = match[1];
      for (const literal of segment.matchAll(/\(([^()]*(?:\\.[^()]*)*)\)/g)) {
        pieces.push(this.decodePdfLiteral(literal[1]));
      }
    }

    return pieces.join(" ");
  }

  private async extractImageText(buffer: Buffer, mimeType: string): Promise<string> {
    return this.modelService.completeVision(
      "Extract all readable text from this image. Return only the extracted text, preserving useful line breaks.",
      `data:${mimeType};base64,${buffer.toString("base64")}`
    );
  }

  private async extractPdfWithVision(buffer: Buffer): Promise<string> {
    return this.modelService.completeVision(
      "This file may be a scanned PDF. Extract all readable text if your provider supports PDF or document inputs. Return only extracted text.",
      `data:application/pdf;base64,${buffer.toString("base64")}`
    );
  }

  private decodePdfLiteral(value: string): string {
    return value
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\b/g, "\b")
      .replace(/\\f/g, "\f")
      .replace(/\\([()\\])/g, "$1")
      .replace(/\\([0-7]{1,3})/g, (_match, octal: string) => String.fromCharCode(Number.parseInt(octal, 8)));
  }

  private cleanText(value: string): string {
    return value.replace(/\s+/g, " ").trim();
  }

  private wordCount(value: string): number {
    const latinWords = value.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)?/g)?.length ?? 0;
    const cjkChars = value.match(/[\u3400-\u9fff]/g)?.length ?? 0;
    return latinWords + cjkChars;
  }
}
