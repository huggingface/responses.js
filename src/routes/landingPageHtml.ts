import type { Request, Response } from "express";

export function getLandingPageHtml(req: Request, res: Response): void {
	const host = req.get("host");
	const protocol = host && host.endsWith(".hf.space") ? "https" : req.protocol;
	const baseUrl = `${protocol}://${host}/v1`;
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
    html, body {
      height: 100%;
      max-width: 100vw;
      overflow-x: hidden;
    }
    body {
      font-family: 'Inter', Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      margin: 0;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      width: 100%;
      box-sizing: border-box;
    }
    .header-inner, main, .hero, .api-endpoint-box, .features, .feature-card, .examples-section, .more-info-footer {
      width: 100%;
      box-sizing: border-box;
    }
    .sticky-header {
      position: sticky;
      top: 0;
      z-index: 100;
      background: linear-gradient(90deg, var(--primary) 0%, #60a5fa 100%);
      color: #fff;
      box-shadow: 0 2px 12px #0001;
      width: 100%;
    }
    .header-inner {
      max-width: 1100px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1.5rem 1.5rem 1.2rem 1.5rem;
      width: 100%;
      box-sizing: border-box;
    }
    .header-title {
      display: flex;
      align-items: center;
      gap: 0.8rem;
      min-width: 0;
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
      white-space: pre-line;
      word-break: break-word;
      overflow-wrap: anywhere;
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
      min-width: 0;
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
      width: 100%;
      box-sizing: border-box;
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
      width: 100%;
      box-sizing: border-box;
    }
    .hero h2 {
      font-size: 2rem;
      font-weight: 700;
      margin: 0 0 0.7rem 0;
      color: var(--primary-dark);
      word-break: break-word;
      overflow-wrap: anywhere;
    }
    .hero p {
      font-size: 1.18rem;
      color: var(--muted);
      margin: 0 0 1.5rem 0;
      word-break: break-word;
      overflow-wrap: anywhere;
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
      width: 100%;
      box-sizing: border-box;
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
      overflow-wrap: anywhere;
      max-width: 100%;
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
      min-width: 0;
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
      max-width: 100%;
    }
    .cta:hover { background: var(--primary-dark); }
    .features {
      display: grid;
      grid-template-columns: repeat(2, 1fr); /* 2 columns for 2x2 grid */
      gap: 1.5rem;
      margin: 2rem 0 0 0;
      width: 100%;
      box-sizing: border-box;
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
      width: 100%;
      box-sizing: border-box;
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
      width: 100%;
      box-sizing: border-box;
    }
    .examples-tabs {
      display: flex;
      gap: 0.5em;
      margin-bottom: 1.2em;
      border-bottom: 2px solid #e5e7eb;
      width: 100%;
      box-sizing: border-box;
      min-width: 0;
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
      min-width: 0;
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
      width: 100%;
      box-sizing: border-box;
      max-width: 100vw;
    }
    code {
      font-family: 'Fira Mono', 'Consolas', monospace;
      font-size: 1em;
      background: none;
      color: #222;
      word-break: break-word;
      overflow-wrap: anywhere;
      max-width: 100%;
      display: block;
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
      min-width: 0;
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
      width: 100%;
      box-sizing: border-box;
    }
    .more-info-footer ul {
      list-style: none;
      padding: 0;
      margin: 0.5em 0 0 0;
      display: flex;
      flex-wrap: wrap;
      gap: 1.5em;
      justify-content: center;
      width: 100%;
      box-sizing: border-box;
    }
    .more-info-footer a {
      color: var(--primary-dark);
      text-decoration: none;
      font-weight: 500;
      transition: color 0.2s;
    }
    .more-info-footer a:hover { color: var(--primary); }
    @media (max-width: 700px) {
      .header-inner {
        flex-direction: row;
        align-items: center;
        gap: 1.2em;
        width: 100%;
        flex-wrap: nowrap;
      }
      .header-title { flex-shrink: 1; min-width: 0; }
      .github-btn { margin-left: auto; }
      .header-title h1 { font-size: 1.5rem; }
      main { padding: 1.2rem; }
      .hero { padding: 1.2rem 0.7rem 1.2rem 0.7rem; }
      .features { grid-template-columns: 1fr; gap: 1.1rem; }
      .feature-card { min-height: unset; font-size: 0.98em; }
      .api-endpoint-box { padding: 1rem 0.7rem; font-size: 1em; }
      .api-endpoint-url { font-size: 1em; }
      .cta { padding: 0.8rem 1.5rem; font-size: 1rem; }
      .examples-section { margin-top: 1.5rem; }
      .examples-tabs { flex-wrap: wrap; gap: 0.2em; }
      .examples-tab { font-size: 1em; padding: 0.5em 0.7em 0.4em 0.7em; }
      pre { font-size: 0.92rem; padding: 0.8rem 0.5rem; }
      .copy-btn { top: 6px; right: 6px; font-size: 0.9em; padding: 0.15em 0.5em; }
      .api-endpoint-box > div[style*="font-size"] {
        font-size: 0.95em !important;
        white-space: normal;
        word-break: break-word;
        overflow-wrap: anywhere;
      }
    }
    @media (max-width: 500px) {
      .header-inner { padding: 1rem 0.5rem 1rem 0.5rem; }
      .header-title h1 { font-size: 1.1rem; }
      .header-title svg, .header-title img { height: 2.2rem !important; width: 2.2rem !important; }
      main { padding: 0.5rem; }
      .hero { padding: 0.7rem 0.2rem 0.7rem 0.2rem; }
      .features { gap: 0.7rem; }
      .feature-card { padding: 0.7rem 0.5rem; font-size: 0.92em; }
      .api-endpoint-box { padding: 0.7rem 0.3rem; font-size: 0.95em; }
      .api-endpoint-url { font-size: 0.95em; }
      .cta { padding: 0.6rem 1rem; font-size: 0.95rem; }
      .examples-section { margin-top: 1rem; }
      .examples-tabs { gap: 0.1em; }
      .examples-tab { font-size: 0.95em; padding: 0.4em 0.5em 0.3em 0.5em; }
      pre { font-size: 0.88rem; padding: 0.6rem 0.2rem; }
      .copy-btn { top: 4px; right: 4px; font-size: 0.85em; padding: 0.1em 0.3em; }
      .more-info-footer { font-size: 0.98em; padding: 1rem 0.2rem 1rem 0.2rem; }
      .api-endpoint-box > div[style*="font-size"] {
        font-size: 0.88em !important;
      }
    }
    /* Make code blocks and tabs horizontally scrollable on small screens */
    @media (max-width: 700px) {
      .examples-tabs { overflow-x: auto; }
      pre { overflow-x: auto; }
    }
  </style>
  <!-- Prism.js for syntax highlighting -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/themes/prism.min.css">
  <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/prism.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-javascript.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-python.min.js"></script>
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
      <p style="text-wrap: balance;">
        <b>responses.js</b> is an open-source lightweight translation layer between the two main LLM APIs currently available, Responses API &lt;&gt; Chat Completions. <br>
        Works with any Chat Completion API, local or remotely hosted.
      </p>
      <div class="api-endpoint-box">
        <button class="copy-endpoint-btn" onclick="copyEndpointUrl(this)">Copy</button>
        <div><b>API Endpoint:</b></div>
        <span class="api-endpoint-url" id="api-endpoint-url">${baseUrl}</span>
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
          <b>Provider Agnostic</b><br>Works with any Chat Completion API (local or remote).
        </div>
        <div class="feature-card">
          <b>Multi-modal, streaming, structured output</b><br>Supports text and image inputs, streaming output, JSON schema, and function calling.
        </div>
        <div class="feature-card">
          <b>Remote MCP</b><br>Server-side MCP tool execution.
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
        <button class="examples-tab" type="button">MCP</button>
      </div>
      <div class="example-panel active">
        <pre><button class="copy-btn" onclick="copyCode(this)">Copy</button><code class="language-python">from openai import OpenAI
import os

client = OpenAI(
    base_url="${baseUrl}",
    api_key=os.getenv("HF_TOKEN"), # visit https://huggingface.co/settings/tokens
)

response = client.responses.create(
    model="moonshotai/Kimi-K2-Instruct:groq",
    instructions="You are a helpful assistant.",
    input="Tell me a three sentence bedtime story about a unicorn.",
)

print(response)
print(response.output_text)</code></pre>
      </div>
      <div class="example-panel">
        <pre><button class="copy-btn" onclick="copyCode(this)">Copy</button><code class="language-python">from openai import OpenAI
import os

client = OpenAI(
    base_url="${baseUrl}",
    api_key=os.getenv("HF_TOKEN"), # visit https://huggingface.co/settings/tokens
)

response = client.responses.create(
    model="Qwen/Qwen2.5-VL-7B-Instruct",
    input=[
        {
            "role": "user",
            "content": [
                {"type": "input_text", "text": "what is in this image?"},
                {
                    "type": "input_image",
                    "image_url": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Gfp-wisconsin-madison-the-nature-boardwalk.jpg/2560px-Gfp-wisconsin-madison-the-nature-boardwalk.jpg",
                },
            ],
        }
    ],
)

print(response)
print(response.output_text)</code></pre>
      </div>
      <div class="example-panel">
        <pre><button class="copy-btn" onclick="copyCode(this)">Copy</button><code class="language-python">from openai import OpenAI
import os

client = OpenAI(
    base_url="${baseUrl}",
    api_key=os.getenv("HF_TOKEN"), # visit https://huggingface.co/settings/tokens
)

response = client.responses.create(
    model="moonshotai/Kimi-K2-Instruct:groq",
    input=[
        {
            "role": "developer",
            "content": "Talk like a pirate.",
        },
        {
            "role": "user",
            "content": "Are semicolons optional in JavaScript?",
        },
    ],
)

print(response)
print(response.output_text)</code></pre>
      </div>
      <div class="example-panel">
        <pre><button class="copy-btn" onclick="copyCode(this)">Copy</button><code class="language-python">from openai import OpenAI
import os

client = OpenAI(
    base_url="${baseUrl}",
    api_key=os.getenv("HF_TOKEN"), # visit https://huggingface.co/settings/tokens
)

stream = client.responses.create(
    model="moonshotai/Kimi-K2-Instruct:groq",
    input=[
        {
            "role": "user",
            "content": "Say 'double bubble bath' ten times fast.",
        },
    ],
    stream=True,
)

for event in stream:
    print(event)</code></pre>
      </div>
      <div class="example-panel">
        <pre><button class="copy-btn" onclick="copyCode(this)">Copy</button><code class="language-python">from openai import OpenAI
import os

client = OpenAI(
    base_url="${baseUrl}",
    api_key=os.getenv("HF_TOKEN"), # visit https://huggingface.co/settings/tokens
)

tools = [
    {
        "type": "function",
        "name": "get_current_weather",
        "description": "Get the current weather in a given location",
        "parameters": {
            "type": "object",
            "properties": {
                "location": {"type": "string", "description": "The city and state, e.g. San Francisco, CA"},
                "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]},
            },
            "required": ["location", "unit"],
        },
    }
]

response = client.responses.create(
    model="moonshotai/Kimi-K2-Instruct:groq",
    tools=tools,
    input="What is the weather like in Boston today?",
    tool_choice="auto",
)

print(response)</code></pre>
      </div>
      <div class="example-panel">
        <pre><button class="copy-btn" onclick="copyCode(this)">Copy</button><code class="language-python">from openai import OpenAI
from pydantic import BaseModel
import os

client = OpenAI(
    base_url="${baseUrl}",
    api_key=os.getenv("HF_TOKEN"), # visit https://huggingface.co/settings/tokens
)

class CalendarEvent(BaseModel):
    name: str
    date: str
    participants: list[str]

response = client.responses.parse(
    model="moonshotai/Kimi-K2-Instruct:groq",
    input=[
        {"role": "system", "content": "Extract the event information."},
        {
            "role": "user",
            "content": "Alice and Bob are going to a science fair on Friday.",
        },
    ],
    text_format=CalendarEvent,
)

print(response.output_parsed)</code></pre>
      </div>
      <div class="example-panel">
        <pre><button class="copy-btn" onclick="copyCode(this)">Copy</button><code class="language-python">from openai import OpenAI
import os

client = OpenAI(
    base_url="${baseUrl}",
    api_key=os.getenv("HF_TOKEN"), # visit https://huggingface.co/settings/tokens
)

response = client.responses.create(
    model="moonshotai/Kimi-K2-Instruct:groq",
    input="how does tiktoken work?",
    tools=[
        {
            "type": "mcp",
            "server_label": "gitmcp",
            "server_url": "https://gitmcp.io/openai/tiktoken",
            "allowed_tools": ["search_tiktoken_documentation", "fetch_tiktoken_documentation"],
            "require_approval": "never",
        },
    ],
)

for output in response.output:
    print(output)</code></pre>
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
