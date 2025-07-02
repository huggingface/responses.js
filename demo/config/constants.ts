export const MODEL = process.env.MODEL;

// Developer prompt for the assistant
export const SYSTEM_PROMPT = `
You are a helpful assistant helping users with their queries.
If they need up to date information, you can use the web search tool to search the web for relevant information. Only use web search once at a time, if you've already used it an there is no new information, don't use it again.
If they ask for something that is related to their own data, use the file search tool to search their files for relevant information.
If they ask something that could be solved through code, use the code interpreter tool to solve it.
`;

// Here is the context that you have available to you:
// ${context}

// Initial message that will be displayed in the chat
export const INITIAL_MESSAGE = `
Hi, how can I help you?
`;

export const defaultVectorStore = {
	id: "",
	name: "Example",
};
