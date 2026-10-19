/**
 * One independent process that follows an Owner another process serves, reading it the way a
 * session this harness ran elsewhere does.
 *
 * This is the following half of the two-process suite: it runs production code only — the
 * framework's binding and `StateStore` with the read its assembly hands it (the reading half of the
 * framework's local access, wired from the same shared configuration the serving process reads) —
 * and what it answers is the extension's own public consumption of that State: whether a run
 * initiation contributes its prompt, what a session delivery reads, and what the marker projected.
 * The plan says which seat to follow and where the shared configuration is; the commands on stdin
 * ask it to read.
 *
 * It is a real process on purpose: whether a session this harness ran elsewhere reaches the Owner
 * that holds the value, what it reads while that process is not there, and what it reads once the
 * Owner is served again, are facts about two real processes and the carrier between them, not about
 * an in-memory stand-in.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { type FollowedAccessReader } from "../../../framework/core/followed-owners";
import { openOwnerAccess } from "../../../framework/modules/local-access";
import { type ExtensionDefinition, defineExtension } from "../../../framework/public";
import { portDouble } from "./harness-port-double";

/** What one following process is asked to do. */
export interface FollowedOwnerChildPlan {
	/** The extension whose declared values both processes serve and read. */
	readonly extension: string;
	/** The owner key the seat is named by: the session that holds the value. */
	readonly owner: string;
	/** The framework's shared configuration file both processes resolve their runtime directory from. */
	readonly configPath: string;
	/** Where this process states what it read. */
	readonly resultPath: string;
}

/** What one following process read, as one answer line. */
export interface FollowedOwnerChildReport {
	/** What the last ask answered: a run initiation's contribution, a session delivery, or nothing. */
	readonly kind: "value" | "delivery";
	/** Whether the extension's public consumption read the Owner as active. */
	readonly active: boolean;
	/** The lines its marker projected for the followed seat, when the ask was a run initiation. */
	readonly markers?: readonly string[];
	/** The values this process recorded for the delivery, which a follow never has any of. */
	readonly persisted?: number;
}

/** What one following process holds when it is asked to finish. */
export interface FollowedOwnerChildResult {
	/** The commands it acted on, in order. */
	readonly commands: readonly string[];
	/** The values it recorded in its own persistence medium across every delivery, in order. */
	readonly persisted: readonly boolean[];
	/** Whether its reader reported a seat it could not reach, which the default then stands in for. */
	readonly unreachable: boolean;
}

const plan = JSON.parse(readFileSync(process.argv[2] ?? "", "utf8")) as FollowedOwnerChildPlan;
const commands: string[] = [];

/** The extension whose field declares `follow`, with the three consumption points a read appears in. */
export const FOLLOWED_PROBE: ExtensionDefinition = defineExtension({
	id: plan.extension,
	displayName: "followedOwnerProbe",
	state: { inheritance: "follow" },
	prompts: [{ tag: "init", strategy: "first-enabled-run", content: "the followed probe's contribution" }],
	marker: { text: "◈ followedOwnerProbe" },
});

/**
 * The reading half, wired the way the pi assembly wires it: this extension's identity and the
 * owner's key are the seat, and the shared configuration is what both ends resolve the runtime
 * directory from.
 */
const reader: FollowedAccessReader = {
	open: (owner, { waitMs }) =>
		openOwnerAccess({
			target: { extension: plan.extension, owner },
			configPath: plan.configPath,
			waitMs,
		}),
};

const double = portDouble({ follow: reader });
const persisted: boolean[] = [];
const readByDelivery: boolean[] = [];
double.bind(FOLLOWED_PROBE, {
	subscriptions: [
		{
			scope: "session",
			events: {
				session_start: delivery => void readByDelivery.push(delivery.capability.state.read()),
			},
		},
	],
});

/** What one ask answers. */
async function value(): Promise<FollowedOwnerChildReport> {
	const run = await double.initiateRun({ kind: "inherited", key: plan.owner });
	return {
		kind: "value",
		active: run.contribution !== undefined,
		markers: run.markers[run.markers.length - 1] ?? [],
	};
}

/** What one delivery this process receives reads and records. */
function delivery(): FollowedOwnerChildReport {
	const boundary = double.deliverSession(
		{ kind: "inherited", key: plan.owner },
		{
			session: { sessionId: "followed-owner-child", kind: "sub", parentSessionId: plan.owner, unavailable: [] },
		},
	);
	for (const record of boundary.persisted) persisted.push(record.enabled === true);
	return {
		kind: "delivery",
		active: readByDelivery[readByDelivery.length - 1] ?? false,
		persisted: boundary.persisted.length,
	};
}

/** States one answer as one line, so the process that started this one reads it as a report. */
function report(answer: FollowedOwnerChildReport): void {
	process.stdout.write(`${JSON.stringify(answer)}\n`);
}

let answering: Promise<void> = Promise.resolve();

function act(command: { readonly t?: string }): void {
	switch (command.t) {
		case "read":
			commands.push("read");
			answering = answering.then(async () => report(await value()));
			return;
		case "deliver":
			commands.push("deliver");
			answering = answering.then(() => report(delivery()));
			return;
		case "dispose":
			// The end of the access this process reads through: nothing it opened is kept, and no
			// later read opens one again.
			double.state.dispose();
			commands.push("dispose");
			return;
		case "quit":
			commands.push("quit");
			writeFileSync(
				plan.resultPath,
				JSON.stringify({ commands, persisted, unreachable: false } satisfies FollowedOwnerChildResult),
				"utf8",
			);
			process.exit(0);
			return;
		default:
			return;
	}
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk: string) => {
	buffer += chunk;
	let end = buffer.indexOf("\n");
	while (end >= 0) {
		const line = buffer.slice(0, end);
		buffer = buffer.slice(end + 1);
		if (line.trim().length > 0) act(JSON.parse(line) as { t?: string });
		end = buffer.indexOf("\n");
	}
});
process.stdin.on("end", () => process.exit(0));

process.stdout.write(`${JSON.stringify({ t: "ready" })}\n`);
