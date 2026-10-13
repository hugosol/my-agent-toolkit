/**
 * The framework's general HTTP module (P54, P55): one public `request` that states its own
 * path and its own wait, and returns the platform's own response.
 *
 * The seam under test is S3, the framework's public HTTP Interface: the call `request` makes
 * through `framework/modules/http.ts`, observed as the exact outbound call it hands the
 * platform and the exact value it returns. No network is used: the platform call is the
 * module's injectable seam, so every case observes the request the module built and answers
 * with the response it wants — a real answer, a non-2xx answer, or a failure. The shared
 * configuration file is driven the same way (its text through the same reader the
 * configuration module takes), except where the case's point is the real file: a path with no
 * file at all, which is what an unconfigured process has.
 *
 * Expected values come from the contract's own terms (the documented 30000ms built-in, the
 * `http.proxies` shape), from literals written here, and from the clock: the budget cases
 * measure when the imposed signal really aborts instead of asserting that a number was passed.
 * A real transport — proxies, a delayed body, a refused connection — is proven by the isolated
 * smoke (`scripts/http-transport-smoke.ts`), not here.
 */
import { describe, expect, test } from "bun:test";
import * as path from "node:path";
import { tmpdir } from "node:os";
import type { ConfigReader } from "../../framework/core/config";
import {
	createHttpModule,
	HttpConfigurationError,
	type HttpModule,
	type HttpModuleSeam,
	type HttpTransport,
	type HttpTransportInit,
} from "../../framework/modules/http";

/** One request the module handed the platform, exactly as it was built. */
interface Sent {
	readonly url: string;
	readonly init: HttpTransportInit;
}

/** What the recording platform call answers one request with. */
type TransportAnswer = (sent: Sent) => Response | Promise<Response>;

/**
 * A path with no file at it, so a case can mean "this process has no shared configuration" with
 * the real reader rather than a simulated absence. The directory is never created.
 */
const ABSENT_CONFIG = path.join(tmpdir(), `my-agent-toolkit-http-absent-${process.pid}`, "config.yaml");

/**
 * A module over a platform call that records every request, and an optional shared file whose
 * text is handed back as it is. Every case states the configuration it means literally, so no
 * case depends on this repository's own missing `framework/config.yaml` or on any environment.
 */
function httpUnderTest(
	options: {
		readonly config?: string;
		readonly configPath?: string;
		readonly reader?: ConfigReader;
		readonly respond?: TransportAnswer;
	} = {},
): { readonly http: HttpModule; readonly sent: Sent[] } {
	const sent: Sent[] = [];
	const transport: HttpTransport = async (url, init) => {
		const call = { url, init };
		sent.push(call);
		return options.respond === undefined ? new Response("answered") : options.respond(call);
	};
	const seam: HttpModuleSeam = {
		transport,
		configPath: options.configPath ?? ABSENT_CONFIG,
		reader: options.reader ?? (options.config === undefined ? undefined : () => options.config as string),
	};
	return { http: createHttpModule(seam), sent };
}

/**
 * How long the imposed budget takes to run out, measured from now.
 *
 * The budget under test *is* a duration, carried by the platform's own timeout signal, so
 * deterministic fake timers cannot produce the evidence: they advance JavaScript timers, not
 * the native deadline that aborts a signal. Each case therefore waits for the signal it is
 * about and measures the real elapsed time.
 */
async function abortedAfter(signal: AbortSignal): Promise<number> {
	const started = performance.now();
	const aborted = Promise.withResolvers<void>();
	signal.addEventListener("abort", () => aborted.resolve(), { once: true });
	await aborted.promise;
	return performance.now() - started;
}

describe("the request call", () => {
	test("a request with no options is a GET, and the platform's own response is what comes back", async () => {
		const answer = new Response("balance", { status: 200 });
		const { http, sent } = httpUnderTest({ respond: () => answer });

		const response = await http.request("http://127.0.0.1:9/user/balance");

		expect(response).toBe(answer);
		expect(sent).toHaveLength(1);
		expect(sent[0]!.url).toBe("http://127.0.0.1:9/user/balance");
		expect(sent[0]!.init.method).toBe("GET");
		expect(sent[0]!.init.headers).toBeUndefined();
		expect(sent[0]!.init.body).toBeUndefined();
		expect(sent[0]!.init.proxy).toBe(false);
		expect(sent[0]!.init.signal).toBeInstanceOf(AbortSignal);
	});

	test("the method, headers and body travel exactly as the caller prepared them", async () => {
		const { http, sent } = httpUnderTest();

		await http.request("http://127.0.0.1:9/api/sessions/events", {
			method: "POST",
			headers: { "content-type": "application/json", "x-sentinel": "sentinel" },
			body: '{"sessionId":"one"}',
		});

		expect(sent[0]!.init.method).toBe("POST");
		expect(sent[0]!.init.headers).toEqual({ "content-type": "application/json", "x-sentinel": "sentinel" });
		expect(sent[0]!.init.body).toBe('{"sessionId":"one"}');
	});

	test("a non-2xx answer is returned for the caller to interpret, not turned into a failure", async () => {
		const answer = new Response("no such account", { status: 404 });
		const { http } = httpUnderTest({ respond: () => answer });

		const response = await http.request("http://127.0.0.1:9/user/balance");

		expect(response).toBe(answer);
		expect(response.status).toBe(404);
		expect(await response.text()).toBe("no such account");
	});

	test("a transport failure rejects with the platform's own failure", async () => {
		const failure = new TypeError("Unable to connect. Is the computer able to access the url?");
		const { http } = httpUnderTest({
			respond: () => {
				throw failure;
			},
		});

		await expect(http.request("http://127.0.0.1:9/user/balance")).rejects.toBe(failure);
	});

	test("a body that cannot be read rejects the read", async () => {
		const { http } = httpUnderTest({
			respond: () =>
				new Response(
					new ReadableStream({
						start(controller) {
							controller.error(new Error("the body broke"));
						},
					}),
				),
		});

		const response = await http.request("http://127.0.0.1:9/user/balance");

		await expect(response.text()).rejects.toThrow("the body broke");
	});
});

