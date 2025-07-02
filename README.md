# responses.js

A lightweight express.js server implementing OpenAI’s Responses API, built on top of Chat Completions, powered by Hugging Face Inference Providers.

## 📁 Project Structure

```
responses.js/
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

