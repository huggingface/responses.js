# responses.js

A lightweight Express.js server that implements OpenAI's Responses API, built on top of Chat Completions and powered by Hugging Face Inference Providers.

## ✨ Features

- **OpenAI Compatibility**: Partial implementation of OpenAI's Responses API
- **Inference Providers**: Powered by Hugging Face Inference Providers (chat completion API)
- **Streaming Support**: Support for streamed responses
- **Structured Output**: Support for structured data responses (e.g. jsonschema)
- **Function Calling**: Tool and function calling capabilities
- **Multi-modal Input**: Text and image input support
- **Demo UI**: Interactive web interface for testing

Not implemented yet: remote function calling, MCP server, file upload, stateful API, etc.

## 🚀 Quick Start

### Prerequisites

- Node.js (v18 or higher)
- pnpm (recommended) or npm
- an Hugging Face token with inference permissions. Create one from your [user settings](https://huggingface.co/settings/tokens).

### Installation & Setup

```bash
# Clone the repository
git clone https://github.com/huggingface/responses.js.git
cd responses.js

# Install dependencies
pnpm install

# Start the development server
pnpm dev
```

The server will be available at `http://localhost:3000`.

### Running Examples

Explore the various capabilities with our example scripts located in the [./examples](./examples) folder:

```bash
# Basic text input
pnpm run example text

# Multi-turn conversations
pnpm run example multi_turn

# Text + image input
pnpm run example image

# Streaming responses
pnpm run example streaming

# Structured output
pnpm run example structured_output
pnpm run example structured_output_streaming

# Function calling
pnpm run example function
pnpm run example function_streaming
```

### Interactive Demo UI

Experience the API through our interactive web interface, adapted from the [openai-responses-starter-app](https://github.com/openai/openai-responses-starter-app).

#### Setup

1. Create a configuration file:

```bash
# Create demo/.env
cat > demo/.env << EOF
MODEL="cohere@CohereLabs/c4ai-command-a-03-2025"
OPENAI_BASE_URL=http://localhost:3000/v1
OPENAI_API_KEY=<your-huggingface-token>
EOF
```

2. Install demo dependencies:

```bash
pnpm demo:install
```

3. Launch the demo:

```bash
pnpm demo:run
```

The demo will be available at `http://localhost:3001`.

## 📁 Project Structure

```
responses.js/
├── demo/             # Interactive chat UI demo
├── examples/         # Example scripts using openai-node client
├── src/
│   ├── index.ts      # Application entry point
│   ├── server.ts     # Express app configuration and route definitions
│   ├── routes/       # API route implementations
│   ├── middleware/   # Middleware (validation, logging, etc.)
│   └── schemas/      # Zod validation schemas
├── scripts/          # Utility and build scripts
├── package.json      # Package configuration and dependencies
└── README.md         # This file
```

## 🛣️ Roadmap

> **Note**: This project is in active development. The roadmap below represents our current priorities and may evolve. Do not take anything for granted.

### ✅ Completed

- [x] OpenAI types integration for consistent output
- [x] Streaming mode support
- [x] Structured output capabilities
- [x] Function calling implementation
- [x] Repository migration to dedicated responses.js repo
- [x] Basic development tooling setup
- [x] Demo application with comprehensive instructions

### 📋 For later

- [ ] Multi-turn conversation fixes for text messages + tool calls
- [ ] Correctly return "usage" field
- [ ] Conversation state management
- [ ] Tools execution (web search, file search, image generation, MCP, code interpreter)
- [ ] Background mode support
- [ ] Additional API routes (GET, DELETE, CANCEL, LIST responses)
- [ ] Reasoning capabilities

## 🤝 Contributing

We welcome contributions! Please feel free to submit issues, feature requests, or pull requests.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Based on OpenAI's [Responses API specification](https://platform.openai.com/docs/api-reference/responses)
- Built on top of [OpenAI's nodejs client](https://github.com/openai/openai-node)
- Demo UI adapted from [openai-responses-starter-app](https://github.com/openai/openai-responses-starter-app)
- Built on top of [Hugging Face Inference Providers](https://huggingface.co/docs/inference-providers/index)
