/**
 * connect-bot's declared request budget (P14): `requestTimeoutMs` is a requirement of the
 * extension's own `config.yaml`, and that file is its single source.
 *
 * The seams under test are the extension's own: the file the repository ships, read and
 * validated through the framework's configuration interface; the binding of the extension's
 * declared fields against a document supplied in memory, observed through the harness-neutral
 * port double, which is where a missing or illegal value must come out as one `configuration`
 * failure with a non-model report and nothing registered; and the extension's own
 * `connectBotConfig()` read, which is how its shared logic gets the validated values.
 *
 * A validated configuration is recorded once per extension per process, and a refused one is
 * recorded not at all, so every binding here declares the extension's own fields under an id of
 * its own: each case reaches the document it supplies rather than a value an earlier case
 * recorded for connect-bot. The panel is a fake transport injected through the extension's own
 * outbound seam, so a request — which only the extension's registered command and its lifecycle
 * handlers can make — is observed without a network.
 */
import { afterEach, describe, expect, test } from "bun:test";
import * as path from "node:path";
import {
	type PushFetchInit,
	type PushHttpResponse,
	type PushTransport,
	EVENTS_PATH,
	setPushTransportForTest,
} from "../../extensions/connect-bot/shared-logic/panel/client";
import { connectBotConfig } from "../../extensions/connect-bot/shared-logic/panel/config";
import { CONNECT_BOT } from "../../extensions/connect-bot/definition";
import connectBot from "../../entrypoints/omp/connect-bot";
import { getConfig, readConfig } from "../../framework/core/config";
import type { ExtensionDefinition } from "../../framework/core/definition";
import type { BindingResult } from "../../framework/core/protocol";
import { portDouble } from "../framework/support/harness-port-double";
import { REPO_ROOT } from "../harness-dock/baseline";
import { ompDouble } from "./support/omp-double";

/** The endpoint the extension's own `config.yaml` ships; the file is the only source. */
const ENDPOINT = "http://127.0.0.1:8787";
/** The request budget the extension's own `config.yaml` ships, in milliseconds. */
const SHIPPED_TIMEOUT_MS = 1000;
/** The requirement under test, as the extension declares it. */
const REQUEST_TIMEOUT_FIELD = "requestTimeoutMs";
/** The extension's own declared file, under the extension repository the assembly derives. */
const SHIPPED_CONFIG_FILE = path.join(REPO_ROOT, "extensions", "connect-bot", "config.yaml");
/** What the shipped file requires, as the framework's read of it reports a missing key. */
const SHIPPED_FIELDS = CONNECT_BOT.config?.fields;

/** One outbound request the extension made, as the transport received it. */
interface Request {
	readonly url: string;
	readonly init: PushFetchInit;
}

/** A panel that records every request and answers the registered receipt, so an arm can complete. */
function recordingPanel(requests: Request[]): PushTransport {
	return async (url, init) => {
		requests.push({ url, init });
		return {
			status: 200,
			text: async () => JSON.stringify({ outcome: "registered", onlineCount: 1 }),
		} satisfies PushHttpResponse;
	};
}

/**
 * A definition that requires the extension's own fields, under an id of its own — so the case
 * reads the document it supplies instead of a value an earlier case recorded for connect-bot.
 */
function requiringConnectBotFields(id: string): ExtensionDefinition {
	return { id, displayName: id, config: CONNECT_BOT.config } as unknown as ExtensionDefinition;
}

/** Binds one definition against a document supplied in memory, recording what binding did. */
function bindDocument(
	definition: ExtensionDefinition,
	document: string,
): {
	readonly result: BindingResult;
	readonly diagnostics: readonly string[];
	readonly registrations: readonly string[];
} {
	const port = portDouble();
	const result = port.bind(definition, { config: { reader: () => document } });
	return { result, diagnostics: [...port.diagnostics], registrations: [...port.registrations] };
}

/** The `config` violations a result reports, as the extension's own declaration produced them. */
function configDetails(result: BindingResult): readonly string[] {
	if (result.bound) return [];
	return result.failures.flatMap(failure =>
		failure.kind === "configuration" && failure.violation.kind === "config" ? [failure.violation.detail] : [],
	);
}

