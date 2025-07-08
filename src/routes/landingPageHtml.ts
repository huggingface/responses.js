import type { Request, Response } from "express";

export function getLandingPageHtml(req: Request, res: Response): void {
	const baseUrl = `${req.protocol}://${req.get("host")}/v1`;
	res.setHeader("Content-Type", "text/html; charset=utf-8");
	res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>responses.js – OpenAI-compatible Responses API</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #2563eb;
      --primary-dark: #1e40af;
      --accent: #fbbf24;
      --bg: #f8fafc;
      --card-bg: #fff;
      --border: #e5e7eb;
      --text: #1e293b;
      --muted: #64748b;
      --radius: 14px;
      --shadow: 0 4px 24px #0002;
    }
    html, body { height: 100%; }
    body {
      font-family: 'Inter', Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      margin: 0;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .sticky-header {
      position: sticky;
      top: 0;
      z-index: 100;
      background: linear-gradient(90deg, var(--primary) 0%, #60a5fa 100%);
      color: #fff;
      box-shadow: 0 2px 12px #0001;
    }
    .header-inner {
      max-width: 1100px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1.5rem 1.5rem 1.2rem 1.5rem;
    }
    .header-title {
      display: flex;
      align-items: center;
      gap: 0.8rem;
    }
    .header-title svg {
      height: 2.2rem;
      width: 2.2rem;
      display: block;
    }
    .header-title h1 {
      font-size: 2.1rem;
      font-weight: 700;
      margin: 0;
      letter-spacing: -1px;
    }
    .github-btn {
      background: #fff2;
      color: #fff;
      border: 1.5px solid #fff4;
      border-radius: 8px;
      padding: 0.6em 1.3em;
      font-weight: 600;
      font-size: 1.05em;
      text-decoration: none;
      display: flex;
      align-items: center;
      gap: 0.5em;
      transition: background 0.2s, color 0.2s;
    }
    .github-btn:hover {
      background: #fff;
      color: var(--primary-dark);
    }
    main {
      flex: 1;
      max-width: 900px;
      margin: 0 auto;
      padding: 2.5rem 1.2rem 1.5rem 1.2rem;
      display: flex;
      flex-direction: column;
      gap: 2.5rem;
    }
    .hero {
      background: linear-gradient(120deg, #dbeafe 0%, #f0fdf4 100%);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      padding: 2.5rem 2rem 2rem 2rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      position: relative;
      overflow: hidden;
    }
    .hero h2 {
      font-size: 2rem;
      font-weight: 700;
      margin: 0 0 0.7rem 0;
      color: var(--primary-dark);
    }
    .hero p {
      font-size: 1.18rem;
      color: var(--muted);
      margin: 0 0 1.5rem 0;
    }
    .api-endpoint-box {
      background: #fff;
      border: 2px solid var(--primary);
      border-radius: 12px;
      padding: 1.3rem 1.2rem 1.3rem 1.2rem;
      margin: 1.5rem 0 1.5rem 0;
      text-align: center;
      font-size: 1.18rem;
      box-shadow: 0 2px 8px #174ea610;
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5em;
    }
    .api-endpoint-url {
      display: inline-block;
      background: #f1f5f9;
      color: var(--primary-dark);
      font-family: 'Fira Mono', 'Consolas', monospace;
      font-size: 1.15em;
      padding: 0.3em 0.7em;
      border-radius: 6px;
      border: 1px solid #cbd5e1;
      margin: 0.5em 0 0.5em 0;
      word-break: break-all;
    }
    .copy-endpoint-btn {
      position: absolute;
      top: 16px;
      right: 16px;
      background: var(--primary);
      color: #fff;
      border: none;
      border-radius: 4px;
      padding: 0.3em 1em;
      font-size: 1em;
      cursor: pointer;
      opacity: 0.85;
      transition: background 0.2s, opacity 0.2s;
      z-index: 2;
    }
    .copy-endpoint-btn:hover { background: var(--primary-dark); opacity: 1; }
    .copy-endpoint-btn.copied { background: #388e3c; color: #fff; opacity: 1; }
    .cta {
      margin: 1.5rem auto 0 auto;
      background: var(--primary);
      color: #fff;
      text-decoration: none;
      font-weight: bold;
      padding: 1rem 2.5rem;
      border-radius: 8px;
      font-size: 1.2rem;
      transition: background 0.2s;
      box-shadow: 0 2px 8px #2563eb20;
      display: inline-block;
    }
    .cta:hover { background: var(--primary-dark); }
    .features {
      display: grid;
      grid-template-columns: repeat(2, 1fr); /* 2 columns for 2x2 grid */
      gap: 1.5rem;
      margin: 2rem 0 0 0;
    }
    .feature-card {
      background: var(--card-bg);
      border-radius: var(--radius);
      box-shadow: 0 1px 6px #0001;
      padding: 1.2rem 1.3rem;
      border: 1.5px solid var(--border);
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5em;
      min-height: 120px;
      position: relative;
      transition: box-shadow 0.2s, border 0.2s;
    }
    .feature-card:hover {
      box-shadow: 0 4px 16px #2563eb22;
      border: 1.5px solid var(--primary);
    }
    .feature-card b {
      font-size: 1.08em;
      color: var(--primary-dark);
    }
    .examples-section {
      margin-top: 2.5rem;
    }
    .examples-tabs {
      display: flex;
      gap: 0.5em;
      margin-bottom: 1.2em;
      border-bottom: 2px solid #e5e7eb;
    }
    .examples-tab {
      background: none;
      border: none;
      font-size: 1.08em;
      font-weight: 600;
      color: var(--muted);
      padding: 0.7em 1.2em 0.5em 1.2em;
      cursor: pointer;
      border-radius: 8px 8px 0 0;
      transition: color 0.2s, background 0.2s;
    }
    .examples-tab.active {
      color: var(--primary-dark);
      background: #fff;
      border-bottom: 2px solid var(--primary);
    }
    .example-panel { display: none; }
    .example-panel.active { display: block; }
    pre {
      background: #f4f4f8;
      border-radius: 8px;
      padding: 1.1rem 1rem 1.1rem 1rem;
      overflow-x: auto;
      font-size: 0.98rem;
      position: relative;
      margin: 0.5em 0 0.5em 0;
    }
    code {
      font-family: 'Fira Mono', 'Consolas', monospace;
      font-size: 1em;
      background: none;
      color: #222;
    }
    .copy-btn {
      position: absolute;
      top: 10px;
      right: 10px;
      background: #e0e4ea;
      border: none;
      border-radius: 4px;
      padding: 0.2em 0.7em;
      font-size: 0.95em;
      color: var(--primary-dark);
      cursor: pointer;
      opacity: 0.7;
      transition: opacity 0.2s, background 0.2s;
      z-index: 2;
    }
    .copy-btn:hover { opacity: 1; background: #c9d3e6; }
    .copy-btn.copied { color: #388e3c; background: #d0f5dd; opacity: 1; }
    .more-info-footer {
      background: #f1f5f9;
      border-top: 1.5px solid #e5e7eb;
      margin-top: 3rem;
      padding: 2rem 1rem 1.5rem 1rem;
      border-radius: 0 0 var(--radius) var(--radius);
      text-align: center;
      color: var(--muted);
      font-size: 1.08em;
    }
    .more-info-footer ul {
      list-style: none;
      padding: 0;
      margin: 0.5em 0 0 0;
      display: flex;
      flex-wrap: wrap;
      gap: 1.5em;
      justify-content: center;
    }
    .more-info-footer a {
      color: var(--primary-dark);
      text-decoration: none;
      font-weight: 500;
      transition: color 0.2s;
    }
    .more-info-footer a:hover { color: var(--primary); }
    @media (max-width: 700px) {
      .header-inner { flex-direction: column; align-items: flex-start; gap: 1.2em; }
      .header-title h1 { font-size: 1.5rem; }
      main { padding: 1.2rem; }
      .hero { padding: 1.2rem 0.7rem 1.2rem 0.7rem; }
    }
  </style>
  <!-- Prism.js for syntax highlighting -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/themes/prism.min.css">
  <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/prism.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-javascript.min.js"></script>
  <script>
    function copyCode(btn) {
      const pre = btn.parentElement;
      const code = pre.querySelector('code');
      if (!code) return;
      const text = code.innerText;
      navigator.clipboard.writeText(text).then(() => {
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = 'Copy';
          btn.classList.remove('copied');
        }, 1200);
      });
    }
    function copyEndpointUrl(btn) {
      const url = document.getElementById('api-endpoint-url').innerText;
      navigator.clipboard.writeText(url).then(() => {
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = 'Copy';
          btn.classList.remove('copied');
        }, 1200);
      });
    }
    // Tabs for examples
    function showExampleTab(idx) {
      document.querySelectorAll('.examples-tab').forEach((tab, i) => {
        tab.classList.toggle('active', i === idx);
      });
      document.querySelectorAll('.example-panel').forEach((panel, i) => {
        panel.classList.toggle('active', i === idx);
      });
    }
    window.addEventListener('DOMContentLoaded', function() {
      showExampleTab(0);
      document.querySelectorAll('.examples-tab').forEach((tab, i) => {
        tab.addEventListener('click', () => showExampleTab(i));
      });
    });
  </script>
</head>
<body>
  <header class="sticky-header">
    <div class="header-inner">
      <div class="header-title">
        <img src="https://huggingface.co/datasets/huggingface/brand-assets/resolve/main/hf-logo.svg" alt="Hugging Face Logo" style="height:4.0rem;width:4.0rem;display:block;"/>
        <h1>responses.js</h1>
      </div>
      <a href="https://github.com/huggingface/responses.js" target="_blank" aria-label="GitHub Repository" class="github-btn">
        <svg height="20" width="20" viewBox="0 0 16 16" fill="currentColor" style="display: block;"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.19 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>
        GitHub
      </a>
    </div>
  </header>
  <main>
    <section class="hero">
      <h2>OpenAI-compatible Responses API</h2>
      <p><b>responses.js</b> is an open-source, lightweight server implementing OpenAI's Responses API, built on top of Chat Completions and powered by Hugging Face Inference Providers.</p>
      <div class="api-endpoint-box">
        <button class="copy-endpoint-btn" onclick="copyEndpointUrl(this)">Copy</button>
        <div><b>API Endpoint:</b></div>
        <span class="api-endpoint-url" id="api-endpoint-url">${baseUrl}/responses</span>
        <div style="font-size:0.98em; color:#333; margin-top:0.5em;">Get started by sending requests to this endpoint</div>
      </div>
      <a class="cta" href="https://github.com/huggingface/responses.js" target="_blank">View on GitHub</a>
    </section>
    <section>
      <div class="features">
        <div class="feature-card">
          <b>OpenAI-compatible</b><br>Stateless implementation of the <a href="https://platform.openai.com/docs/api-reference/responses" target="_blank">Responses API</a>
        </div>
        <div class="feature-card">
          <b>Inference Providers</b><br>Powered by Hugging Face Inference Providers
        </div>
        <div class="feature-card">
          <b>Multi-modal</b><br>Text and image input support
        </div>
        <div class="feature-card">
          <b>Streaming, & Structured Output</b><br>Supports streaming, JSON schema, and function calling
        </div>
      </div>
    </section>
    <section class="examples-section">
      <h2 style="color:var(--primary-dark);margin-bottom:1.2em;">Examples</h2>
      <div class="examples-tabs">
        <button class="examples-tab active" type="button">Text</button>
        <button class="examples-tab" type="button">Text + Image Input</button>
        <button class="examples-tab" type="button">Multi-turn</button>
        <button class="examples-tab" type="button">Streaming</button>
        <button class="examples-tab" type="button">Function Calling</button>
        <button class="examples-tab" type="button">Structured Output</button>
      </div>
      <div class="example-panel active">
        <pre><button class="copy-btn" onclick="copyCode(this)">Copy</button><code class="language-js">import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "${baseUrl}",
  apiKey: "YOUR_API_KEY_HERE", // visit https://huggingface.co/settings/tokens
});

