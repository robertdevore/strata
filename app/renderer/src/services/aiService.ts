import type { AiChatResponse, AiMessage, AiSearchResult, AiThreadSummary, AiTranscriptionResult } from '@shared/types'

export const aiService = {
	listThreads(): Promise<AiThreadSummary[]> {
		return window.strata.ai.listThreads()
	},
	deleteThread(thread_id: string): Promise<boolean> {
		return window.strata.ai.deleteThread(thread_id)
	},
	listMessages(thread_id: string): Promise<AiMessage[]> {
		return window.strata.ai.listMessages(thread_id)
	},
	sendMessage(payload: { threadId?: string; message: string }): Promise<AiChatResponse> {
		return window.strata.ai.sendMessage(payload)
	},
	searchChats(query: string): Promise<AiSearchResult[]> {
		return window.strata.ai.searchChats(query)
	},
	transcribeAudio(payload: { base64Audio: string; mimeType: string; prompt?: string; language?: string }): Promise<AiTranscriptionResult> {
		return window.strata.ai.transcribeAudio(payload)
	},
}
