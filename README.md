# responses.js

A lightweight express.js server implementing OpenAI’s Responses API, built on top of Chat Completions, powered by Hugging Face Inference Providers.

## 🚀 Quick Start

### Start server

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev
```

### Run examples

Some example scripts are implemented in the [./examples](./examples) folder.

You can run them using:

```bash
# Text input
pnpm run example text

# Multi-turn text input
pnpm run example multi_turn

# Text + image input
pnpm run example image

# Streaming
pnpm run example streaming

# Structured output
pnpm run example structured_output
pnpm run example structured_output_streaming

# Function calling
pnpm run example function
pnpm run example function_streaming
```

## 📁 Project Structure

```
responses.js/
├── demo/             # Chat UI for demo
├── examples/         # Example scripts using openai-node client
├── src/
│   ├── index.ts           
│   ├── server.ts     # Express app configuration (e.g. route definition)
│   ├── routes/       # Routes implementation
│   ├── middleware/   # Middlewares (validation + logging)
│   └── schemas/      # Zod validation schemas
├── scripts/          # Utility scripts
├── package.json      # Package configuration
```

### Run demo UI

The [./demo](./demo) folder contains simple UI to play with the API. It is adapted from [openai-responses-starter-app](https://github.com/openai/openai-responses-starter-app).

First you need to configure the demo by creating a `demo/.env` file:

```bash
# ./demo/.env
MODEL="cohere@CohereLabs/c4ai-command-a-03-2025"
OPENAI_BASE_URL=http://localhost:3000/v1
OPENAI_API_KEY=<your-hf-token>
```

Then run the following command to install the demo dependencies (Next.js, etc.)

```bash
pnpm demo:install
```

Finally, run the UI with

```bash
pnpm demo:run
```

## Roadmap

(to take with a grain of salt, this is still an early stage repo)

- [x] use openai types for output https://github.com/huggingface/huggingface.js/pull/1580
- [x] streaming mode https://github.com/huggingface/huggingface.js/pull/1582
- [x] structured output https://github.com/huggingface/huggingface.js/pull/1586
- [x] function calling https://github.com/huggingface/huggingface.js/pull/1587
- [x] https://github.com/huggingface/huggingface.js/pull/1588
- [x] move its own **responses.js** repo https://github.com/huggingface/responses.js/pull/1
- [x] add basic tooling in repo https://github.com/huggingface/responses.js/pull/2
- [x] add demo app + instructions https://github.com/huggingface/responses.js/pull/3
- [ ] fix multi-turn when combo of text messages + tool calls
- [ ] implement `usage` return value
- [ ] implement [conversation state](https://platform.openai.com/docs/guides/conversation-state?api-mode=responses)
- [ ] implement [tools execution](https://platform.openai.com/docs/guides/tools?api-mode=responses) (web search, file search, image generation, MCP, code interpreter, etc.)
- [ ] add support for background mode
- [ ] add routes: get, delete, cancel, list responses
- [ ] add support for reasoning
