import OpenAI from "openai";

const openai = new OpenAI({ baseURL: "http://localhost:3000/v1", apiKey: process.env.HF_TOKEN });

const prompt = `Say hello to the world.`;

const stream = await openai.responses.create({
	model: "deepseek-ai/DeepSeek-R1",
	instructions: "You are a helpful assistant.",
	input: prompt,
	reasoning: {
		effort: "low",
	},
	stream: true,
});

for await (const event of stream) {
	if (event.type === "response.created") {
		console.log("📝 Response created");
	} else if (event.type === "response.in_progress") {
		console.log("  ⏳ Processing...");
	} else if (event.type === "response.output_item.added") {
		const emoji = event.item.type === "reasoning" ? "🤔" : "💬";
		console.log(`   ${emoji} ${event.item.type}`);
	} else if (event.type === "response.content_part.added") {
		console.log(`    📄 ${event.part.type}`);
	} else if (event.type === "response.output_item.done") {
		console.log(`  ✅ ${event.item.type}`);
	} else if (event.type === "response.content_part.done") {
		console.log(`    ✅ ${event.part.type}`);
	} else if (event.type === "response.completed") {
		console.log("🎉 Response completed");
		for (const [index, item] of event.response.output.entries()) {
			console.log(`Output #${index}: ${item.type}`, item.content);
		}
	}
}
