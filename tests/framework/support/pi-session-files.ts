/**
 * pi's own session files, as the framework suite's cases state a lineage chain with.
 *
 * A session this process does not host is reached through the file pi's own lineage link names: the
 * link is a *file*, and the identity of the session it belongs to is the id the file's own header
 * states. A case therefore writes the chain it wants, one header line per file — exactly the part of
 * pi's session format this adapter reads — and is free to name a file after nothing, which is what
 * proves the id came from the header rather than from the path.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type { PiSessionHeader } from "../../../adapters/pi";

/** One temporary directory of pi's own session files, written by the case that needs a chain. */
export interface PiSessionFileDir {
	/** The path of one file in this directory, whether or not the case has written it yet. */
	path(name: string): string;
	/** Writes one session file: its single header line, as pi states it. */
	write(name: string, header: PiSessionHeader): void;
}

const directories: string[] = [];

/** Called by each consuming suite after a case, once its complete lineage chain is no longer needed. */
export function disposeSessionFiles(): void {
	for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
}

export function sessionFileDir(): PiSessionFileDir {
	const dir = mkdtempSync(path.join(tmpdir(), "pi-session-files-"));
	directories.push(dir);
	return {
		path: name => path.join(dir, name),
		write: (name, header) => writeFileSync(path.join(dir, name), `${JSON.stringify(header)}\n`),
	};
}