/** An injected panel is per-test state: it must not stand in for the next test's transport. */
afterEach(() => {
	setPushTransportForTest(null);
});

describe("the shipped configuration file is the source of the request budget (P14)", () => {
	test("the repository's own file carries 1000ms, and the framework's read of it accepts that", () => {
		// The framework's default reader and parser on the repository's own file: the value that
		// reaches the extension is the one the file carries, and a file that lacked the budget
		// would be refused here rather than read as a default.
		expect(readConfig(SHIPPED_CONFIG_FILE, { fields: SHIPPED_FIELDS })).toEqual({
			endpoint: ENDPOINT,
			[REQUEST_TIMEOUT_FIELD]: SHIPPED_TIMEOUT_MS,
		});
	});

	test("the admitted binding registers the command, and the budget is what the extension's own config read returns", async () => {
		const requests: Request[] = [];
		// The panel is in place before the binding, so a request made *during* binding — the shape a
		// load-time probe would take — is recorded like any other.
		setPushTransportForTest(recordingPanel(requests));
		const double = ompDouble();

		connectBot(double.api);

		// Binding is a registration and nothing else: the extension is labeled, its command is
		// registered, and the extension's own configuration read hands its shared logic the
		// endpoint and the budget the shipped file carries.
		expect(double.labels).toEqual(["connectBot"]);
		expect(double.commandNames()).toEqual(["connect-bot"]);
		expect(connectBotConfig()).toEqual({ endpoint: ENDPOINT, requestTimeoutMs: SHIPPED_TIMEOUT_MS });
		expect(requests).toEqual([]);
		expect(double.timers).toEqual([]);

		// The record is real rather than silent: the same panel and the same double record the
		// request once the user runs the command the binding registered.
		const announced = double.nextNotification();
		double.run("connect-bot", "", double.context({ sessionId: "budget-config-session", cwd: "E:/work/budget" }));
		await announced;
		// The register and the state report behind it are a promise chain: let it run to its end
		// before asking what a real panel would have received.
		for (let turn = 0; turn < 200; turn += 1) await Promise.resolve();

		expect(requests.length).toBeGreaterThan(0);
		expect(requests.every(request => request.url === `${ENDPOINT}${EVENTS_PATH}`)).toBe(true);
	});
});