const response = await openai.responses.create({
  model: "Qwen/Qwen2.5-VL-7B-Instruct",
  instructions: "You are a helpful assistant.",
  input: "Tell me a three sentence bedtime story about a unicorn.",
});

console.log(response);
console.log(response.output_text);</code></pre>
      </div>
      <div class="example-panel">
        <pre><button class="copy-btn" onclick="copyCode(this)">Copy</button><code class="language-js">import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "${baseUrl}",
  apiKey: "YOUR_API_KEY_HERE", // visit https://huggingface.co/settings/tokens
});

const response = await openai.responses.create({
  model: "Qwen/Qwen2.5-VL-7B-Instruct",
  input: [
    {
      role: "user",
      content: [
        { type: "input_text", text: "what is in this image?" },
        {
          type: "input_image",
          image_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Gfp-wisconsin-madison-the-nature-boardwalk.jpg/2560px-Gfp-wisconsin-madison-the-nature-boardwalk.jpg"
        }
      ]
    }
  ]
});

console.log(response);
console.log(response.output_text);</code></pre>
      </div>
      <div class="example-panel">
        <pre><button class="copy-btn" onclick="copyCode(this)">Copy</button><code class="language-js">import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "${baseUrl}",
  apiKey: "YOUR_API_KEY_HERE", // visit https://huggingface.co/settings/tokens
});
const response = await openai.responses.create({
  model: "Qwen/Qwen2.5-VL-7B-Instruct",
  input: [
    {
      role: "developer",
      content: "Talk like a pirate.",
    },
    {
      role: "user",
      content: "Are semicolons optional in JavaScript?",
    },
  ],
});

