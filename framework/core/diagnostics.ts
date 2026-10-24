/**
 * The framework's non-model diagnostic output, shared by general modules and
 * harness binding diagnostics. It never appends messages to a conversation.
 */
export function reportDiagnostic(message: string): void {
	process.stderr.write(`${message}\n`);
}
