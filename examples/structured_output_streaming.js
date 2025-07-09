import { OpenAI } from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

const CalendarEvent = z.object({
	name: z.string(),
	date: z.string(),
	participants: z.array(z.string()),
});

const openai = new OpenAI({ baseURL: "http://localhost:3000/v1", apiKey: process.env.HF_TOKEN });
const stream = openai.responses.stream({
	model: "nebius@Qwen/Qwen2.5-VL-72B-Instruct",
	instructions: "Extract the event information.",
	input: "Alice and Bob are going to a science fair on Friday.",
	text: {
		format: zodTextFormat(CalendarEvent, "calendar_event"),
	},
});

for await (const event of stream) {
	console.log(event);
}

const result = await stream.finalResponse();
console.log(result.output_parsed);