console.log(response);
console.log(response.output_text);</code></pre>
      </div>
      <div class="example-panel">
        <pre><button class="copy-btn" onclick="copyCode(this)">Copy</button><code class="language-js">import { OpenAI } from "openai";
const openai = new OpenAI({
  baseURL: "${baseUrl}",
  apiKey: "YOUR_API_KEY_HERE", // visit https://huggingface.co/settings/tokens
});

const stream = await openai.responses.create({
  model: "hyperbolic@Qwen/Qwen2.5-VL-7B-Instruct",
  input: [
    {
      role: "user",
      content: "Say 'double bubble bath' ten times fast.",
    },
  ],
  stream: true,
});

for await (const event of stream) {
  console.log(event);
}</code></pre>
      </div>
      <div class="example-panel">
        <pre><button class="copy-btn" onclick="copyCode(this)">Copy</button><code class="language-js">import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "${baseUrl}",
  apiKey: "YOUR_API_KEY_HERE", // visit https://huggingface.co/settings/tokens
});

const tools = [
  {
    type: "function",
    name: "get_current_weather",
    description: "Get the current weather in a given location",
    parameters: {
      type: "object",
      properties: {
        location: { type: "string", description: "The city and state, e.g. San Francisco, CA" },
        unit: { type: "string", enum: ["celsius", "fahrenheit"] }
      },
      required: ["location", "unit"]
    }
  }
];

