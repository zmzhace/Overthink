import { APP_NAME, APP_TAGLINE } from "@/shared/branding";

const quickLinks = [
  { label: "GitHub", href: "https://github.com/" },
  { label: "OpenAI", href: "https://openai.com/" },
  { label: "Perplexity", href: "https://www.perplexity.ai/" },
  { label: "Wikipedia", href: "https://www.wikipedia.org/" }
];

const agentPrompts = [
  "Summarize this page after I open it",
  "Research the latest context for this topic",
  "Compare the key claims and sources"
];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderHomePage(): string {
  const quickLinkMarkup = quickLinks
    .map((link) => `<a class="quick-link" href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`)
    .join("");
  const promptMarkup = agentPrompts
    .map((prompt) => `<a class="prompt-chip" href="overthink://agent/?prompt=${encodeURIComponent(prompt)}">${escapeHtml(prompt)}</a>`)
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(APP_NAME)}</title>
    <style>
      :root {
        color: #171a1f;
        background: #f7f8fa;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-synthesis: none;
        text-rendering: optimizeLegibility;
      }

      * {
        box-sizing: border-box;
      }

      body {
        min-height: 100vh;
        margin: 0;
        background:
          radial-gradient(circle at top left, rgba(47, 158, 143, 0.11), transparent 32rem),
          linear-gradient(180deg, #ffffff 0%, #f7f8fa 48%, #f1f3f6 100%);
      }

      main {
        display: grid;
        align-content: center;
        width: min(880px, calc(100vw - 48px));
        min-height: 100vh;
        margin: 0 auto;
        padding: 48px 0 64px;
      }

      .brand {
        display: grid;
        gap: 10px;
        margin-bottom: 28px;
      }

      .brand-row {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .mark {
        display: grid;
        place-items: center;
        width: 38px;
        height: 38px;
        border: 1px solid #d6dde7;
        border-radius: 8px;
        background: #ffffff;
        color: #0f766e;
        font-size: 18px;
        font-weight: 800;
      }

      h1 {
        margin: 0;
        color: #101418;
        font-size: 34px;
        line-height: 1;
        letter-spacing: 0;
      }

      .tagline {
        max-width: 620px;
        margin: 0;
        color: #5d6673;
        font-size: 15px;
        line-height: 1.55;
      }

      .ask-panel {
        display: grid;
        gap: 12px;
        margin-bottom: 20px;
        padding: 12px;
        border: 1px solid #dfe5ee;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.88);
        box-shadow: 0 18px 45px rgba(18, 25, 33, 0.08);
      }

      textarea {
        width: 100%;
        min-height: 118px;
        resize: vertical;
        padding: 16px;
        border: 0;
        border-radius: 8px;
        outline: none;
        background: #ffffff;
        color: #14181f;
        font: inherit;
        font-size: 18px;
        line-height: 1.45;
      }

      textarea::placeholder {
        color: #8a94a3;
      }

      .action-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }

      .hint {
        overflow: hidden;
        color: #778190;
        font-size: 12px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .buttons {
        display: flex;
        gap: 8px;
        flex: none;
      }

      button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        height: 36px;
        padding: 0 14px;
        border: 1px solid #d6dde7;
        border-radius: 8px;
        background: #ffffff;
        color: #202832;
        cursor: pointer;
        font: inherit;
        font-size: 13px;
        font-weight: 700;
      }

      button.primary {
        border-color: #111827;
        background: #111827;
        color: #ffffff;
      }

      button:hover {
        border-color: #9ba7b7;
      }

      .quick-links,
      .prompt-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .quick-links {
        margin-bottom: 18px;
      }

      .quick-link,
      .prompt-chip {
        max-width: 100%;
        overflow: hidden;
        padding: 9px 11px;
        border: 1px solid #dfe5ee;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.76);
        color: #354052;
        font-size: 13px;
        text-decoration: none;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .prompt-chip {
        color: #506070;
      }

      .quick-link:hover,
      .prompt-chip:hover {
        border-color: #aab5c4;
        background: #ffffff;
        color: #101418;
      }

      @media (max-width: 640px) {
        main {
          width: min(100vw - 28px, 880px);
          padding-top: 36px;
        }

        .action-row {
          align-items: stretch;
          flex-direction: column;
        }

        .buttons {
          width: 100%;
        }

        button {
          flex: 1;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="brand" aria-label="${escapeHtml(APP_NAME)}">
        <div class="brand-row">
          <div class="mark">O</div>
          <h1>${escapeHtml(APP_NAME)}</h1>
        </div>
        <p class="tagline">${escapeHtml(APP_TAGLINE)}. Ask an agent, search the web, or open a URL from the same place.</p>
      </section>

      <form class="ask-panel" id="ask-form">
        <textarea id="ask-input" autocomplete="off" autofocus placeholder="Ask Overthink, search, or paste a URL"></textarea>
        <div class="action-row">
          <span class="hint">Enter asks the agent. Shift+Enter adds a new line.</span>
          <div class="buttons">
            <button id="search-button" type="button">Search web</button>
            <button class="primary" type="submit">Ask Agent</button>
          </div>
        </div>
      </form>

      <nav class="quick-links" aria-label="Quick links">${quickLinkMarkup}</nav>
      <div class="prompt-row" aria-label="Agent prompts">${promptMarkup}</div>
    </main>

    <script>
      const form = document.getElementById("ask-form");
      const input = document.getElementById("ask-input");
      const searchButton = document.getElementById("search-button");

      function normalizeUrl(value) {
        if (/^[a-z][a-z\\d+\\-.]*:\\/\\//i.test(value)) {
          return value;
        }
        if (/^localhost(:\\d+)?(\\/.*)?$/i.test(value) || /^\\d{1,3}(\\.\\d{1,3}){3}(:\\d+)?(\\/.*)?$/.test(value)) {
          return "http://" + value;
        }
        if (value.includes(".") && !/\\s/.test(value)) {
          return "https://" + value;
        }
        return null;
      }

      function askAgent(value) {
        location.href = "overthink://agent/?prompt=" + encodeURIComponent(value);
      }

      function searchWeb(value) {
        const url = normalizeUrl(value);
        location.href = url || "https://www.bing.com/search?q=" + encodeURIComponent(value);
      }

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const value = input.value.trim();
        if (!value) {
          return;
        }
        const url = normalizeUrl(value);
        if (url) {
          location.href = url;
          return;
        }
        askAgent(value);
      });

      searchButton.addEventListener("click", () => {
        const value = input.value.trim();
        if (value) {
          searchWeb(value);
        }
      });

      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          form.requestSubmit();
        }
      });
    </script>
  </body>
</html>`;
}
