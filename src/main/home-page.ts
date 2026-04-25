import { APP_NAME, APP_TAGLINE } from "@/shared/branding";

const quickLinks = [
  { label: "Bing", href: "https://www.bing.com/" },
  { label: "GitHub", href: "https://github.com/" },
  { label: "Wikipedia", href: "https://www.wikipedia.org/" },
  { label: "Perplexity", href: "https://www.perplexity.ai/" }
];

const prompts = ["What is actually being claimed?", "Where does the evidence start?", "What would change my mind?"];

export function renderHomePage(): string {
  const quickLinkMarkup = quickLinks
    .map((link) => `<a class="quick-link" href="${link.href}">${link.label}</a>`)
    .join("");
  const promptMarkup = prompts.map((prompt) => `<span class="prompt-chip">${prompt}</span>`).join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${APP_NAME}</title>
    <style>
      :root {
        color: #191c20;
        background: #f4f1ea;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      * {
        box-sizing: border-box;
      }

      body {
        min-height: 100vh;
        margin: 0;
        background:
          linear-gradient(90deg, rgba(25, 28, 32, 0.05) 1px, transparent 1px),
          linear-gradient(rgba(25, 28, 32, 0.05) 1px, transparent 1px),
          #f4f1ea;
        background-size: 42px 42px;
      }

      main {
        display: grid;
        align-content: center;
        width: min(920px, calc(100vw - 48px));
        min-height: 100vh;
        margin: 0 auto;
        padding: 56px 0;
      }

      .brand {
        display: flex;
        align-items: center;
        gap: 14px;
        margin-bottom: 34px;
      }

      .mark {
        display: grid;
        place-items: center;
        width: 46px;
        height: 46px;
        border: 2px solid #191c20;
        border-radius: 8px;
        background: #ffcc4d;
        box-shadow: 6px 6px 0 #191c20;
        font-size: 24px;
        font-weight: 800;
      }

      h1 {
        margin: 0;
        color: #111318;
        font-size: clamp(48px, 8vw, 92px);
        line-height: 0.95;
        letter-spacing: 0;
      }

      .tagline {
        margin: 8px 0 0;
        color: #525962;
        font-size: 18px;
      }

      form {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 116px;
        gap: 10px;
        margin-bottom: 22px;
      }

      input,
      button {
        height: 54px;
        border: 2px solid #191c20;
        border-radius: 8px;
        font: inherit;
      }

      input {
        min-width: 0;
        padding: 0 18px;
        background: #fffdf8;
        color: #111318;
        font-size: 17px;
        outline: none;
      }

      input:focus {
        box-shadow: 0 0 0 4px rgba(47, 158, 143, 0.22);
      }

      button {
        background: #2f9e8f;
        color: #ffffff;
        cursor: pointer;
        font-weight: 750;
      }

      .quick-links,
      .prompt-row {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }

      .quick-links {
        margin-bottom: 28px;
      }

      .quick-link,
      .prompt-chip {
        border: 1px solid rgba(25, 28, 32, 0.18);
        border-radius: 8px;
        background: rgba(255, 253, 248, 0.82);
        color: #30363d;
      }

      .quick-link {
        padding: 10px 13px;
        text-decoration: none;
      }

      .quick-link:hover {
        border-color: #191c20;
        color: #111318;
      }

      .prompt-chip {
        padding: 9px 12px;
        color: #5b616a;
        font-size: 13px;
      }

      @media (max-width: 640px) {
        main {
          width: min(100vw - 28px, 920px);
        }

        form {
          grid-template-columns: minmax(0, 1fr);
        }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="brand" aria-label="${APP_NAME}">
        <div class="mark">O</div>
        <div>
          <h1>${APP_NAME}</h1>
          <p class="tagline">${APP_TAGLINE}</p>
        </div>
      </section>
      <form action="https://www.bing.com/search" method="get">
        <input name="q" autocomplete="off" autofocus placeholder="What are you trying to understand?" />
        <button type="submit">Search</button>
      </form>
      <nav class="quick-links" aria-label="Quick links">${quickLinkMarkup}</nav>
      <div class="prompt-row" aria-label="Thinking prompts">${promptMarkup}</div>
    </main>
  </body>
</html>`;
}
