export const SIDEBAR_SECTION_IDS = ['tags', 'projects', 'pinned', 'notes'] as const

export type SidebarSectionId = typeof SIDEBAR_SECTION_IDS[number]

export interface SidebarLayoutSettings {
	showSearch: boolean
	sectionOrder: SidebarSectionId[]
	sectionVisibility: Record<SidebarSectionId, boolean>
}

export const DEFAULT_SIDEBAR_LAYOUT: SidebarLayoutSettings = {
	showSearch: true,
	sectionOrder: [...SIDEBAR_SECTION_IDS],
	sectionVisibility: {
		tags: true,
		projects: true,
		pinned: true,
		notes: true,
	},
}

const is_sidebar_section_id = (value: unknown): value is SidebarSectionId => (
	'tags' === value || 'projects' === value || 'pinned' === value || 'notes' === value
)

export const normalize_sidebar_layout = (value: unknown): SidebarLayoutSettings => {
	if (!value || 'object' !== typeof value) return DEFAULT_SIDEBAR_LAYOUT

	const raw = value as Partial<SidebarLayoutSettings> & {
		sectionVisibility?: Partial<Record<SidebarSectionId, unknown>>
	}

	const visibility = { ...DEFAULT_SIDEBAR_LAYOUT.sectionVisibility }
	for (const section_id of SIDEBAR_SECTION_IDS) {
		const next = raw.sectionVisibility?.[section_id]
		if ('boolean' === typeof next) {
			visibility[section_id] = next
		}
	}

	const order = Array.isArray(raw.sectionOrder)
		? raw.sectionOrder.filter(is_sidebar_section_id)
		: [...SIDEBAR_SECTION_IDS]

	const normalized_order = [...new Set([...order, ...SIDEBAR_SECTION_IDS])]
	return {
		showSearch: 'boolean' === typeof raw.showSearch ? raw.showSearch : DEFAULT_SIDEBAR_LAYOUT.showSearch,
		sectionOrder: normalized_order,
		sectionVisibility: visibility,
	}
}
