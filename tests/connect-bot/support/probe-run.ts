/**
 * The isolated probe process one request-budget run happens in, as its suites drive it (P13–P27).
 *
 * `support/budget-probe.ts` is that process: a validated configuration is recorded once per
 * extension per process, so a budget other than the one the repository ships can only be observed
 * in a process of its own. This module is the driver around it — the run's own configuration file
 * under a directory of the run's own, the spawn, and the one JSON report line the process prints —
 * kept here so every suite that needs a probe run reads it the same way instead of growing its own
 * copy of the plumbing.
 *
 * The types below are the report the probe itself writes; `support/budget-probe.ts` is their source
 * of truth, and a field added there must be added here for a suite to assert on it.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { REPO_ROOT } from "../../harness-dock/baseline";

/** One outbound request a probe run made, as the transport that performed it reported it. */
export interface SentRequest {
	readonly kind: string;
	readonly url: string;
	readonly method: string;
	readonly headers: Readonly<Record<string, string>>;
	readonly proxy: boolean;
	readonly requestBody: string;
	readonly answerBody?: unknown;
	readonly atMs: number;
	readonly virtualMs?: number;
	readonly outcome: "answered" | "timed-out" | "failed";
	readonly status?: number;
	readonly stateWhenSent: { readonly armed: boolean; readonly beatsRunning: number };
}

/** One probe run's report, as `support/budget-probe.ts` printed it. */
export interface ProbeReport {
	readonly pid: number;
	readonly scenario: string;
	readonly configuration: { readonly endpoint: string; readonly requestTimeoutMs: number };
	readonly notifications: readonly string[];
	readonly notificationLevels: readonly string[];
	readonly markerShown: boolean;
	readonly armed: boolean;
	readonly sent: readonly SentRequest[];
}

/** One controlled run's own directory and configuration file. */
export interface ProbeRunRoot {
	readonly configFile: string;
	dispose(): void;
}

/** Writes the configuration file one run is driven by, under a directory of its own. */
export function createRunRoot(label: string, endpoint: string, requestTimeoutMs: number): ProbeRunRoot {
	const dir = mkdtempSync(path.join(tmpdir(), `connect-bot-regression-${label}-`));
	const configFile = path.join(dir, "config.yaml");
	writeFileSync(configFile, `endpoint: "${endpoint}"\nrequestTimeoutMs: ${requestTimeoutMs}\n`);
	return { configFile, dispose: () => rmSync(dir, { recursive: true, force: true }) };
}

/** The probe program itself, as the suite spawns it. */
export const PROBE = path.join(REPO_ROOT, "tests", "connect-bot", "support", "budget-probe.ts");

/** Runs the probe in a process of its own and reads the one report line it prints. */
export async function runProbe(configFile: string, scenario: string): Promise<ProbeReport> {
	const child = Bun.spawn(["bun", PROBE, configFile, scenario], { stdout: "pipe", stderr: "pipe" });
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	if (exitCode !== 0) throw new Error(`budget-probe (${scenario}) exited ${exitCode}: ${stderr}`);
	const lines = stdout.trim().split("\n");
	return JSON.parse(lines[lines.length - 1] ?? "") as ProbeReport;
}
