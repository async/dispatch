import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = process.cwd();
const readmePath = resolve(root, "README.md");
const outputPath = resolve(root, ".async/pages/index.html");

const markdown = await readFile(readmePath, "utf8");
const escaped = markdown
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;");

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>@async/dispatch</title>
  <style>
    :root {
      color-scheme: light dark;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.55;
      background: Canvas;
      color: CanvasText;
    }

    body {
      margin: 0;
    }

    main {
      max-width: 920px;
      margin: 0 auto;
      padding: 32px 20px 56px;
    }

    pre {
      overflow-x: auto;
      padding: 16px;
      border: 1px solid color-mix(in srgb, CanvasText 18%, transparent);
      border-radius: 6px;
      background: color-mix(in srgb, CanvasText 7%, Canvas);
    }

    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
      font-size: 0.95em;
    }
  </style>
</head>
<body>
  <main>
    <pre><code>${escaped}</code></pre>
  </main>
</body>
</html>
`;

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, html);
