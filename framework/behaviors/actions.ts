/**
 * The `actions` command behavior: the whole routing surface of a named-action command.
 *
 * The framework owns this surface and nothing in it belongs to the extension: the argument is
 * trimmed and lowercased, matched whole against the command's declared action names, and either
 * routed to the one implementation that action names or answered with the help derived from the
 * declaration. There is no abbreviation, no fuzzy match, no default action and no extra
 * argument, and the unrecognized-argument member of a *directed* command is deliberately not
 * consulted — an `actions` command has its own vocabulary, and borrowing the directed one would
 * make a mistyped argument able to reach business code.
 *
 * Completion is the contract. An action may return a promise, and this module waits for it before
 * the command concludes: the host's command chain receives a promise, so the operator's command
 * finishes with the effect rather than beside it. An error that reaches the framework — a
 * synchronous throw or a rejected promise — is reported exactly once on the unified feedback
 * channel at `error` severity, and the framework then concludes normally: it retries nothing,
 * rolls nothing back, and says nothing about success, because whether an effect happened is
 * something only the action knows.
 *
 * This module is harness-independent: it reads the invocation facts and the declaration, and
 * names no native API.
 */
import {
	type ActionsCommandImplementation,
	type CommandAction,
	normalizeCommandArgument,
} from "../core/assembly";
import type { CommandActionsDeclaration } from "../core/definition";
import type { ActionDelivery, CommandInvocation } from "../core/protocol";

/**
 * The help one `actions` command prints: the command's own line, then one line per declared
 * action in declaration order.
 *
 * The words are the declaration's — the command's description and each action's — so the help
 * can never drift from the table the routing matches against, and the operator reads the same
 * text whether the argument was empty or unrecognized.
 */
export function actionsHelp(command: CommandActionsDeclaration): string {
	const header = command.description === undefined ? `/${command.name}` : `/${command.name} — ${command.description}`;
	const lines = [header];
	for (const [action, description] of Object.entries(command.actions)) lines.push(`  ${action} — ${description}`);
	return lines.join("\n");
}

/**
 * Routes one `actions` invocation to its action, or answers it with the help.
 *
 * Returns `undefined` for an answered invocation and the action's own completion otherwise, so
 * the caller can hand the harness a promise that is exactly as long as the effect.
 */
export function runCommandActions(
	command: CommandActionsDeclaration,
	invocation: CommandInvocation,
	implementation: ActionsCommandImplementation,
): void | Promise<void> {
	const requested = normalizeCommandArgument(invocation.args);
	if (requested.length === 0) {
		invocation.feedback.notify("info", actionsHelp(command));
		return;
	}

	const declared = Object.keys(command.actions).find(name => normalizeCommandArgument(name) === requested);
	if (declared === undefined) {
		// The same help, at error severity, and no business code runs: a mistyped argument is an
		// operator mistake, never an operation with a default action.
		invocation.feedback.notify("error", actionsHelp(command));
		return;
	}

	const action: CommandAction | undefined = implementation[declared];
	if (action === undefined) {
		// Unreachable through binding — the pair was completed at validation — and kept explicit so
		// an implementation that arrived from plain JavaScript can never run nothing silently.
		invocation.feedback.notify("error", actionsHelp(command));
		return;
	}

	// Explicitly the approved delivery surface, never the invocation itself: the invocation also
	// carries the persistence path and the marker area transport, which an action never uses.
	const delivery: ActionDelivery = {
		args: invocation.args,
		owner: invocation.owner,
		hasUI: invocation.hasUI,
		canAcceptInput: invocation.canAcceptInput,
		provider: invocation.provider,
		feedback: invocation.feedback,
	};
	return Promise.resolve()
		.then(() => action(delivery))
		.catch((error: unknown) => {
			const detail = error instanceof Error ? error.message : String(error);
			invocation.feedback.notify("error", `/${command.name} ${declared} failed: ${detail}`);
		});
}