const response = await openai.responses.create({
  model: "cerebras@meta-llama/Llama-3.3-70B-Instruct",
  tools: tools,
  input: "What is the weather like in Boston today?",
  tool_choice: "auto"
});

console.log(response);</code></pre>
      </div>
      <div class="example-panel">
        <pre><button class="copy-btn" onclick="copyCode(this)">Copy</button><code class="language-js">import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

const openai = new OpenAI({
  baseURL: "${baseUrl}",
  apiKey: "YOUR_API_KEY_HERE", // visit https://huggingface.co/settings/tokens
});

const Step = z.object({
  explanation: z.string(),
  output: z.string(),
});

const MathReasoning = z.object({
  steps: z.array(Step),
  final_answer: z.string(),
});

const response = await openai.responses.parse({
  model: "novita@meta-llama/Meta-Llama-3-70B-Instruct",
  input: [
    {
      role: "system",
      content: "You are a helpful math tutor. Guide the user through the solution step by step.",
    },
    { role: "user", content: "how can I solve 8x + 7 = -23" },
  ],
  text: {
    format: zodTextFormat(MathReasoning, "math_reasoning"),
  },
});

console.log(response.output_parsed);</code></pre>
      </div>
    </section>
    <footer class="more-info-footer">
      <div style="font-weight:600; color:var(--primary-dark); font-size:1.13em; margin-bottom:0.5em;">More Info</div>
      <ul>
        <li><a href="https://github.com/huggingface/responses.js" target="_blank">GitHub Repository</a></li>
        <li><a href="https://platform.openai.com/docs/api-reference/responses" target="_blank">OpenAI Responses API Docs</a></li>
        <li><a href="https://huggingface.co/docs/inference-providers/index" target="_blank">Hugging Face Inference Providers</a></li>
      </ul>
    </footer>
  </main>
</body>
</html>
  `);
}
