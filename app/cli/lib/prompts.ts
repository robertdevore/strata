import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

export const is_interactive_tty = (): boolean => {
	return Boolean(process.stdin.isTTY && process.stdout.isTTY)
}

export const confirm_interactively = async (message: string): Promise<boolean> => {
	if (!is_interactive_tty()) return false
	const rl = readline.createInterface({ input, output })
	try {
		const answer = await rl.question(`${message} Type yes to continue: `)
		return 'yes' === answer.trim().toLowerCase()
	} finally {
		rl.close()
	}
}
