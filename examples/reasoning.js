import OpenAI from "openai";

const openai = new OpenAI({ baseURL: "http://localhost:3000/v1", apiKey: process.env.HF_TOKEN });

const prompt = `Say hello to the world.`;

const response = await openai.responses.create({
	model: "deepseek-ai/DeepSeek-R1",
	instructions: "You are a helpful assistant.",
	input: prompt,
	reasoning: {
		effort: "low",
	},
});

for (const [index, item] of response.output.entries()) {
	console.log(`Output #${index}: ${item.type}`, item.content);
}