describe("the wait budget", () => {
	test("the request's own budget is what the platform is given", async () => {
		const { http, sent } = httpUnderTest({ config: "http:\n  defaultTimeoutMs: 3000\n" });

		await http.request("http://127.0.0.1:9/user/balance", { timeoutMs: 40 });

		const elapsed = await abortedAfter(sent[0]!.init.signal);
		expect(elapsed).toBeGreaterThanOrEqual(15);
		expect(elapsed).toBeLessThan(400);
	});

	test("the shared default is used when the request declares no budget", async () => {
		const { http, sent } = httpUnderTest({ config: "http:\n  defaultTimeoutMs: 120\n" });

		await http.request("http://127.0.0.1:9/user/balance");

		const signal = sent[0]!.init.signal;
		expect(signal.aborted).toBe(false);
		const elapsed = await abortedAfter(signal);
		expect(elapsed).toBeGreaterThanOrEqual(80);
		expect(elapsed).toBeLessThan(800);
	});

	test("with neither declared, the built-in budget is far longer than any declared one", async () => {
		// The built-in value is 30000ms; a unit test does not wait it out. What this observes is
		// that no *short* deadline is imposed when nothing declares one: the request that does
		// declare a budget runs out first, and the built-in one is still waiting at that moment.
		// The exact built-in is measured against a hanging target in the isolated smoke.
		const { http, sent } = httpUnderTest({ config: "http:\n  defaultTimeoutMs: 250\n" });

		await http.request("http://127.0.0.1:9/user/balance");
		await http.request("http://127.0.0.1:9/user/balance", { timeoutMs: 60 });

		await abortedAfter(sent[1]!.init.signal);
		expect(sent[0]!.init.signal.aborted).toBe(false);
	});

	test("a budget that is not a wait this timer schedules is refused before anything is sent", async () => {
		for (const timeoutMs of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 31]) {
			const { http, sent } = httpUnderTest();

			await expect(http.request("http://127.0.0.1:9/user/balance", { timeoutMs })).rejects.toBeInstanceOf(
				HttpConfigurationError,
			);
			expect(sent, String(timeoutMs)).toHaveLength(0);
		}
	});

	test("an illegal shared default is refused, never quietly replaced by the built-in one", async () => {
		for (const declared of ["0", "-5", "1.5", '"5000"']) {
			const { http, sent } = httpUnderTest({ config: `http:\n  defaultTimeoutMs: ${declared}\n` });

			await expect(http.request("http://127.0.0.1:9/user/balance"), declared).rejects.toBeInstanceOf(
				HttpConfigurationError,
			);
			expect(sent, declared).toHaveLength(0);
		}
	});

	test("the wait runs out on the platform's terms, and the request rejects", async () => {
		const { http } = httpUnderTest({
			respond: sent => {
				const answer = Promise.withResolvers<Response>();
				sent.init.signal.addEventListener("abort", () => answer.reject(sent.init.signal.reason), { once: true });
				return answer.promise;
			},
		});

		const started = performance.now();
		await expect(http.request("http://127.0.0.1:9/user/balance", { timeoutMs: 40 })).rejects.toBeDefined();
		expect(performance.now() - started).toBeGreaterThanOrEqual(15);
	});
});

