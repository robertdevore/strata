import { Command } from 'commander'
import type { CliRuntimeOptions } from '../types'
import type { StrataApiClient } from '../lib/apiClient'
import { print_success } from '../lib/output'
import { read_content_input } from '../lib/io'
import { ensure_confirm_or_dry_run } from '../lib/agentMode'
interface Context {
  options: CliRuntimeOptions
  client: StrataApiClient
}
export const register_protocol_commands = (program: Command, getContext: (command: Command) => Context) => {
  program
    .command('capabilities')
    .description('Discover the local API contract.')
    .action(async function () {
      const { options, client } = getContext(this)
      print_success(options, await client.request('GET', '/capabilities'))
    })
  program
    .command('batch')
    .description('Apply an atomic operation batch, or validate it with --dry-run.')
    .option('--file <path>', 'JSON request or JSONL operations')
    .option('--stdin', 'Read JSON/JSONL from standard input')
    .option('--request-id <id>', 'Idempotency key for retries')
    .action(async function (flags: { file?: string; stdin?: boolean; requestId?: string }) {
      const { options, client } = getContext(this)
      ensure_confirm_or_dry_run(options, 'batch')
      const text = await read_content_input(flags)
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        parsed = {
          operations: text
            .split(/\r?\n/)
            .filter((line) => line.trim())
            .map((line) => JSON.parse(line)),
        }
      }
      const request = Array.isArray(parsed) ? { operations: parsed } : (parsed as Record<string, unknown>)
      print_success(
        options,
        await client.request('POST', '/batch', {
          body: { ...request, dryRun: options.dryRun },
          idempotencyKey: flags.requestId,
        }),
      )
    })
  const history = program.command('history').description('Inspect and restore note revisions.')
  history.command('list <id>').action(async function (id: string) {
    const { options, client } = getContext(this)
    print_success(options, await client.request('GET', `/notes/${id}/history`))
  })
  history
    .command('restore <id> <revision>')
    .requiredOption('--if-revision <revision>', 'Current revision to protect against concurrent edits')
    .action(async function (id: string, revision: string, flags: { ifRevision: string }) {
      const { options, client } = getContext(this)
      ensure_confirm_or_dry_run(options, 'history restore')
      const body = { revision: Number(revision), expectedRevision: Number(flags.ifRevision) }
      if (options.dryRun) {
        print_success(options, { action: 'history.restore', id, ...body }, { dryRun: true })
        return
      }
      print_success(options, await client.request('POST', `/notes/${id}/restore`, { body }))
    })
}
