import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { resolveInstalledOmp } from "./installed-omp";

const originalCli = process.env.OMP_CLI;
const originalPath = process.env.PATH;
const roots: string[] = [];
afterEach(() => {
	if (originalCli === undefined) delete process.env.OMP_CLI;
	else process.env.OMP_CLI = originalCli;
	if (originalPath === undefined) delete process.env.PATH;
	else process.env.PATH = originalPath;
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function installation(version: string) {
	const root = mkdtempSync(path.join(tmpdir(), "omp-local-resolution-"));
	roots.push(root);
	const packageRoot = path.join(root, "node_modules", "@oh-my-pi", "pi-coding-agent");
	mkdirSync(path.join(packageRoot, "dist"), { recursive: true });
	const manifest = path.join(packageRoot, "package.json");
	writeFileSync(manifest, JSON.stringify({ name: "@oh-my-pi/pi-coding-agent", version, bin: { omp: "dist/cli.js" } }));
	const cli = path.join(packageRoot, "dist", "cli.js");
	writeFileSync(cli, "throw new Error('Resolution must not execute a host');\n");
	const shim = path.join(root, process.platform === "win32" ? "omp.cmd" : "omp");
	writeFileSync(shim, process.platform === "win32"
		? '@echo off\r\nbun "%~dp0%\\node_modules\\@oh-my-pi\\pi-coding-agent\\dist\\cli.js" %*\r\n'
		: '#!/bin/sh\nbun "$basedir/node_modules/@oh-my-pi/pi-coding-agent/dist/cli.js" "$@"\n');
	chmodSync(shim, 0o755);
	return { root, packageRoot, manifest, cli, shim };
}

describe("installed OMP selection", () => {
	test("explicit package CLI wins over PATH and resolution leaves installed bytes unchanged", async () => {
		const selected = installation("18.20.0");
		const other = installation("99.0.0");
		process.env.OMP_CLI = selected.cli;
		process.env.PATH = other.root;
		const bytes = readFileSync(selected.manifest, "utf8");
		const resolved = await resolveInstalledOmp();
		expect(resolved).toEqual({ path: process.execPath, argvPrefix: [selected.cli], version: "18.20.0", packageRoot: selected.packageRoot });
		expect(readFileSync(selected.manifest, "utf8")).toBe(bytes);
	});

	test("PATH shims resolve their own package and follow a local version change", async () => {
		const selected = installation("18.20.0");
		delete process.env.OMP_CLI;
		process.env.PATH = selected.root;
		expect((await resolveInstalledOmp()).argvPrefix).toEqual([selected.cli]);
		writeFileSync(selected.manifest, JSON.stringify({ name: "@oh-my-pi/pi-coding-agent", version: "18.21.0", bin: { omp: "dist/cli.js" } }));
		expect((await resolveInstalledOmp()).version).toBe("18.21.0");
	});

	test("a missing explicit selection fails rather than using another PATH installation", async () => {
		const selected = installation("18.20.0");
		process.env.PATH = selected.root;
		process.env.OMP_CLI = path.join(selected.root, "missing-omp");
		await expect(resolveInstalledOmp()).rejects.toThrow("No installation is performed");
	});

	test("a neighboring unrelated executable is not mistaken for OMP", async () => {
		const selected = installation("18.20.0");
		const unrelated = path.join(selected.root, "other-cli.js");
		writeFileSync(unrelated, "console.log('not omp');\n");
		process.env.OMP_CLI = unrelated;
		await expect(resolveInstalledOmp()).rejects.toThrow("Cannot identify");
	});
});
