import type { AiChatResponse, AiMessage, AiOpenNoteContext, AiRouteLog, AiSearchResult, AiThreadSummary, AiTranscriptionResult } from '@shared/types'

export const aiService = {
	listThreads(): Promise<AiThreadSummary[]> {
		return window.strata.ai.listThreads()
	},
	deleteThread(thread_id: string): Promise<boolean> {
		return window.strata.ai.deleteThread(thread_id)
	},
	renameThread(thread_id: string, title: string): Promise<boolean> {
		return window.strata.ai.renameThread(thread_id, title)
	},
	listMessages(thread_id: string): Promise<AiMessage[]> {
		return window.strata.ai.listMessages(thread_id)
	},
	sendMessage(payload: { threadId?: string; message: string; openNotes?: AiOpenNoteContext[] }): Promise<AiChatResponse> {
		return window.strata.ai.sendMessage(payload)
	},
	searchChats(query: string): Promise<AiSearchResult[]> {
		return window.strata.ai.searchChats(query)
	},
	transcribeAudio(payload: { base64Audio: string; mimeType: string; prompt?: string; language?: string }): Promise<AiTranscriptionResult> {
		return window.strata.ai.transcribeAudio(payload)
	},
	listRouteLogs(thread_id?: string): Promise<AiRouteLog[]> {
		return window.strata.ai.listRouteLogs(thread_id)
	},
	setThreadModel(thread_id: string, model: string): Promise<boolean> {
		return window.strata.ai.setThreadModel(thread_id, model)
	},
	modelCatalog(): Promise<Array<{ providerId: string; providerLabel: string; model: string }>> {
		return window.strata.ai.modelCatalog()
	},
}
