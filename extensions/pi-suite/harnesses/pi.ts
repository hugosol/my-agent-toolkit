import { readFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { createCodemodeExtension } from "@earendil-works/pi-coding-agent";

/** Only the public native surface this Pi-specific extension consumes. */
export interface PiSuiteApi {
	registerFlag(name: string, options: { description: string; type: "string"; default?: string }): void;
	getFlag(name: string): string | boolean | undefined;
	registerMcpServer(name: string, config: Record<string, unknown>): void;
	getActiveTools(): string[];
	setActiveTools(names: string[]): void;
	on(event: "session_start", handler: () => void): void;
}

/** A launch-owned document, read during factory invocation (before session_start). */
export default async function piSuite(pi: PiSuiteApi): Promise<void> {
	// Pi 1.5 binds parsed extension flags after factories have loaded. Seed this
	// public flag from the launch argv so native MCP registration still happens
	// in the factory; Pi retains validation and subsequent reload flag values.
	let launchPath: string | undefined;
	for (let index = 2; index < process.argv.length; index++) {
		const arg = process.argv[index];
		if (arg === "--") break;
		if (arg === "--pi-suite-config") launchPath = process.argv[++index] ?? "";
		else if (arg.startsWith("--pi-suite-config=")) launchPath = arg.slice("--pi-suite-config=".length);
	}
	pi.registerFlag("pi-suite-config", { description: "Absolute path to the launch-owned Suite configuration", type: "string", default: launchPath });
	const configPath = pi.getFlag("pi-suite-config");
	if (configPath === undefined) return;
	if (typeof configPath !== "string" || !isAbsolute(configPath)) throw new Error("--pi-suite-config must be an absolute file path");
	const raw: unknown = JSON.parse(readFileSync(configPath, "utf8"));
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid Pi Suite configuration");
	const config = raw as Record<string, unknown>;
	if (config.version !== 1 || (config.codemode !== "on" && config.codemode !== "only") ||
		!config.mcpServers || typeof config.mcpServers !== "object" || Array.isArray(config.mcpServers)) {
		throw new Error("Pi Suite requires version: 1, codemode: on|only, and mcpServers: object");
	}
	const servers = Object.entries(config.mcpServers);
	for (const [name, server] of servers) {
		if (!server || typeof server !== "object" || Array.isArray(server)) throw new Error(`Invalid Pi Suite MCP server: ${name}`);
	}
	for (const [name, server] of servers) pi.registerMcpServer(name, server as Record<string, unknown>);
	await createCodemodeExtension({ mode: config.codemode })(pi);
	pi.on("session_start", () => {
		const active = pi.getActiveTools();
		if (!active.includes("codemode")) pi.setActiveTools([...active, "codemode"]);
	});
}