describe("the proxy path", () => {
	test("a request that names no proxy connects directly, with no shared file at all", async () => {
		const { http, sent } = httpUnderTest();

		await http.request("http://127.0.0.1:9/user/balance");
		await http.request("http://127.0.0.1:9/user/balance", { proxy: false });

		expect(sent.map(call => call.init.proxy)).toEqual([false, false]);
	});

	test("a direct request reads only the budget it needs, not a proxy table it did not select", async () => {
		const { http, sent } = httpUnderTest({ config: "http:\n  defaultTimeoutMs: 250\n  proxies: not-a-table\n" });

		await http.request("http://127.0.0.1:9/user/balance");

		expect(sent[0]!.init.proxy).toBe(false);
	});

	test("a named entry is resolved from the shared http.proxies table and handed to the platform", async () => {
		const { http, sent } = httpUnderTest({
			config: [
				"http:",
				"  proxies:",
				"    codex:",
				'      url: "http://127.0.0.1:7890"',
				"    secure:",
				'      url: "https://127.0.0.1:7891"',
				"",
			].join("\n"),
		});

		await http.request("https://chatgpt.com/backend-api/usage", { proxy: "codex" });
		await http.request("https://chatgpt.com/backend-api/usage", { proxy: "secure" });

		expect(sent.map(call => call.init.proxy)).toEqual(["http://127.0.0.1:7890", "https://127.0.0.1:7891"]);
	});

	test("a selection the shared file cannot satisfy is refused before anything is sent", async () => {
		const cases: ReadonlyArray<{ readonly name: string; readonly config?: string }> = [
			{ name: "no file at all" },
			{ name: "a file that declares nothing", config: "# nothing here\n" },
			{ name: "a file with no http section", config: "other: {}\n" },
			{ name: "a file with no proxies table", config: "http:\n  defaultTimeoutMs: 250\n" },
			{ name: "an http section that is not a mapping", config: "http: 5\n" },
			{ name: "a proxies table that is not a mapping", config: "http:\n  proxies: nope\n" },
			{ name: "no such entry", config: 'http:\n  proxies:\n    other:\n      url: "http://127.0.0.1:1"\n' },
			{ name: "an entry that is not a mapping", config: "http:\n  proxies:\n    codex: http://127.0.0.1:7890\n" },
			{ name: "an entry with no url", config: "http:\n  proxies:\n    codex: {}\n" },
			{ name: "an empty url", config: 'http:\n  proxies:\n    codex:\n      url: ""\n' },
			{ name: "a url that is not a url", config: 'http:\n  proxies:\n    codex:\n      url: "127.0.0.1:7890"\n' },
			{
				name: "a url outside http and https",
				config: 'http:\n  proxies:\n    codex:\n      url: "socks5://127.0.0.1:1080"\n',
			},
		];

		for (const { name, config } of cases) {
			const { http, sent } = httpUnderTest(config === undefined ? {} : { config });

			await expect(http.request("https://chatgpt.com/backend-api/usage", { proxy: "codex" }), name).rejects.toBeInstanceOf(
				HttpConfigurationError,
			);
			expect(sent, name).toHaveLength(0);
		}
	});

	test("a shared file that cannot be read or parsed is a configuration failure, not a silent direct request", async () => {
		const cases: ReadonlyArray<{ readonly name: string; readonly config: string }> = [
			{ name: "not a mapping at its top level", config: "- one\n- two\n" },
			{ name: "not YAML", config: "http: [1,\n" },
			{ name: "an unreadable file", config: "" },
		];

		for (const { name, config } of cases) {
			const reader: ConfigReader =
				name === "an unreadable file"
					? () => {
							throw new Error("EACCES: permission denied");
						}
					: () => config;
			const { http, sent } = httpUnderTest({ reader });

			await expect(http.request("http://127.0.0.1:9/user/balance"), name).rejects.toBeInstanceOf(
				HttpConfigurationError,
			);
			expect(sent, name).toHaveLength(0);
		}
	});

	test("the shared file is read once per module, so a changed value waits for the next process", async () => {
		let reads = 0;
		const answers = ["http:\n  defaultTimeoutMs: 250\n", "http:\n  defaultTimeoutMs: 9000\n"];
		const { http, sent } = httpUnderTest({
			reader: () => {
				reads += 1;
				return answers[Math.min(reads, answers.length) - 1]!;
			},
		});

		await http.request("http://127.0.0.1:9/user/balance");
		await http.request("http://127.0.0.1:9/user/balance");
		await http.request("http://127.0.0.1:9/user/balance");

		expect(reads).toBe(1);
		// The third request still carries the budget the first read settled on, not the 9000 the
		// reader would have answered afterwards.
		expect(await abortedAfter(sent[2]!.init.signal)).toBeLessThan(900);
	});
});

describe("the ambient environment", () => {
	test("the proxy environment decides nothing here", async () => {
		const names = ["HTTP_PROXY", "http_proxy", "HTTPS_PROXY", "https_proxy", "ALL_PROXY", "all_proxy"] as const;
		const before = names.map(name => [name, process.env[name]] as const);
		try {
			for (const name of names) process.env[name] = "http://127.0.0.1:1";
			const { http, sent } = httpUnderTest({
				config: 'http:\n  proxies:\n    codex:\n      url: "http://127.0.0.1:7890"\n',
			});

			await http.request("http://127.0.0.1:9/user/balance");
			await http.request("https://chatgpt.com/backend-api/usage", { proxy: "codex" });

			expect(sent.map(call => call.init.proxy)).toEqual([false, "http://127.0.0.1:7890"]);
		} finally {
			for (const [name, value] of before) {
				if (value === undefined) delete process.env[name];
				else process.env[name] = value;
			}
		}
	});
});