describe("a missing or illegal request budget refuses the extension (P14)", () => {
	/**
	 * Every document the extension's own declared fields must refuse: the budget is not one the
	 * framework can hand the extension, so the extension does not load. The endpoint is valid in
	 * each one, so the report can only be about the budget.
	 */
	const refused: readonly { readonly name: string; readonly document: string }[] = [
		{
			name: "the field is missing",
			document: `endpoint: "${ENDPOINT}"\n`,
		},
		{
			name: "zero",
			document: `endpoint: "${ENDPOINT}"\n${REQUEST_TIMEOUT_FIELD}: 0\n`,
		},
		{
			name: "a negative value",
			document: `endpoint: "${ENDPOINT}"\n${REQUEST_TIMEOUT_FIELD}: -1000\n`,
		},
		{
			name: "a fraction",
			document: `endpoint: "${ENDPOINT}"\n${REQUEST_TIMEOUT_FIELD}: 1.5\n`,
		},
		{
			name: "text that is not a number",
			document: `endpoint: "${ENDPOINT}"\n${REQUEST_TIMEOUT_FIELD}: "1000"\n`,
		},
		{
			name: "a non-finite value",
			document: `endpoint: "${ENDPOINT}"\n${REQUEST_TIMEOUT_FIELD}: .inf\n`,
		},
		{
			name: "a value beyond the range the harness schedules",
			document: `endpoint: "${ENDPOINT}"\n${REQUEST_TIMEOUT_FIELD}: 2147483648\n`,
		},
	];

	for (const { name, document } of refused) {
		test(`${name}: refused at binding, reported once, nothing registered`, () => {
			const requests: Request[] = [];
			// A request can only be made through the command the binding registers, so the panel's
			// record is watched from before the binding: nothing may reach it while the binding is
			// refused.
			setPushTransportForTest(recordingPanel(requests));
			const id = `budget-refused-${name.replace(/\W+/g, "-")}`;

			const { result, diagnostics, registrations } = bindDocument(requiringConnectBotFields(id), document);
			const details = configDetails(result);

			expect(result.bound).toBe(false);
			// One configuration failure, whose report names the budget the file got wrong.
			expect(details).toHaveLength(1);
			expect(details[0]).toContain(`"${REQUEST_TIMEOUT_FIELD}"`);
			// Reported once on the non-model channel, naming the extension that was refused.
			expect(diagnostics).toHaveLength(1);
			expect(diagnostics[0]!.startsWith(`${id}: configuration error (config): `)).toBe(true);
			// No partial registration: no label, no command, no behavior — and so no heartbeat to
			// schedule and no request to make.
			expect(registrations).toEqual([]);
			expect(requests).toEqual([]);
		});
	}

	test("a legal whole millisecond budget binds, and the value is what the extension's declaration reads", () => {
		// The control for the cases above: the same declaration, the same document shape, and a
		// budget that is a non-default whole number of milliseconds the harness schedules.
		const definition = requiringConnectBotFields("budget-legal-2000");

		const { result, diagnostics, registrations } = bindDocument(
			definition,
			`endpoint: "${ENDPOINT}"\n${REQUEST_TIMEOUT_FIELD}: 2000\n`,
		);

		expect(result.bound).toBe(true);
		expect(diagnostics).toEqual([]);
		expect(registrations).toEqual(["label:budget-legal-2000", "onSession"]);
		expect(getConfig(definition)).toEqual({ endpoint: ENDPOINT, [REQUEST_TIMEOUT_FIELD]: 2000 });
	});
});

describe("no environment value and no code default supplies the request budget (P14)", () => {
	/** The names an environment override of this field would plausibly carry. */
	const OVERRIDE_NAMES = ["CONNECT_BOT_REQUEST_TIMEOUT_MS", "REQUEST_TIMEOUT_MS"] as const;

	/** Runs one case with those names set to `value`, then puts the environment back as it was. */
	function withOverride<T>(value: string, run: () => T): T {
		const previous = OVERRIDE_NAMES.map(name => [name, process.env[name]] as const);
		for (const name of OVERRIDE_NAMES) process.env[name] = value;
		try {
			return run();
		} finally {
			for (const [name, before] of previous) {
				if (before === undefined) delete process.env[name];
				else process.env[name] = before;
			}
		}
	}

	test("the value the shipped file carries is what the framework's read returns, whatever the environment names", () => {
		withOverride("5000", () => {
			expect(readConfig(SHIPPED_CONFIG_FILE, { fields: SHIPPED_FIELDS })).toEqual({
				endpoint: ENDPOINT,
				[REQUEST_TIMEOUT_FIELD]: SHIPPED_TIMEOUT_MS,
			});
		});
	});

	test("a binding records the file's budget rather than the environment's", () => {
		const definition = requiringConnectBotFields("budget-env-override");

		const { result } = withOverride("5000", () =>
			bindDocument(definition, `endpoint: "${ENDPOINT}"\n${REQUEST_TIMEOUT_FIELD}: 2000\n`),
		);

		expect(result.bound).toBe(true);
		// The value the extension's shared logic reads is the file's, not the environment's.
		expect(getConfig(definition)).toEqual({ endpoint: ENDPOINT, [REQUEST_TIMEOUT_FIELD]: 2000 });
	});

	test("the environment cannot fill a field the file omits", () => {
		const definition = requiringConnectBotFields("budget-env-fill");

		const { result, registrations } = withOverride("2000", () =>
			bindDocument(definition, `endpoint: "${ENDPOINT}"\n`),
		);

		expect(result.bound).toBe(false);
		expect(configDetails(result)).toHaveLength(1);
		expect(registrations).toEqual([]);
	});
});
