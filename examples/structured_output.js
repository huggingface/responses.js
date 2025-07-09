import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

const openai = new OpenAI({ baseURL: "http://localhost:3000/v1", apiKey: process.env.HF_TOKEN });

const CalendarEvent = z.object({
	name: z.string(),
	date: z.string(),
	participants: z.array(z.string()),
});

const response = await openai.responses.parse({
	model: "novita@meta-llama/Meta-Llama-3-70B-Instruct",
	instructions: "Extract the event information.",
	input: "Alice and Bob are going to a science fair on Friday.",
	text: {
		format: zodTextFormat(CalendarEvent, "calendar_event"),
	},
});

console.log(response.output_parsed);
