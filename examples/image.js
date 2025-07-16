import OpenAI from "openai";

const openai = new OpenAI({ baseURL: "http://localhost:3000/v1", apiKey: process.env.HF_TOKEN });

const response = await openai.responses.create({
	model: "meta-llama/Llama-4-Scout-17B-16E-Instruct:groq",
	input: [
		{
			role: "user",
			content: [
				{ type: "input_text", text: "what is in this image?" },
				{
					type: "input_image",
					image_url:
						"https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Gfp-wisconsin-madison-the-nature-boardwalk.jpg/2560px-Gfp-wisconsin-madison-the-nature-boardwalk.jpg",
				},
			],
		},
	],
});

console.log(response);
console.log(response.output_text);
