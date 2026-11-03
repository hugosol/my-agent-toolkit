import { readFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { createCodemodeExtension } from "@earendil-works/pi-coding-agent";

/** Only the public native surface this Pi-specific extension consumes. */
export interface PiSuiteApi {
	registerMcpServer(name: string, config: Record<string, unknown>): void;
	getActiveTools(): string[];
	setActiveTools(names: string[]): void;
	on(event: "session_start", handler: () => void): void;
}

/** A launch-owned document, read during factory invocation (before session_start). */
export default async function piSuite(pi: PiSuiteApi): Promise<void> {
	const configPath = process.env.PI_SUITE_CONFIG;
	if (configPath === undefined) return;
	if (!isAbsolute(configPath)) throw new Error("PI_SUITE_CONFIG must be an absolute file path");
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
