# Forked from https://github.com/openai/openai-responses-starter-app

# Responses starter app

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
![NextJS](https://img.shields.io/badge/Built_with-NextJS-blue)
![OpenAI API](https://img.shields.io/badge/Powered_by-OpenAI_API-orange)

This folder contains a NextJS starter app built on top of the [Responses API](https://platform.openai.com/docs/api-reference/responses).
It implements a chat interface with multi-turn conversation handling, tool calling and more. Use it as a demo from responses.js.

Features:

- Multi-turn conversation handling
- Web search tool configuration
- Vector store creation & file upload for use with the file search tool
- Function calling
- Streaming responses & tool calls
- Display annotations

This app is meant to be used as a starting point to build a conversational assistant that you can customize to your needs.

## How to use

1. **Configure environment**

Write this to a new file called `.env`:

```
OPENAI_BASE_URL=http://localhost:3000/v1
OPENAI_API_KEY=<your-hf-token>
```

3. **Install dependencies:**

Run in the project root:

```bash
npm install
```

4. **Run the app:**

```bash
npm run dev
```

The app will be available at [`http://localhost:3001`](http://localhost:3001).

## License

This project is licensed under the MIT License. See the LICENSE file for details.
