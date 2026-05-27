#!/usr/bin/env node
// Strata AI CLI — agent-friendly CLI for Strata's local notes HTTP API
// Usage: npm run strata:ai -- <command> [args...]
// Environment: STRATA_API_BASE_URL=http://127.0.0.1:3939 STRATA_API_TOKEN=

import { argv, env, exit } from 'node:process'

const API_BASE = env.STRATA_API_BASE_URL || 'http://127.0.0.1:3939'
const API_TOKEN = env.STRATA_API_TOKEN || ''

const args = argv.slice(2)
const dry_run = args.includes('--dry-run')
const json_output = args.includes('--json')
const clean_args = args.filter((a) => !a.startsWith('--'))

const command = clean_args[0]
const input = clean_args.slice(1).join(' ')

const api = async (method, path, body) => {
	const url = `${API_BASE}${path}`
	const headers = { 'Content-Type': 'application/json' }
	if (API_TOKEN) headers['Authorization'] = `Bearer ${API_TOKEN}`

	const options = { method, headers }
	if (body) options.body = JSON.stringify(body)

	if (dry_run) {
		const dry = options.body ? JSON.parse(options.body) : null
		return { dry_run: true, method, url, body: dry }
	}

	const response = await fetch(url, options)
	if (!response.ok) {
		const text = await response.text().catch(() => '')
		throw new Error(`API ${method} ${path} failed (${response.status}): ${text}`)
	}
	return response.json()
}

const output = (data) => {
	if (json_output) {
		console.log(JSON.stringify(data, null, 2))
	} else {
		console.log(data)
	}
}

const main = async () => {
	try {
		switch (command) {
			case 'health': {
				const result = await api('GET', '/health')
				output(result)
				break
			}

			case 'route': {
				if (!input) {
					console.error('Usage: npm run strata:ai -- route "your message"')
					exit(1)
				}
				// The CLI doesn't have direct access to the router.
				// Instead we send the message via the chat API and note the routing.
				// For now, we just echo the input for agent consumption.
				const result = { input, status: 'Route evaluation would happen server-side. Use the Strata app to see routing decisions.' }
				output(result)
				break
			}

			case 'note': {
				if (!input) {
					console.error('Usage: npm run strata:ai -- note "content"')
					exit(1)
				}
				// Clean input into Markdown with a title
				const content = input.startsWith('#') ? input : `# ${input.slice(0, 80)}\n\n${input}`
				const result = await api('POST', '/notes', { content, tags: [] })
				output(result)
				break
			}

			case 'search': {
				if (!input) {
					console.error('Usage: npm run strata:ai -- search "query"')
					exit(1)
				}
				const result = await api('GET', `/search?q=${encodeURIComponent(input)}`)
				output(result)
				break
			}

			case 'tasks': {
				if (!input) {
					console.error('Usage: npm run strata:ai -- tasks "query or empty"')
					exit(1)
				}
				// Search notes for tasks/TODOs
				const query = input || 'TODO'
				const result = await api('GET', `/search?q=${encodeURIComponent(query)}`)
				output(result)
				break
			}

			case 'tags': {
				const result = await api('GET', '/tags')
				output(result)
				break
			}

			case 'bench': {
				const start = Date.now()
				const health = await api('GET', '/health')
				const tags = await api('GET', '/tags')
				const search = await api('GET', '/search?q=test')
				const elapsed = Date.now() - start
				const tags_count = Array.isArray(tags?.tags) ? tags.tags.length : 0
				output({ health, tags_count, search_ok: !!search, elapsed_ms: elapsed })
				break
			}

			default: {
				console.error(`Strata AI CLI — Usage:`)
				console.error(`  npm run strata:ai -- health`)
				console.error(`  npm run strata:ai -- route "..."`)
				console.error(`  npm run strata:ai -- note "..."`)
				console.error(`  npm run strata:ai -- search "..."`)
				console.error(`  npm run strata:ai -- tasks "..."`)
				console.error(`  npm run strata:ai -- tags`)
				console.error(`  npm run strata:ai -- bench`)
				console.error(``)
				console.error(`Options: --dry-run  --json`)
				console.error(`Env: STRATA_API_BASE_URL=${API_BASE} STRATA_API_TOKEN=...`)
				exit(1)
			}
		}
	} catch (err) {
		console.error(err instanceof Error ? err.message : 'Unknown error')
		exit(1)
	}
}

void main()
