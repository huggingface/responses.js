/*
 * This file is a patch to the openai library to add support for the reasoning parameter.
 * Once openai's official JS SDK supports sending back raw CoT, we will remove this file.
 */
import type {
	ResponseReasoningItem as OpenAIResponseReasoningItem,
	ResponseStreamEvent as OpenAIResponseStreamEvent,
	ResponseOutputRefusal,
	ResponseOutputText,
} from "openai/resources/responses/responses";

export interface ReasoningTextContent {
	type: "reasoning_text";
	text: string;
}
export type PatchedResponseReasoningItem = OpenAIResponseReasoningItem & {
	// Raw CoT returned in reasoning item (in addition to the summary)
	content: ReasoningTextContent[];
};

interface PatchedResponseReasoningTextDeltaEvent {
	type: "response.reasoning_text.delta";
	sequence_number: number;
	item_id: string;
	output_index: number;
	content_index: number;
	delta: string;
}

interface PatchedResponseReasoningTextDoneEvent {
	type: "response.reasoning_text.done";
	sequence_number: number;
	item_id: string;
	output_index: number;
	content_index: number;
	text: string;
}

export type PatchedResponseStreamEvent =
	| OpenAIResponseStreamEvent
	| PatchedResponseReasoningTextDeltaEvent
	| PatchedResponseReasoningTextDoneEvent;

export type PatchedResponseContentPart = ResponseOutputText | ResponseOutputRefusal;
