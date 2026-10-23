/** Pi session-manager file headers: cached direct parents and ancestry, never provider protocol. */
import { readFileSync } from "node:fs";
import type { PiSessionAnchor, PiSessionHeader } from "../extensions/types";

/** One native session file's identity and parent link, absent when its header cannot be read. */
export type PiAnchorReader = (sessionFile: string) => PiSessionAnchor | undefined;

/** Fixed session headers are cached once per file for the assembly's lifetime; no polling. */
export function piSessionFileAnchors(): PiAnchorReader {
	const read = new Map<string, PiSessionAnchor | undefined>();
	return sessionFile => {
		const known = read.get(sessionFile);
		if (known !== undefined || read.has(sessionFile)) return known;
		let anchor: PiSessionAnchor | undefined;
		try {
			const [firstLine] = readFileSync(sessionFile, "utf8").split("\n", 1);
			const parsed: unknown = JSON.parse(firstLine ?? "");
			const header = parsed as PiSessionHeader | null;
			if (header !== null && typeof header === "object" && header.type === "session") {
				anchor = {
					...(typeof header.id === "string" && header.id.length > 0 ? { id: header.id } : {}),
					...(typeof header.parentSession === "string" && header.parentSession.length > 0
						? { parentSession: header.parentSession }
						: {}),
				};
			}
		} catch {
			// An unreadable file states no anchor; the walk never guesses a continuation.
			anchor = undefined;
		}
		read.set(sessionFile, anchor);
		return anchor;
	};
}

/** Native parent and nearest top-level identities; Session decides their Owner meaning. */
export function piSpawnedRelationsOf(
	link: string,
	readAnchor: PiAnchorReader,
): { readonly parentSessionId?: string; readonly mainSessionId?: string; readonly unavailable: readonly string[] } {
	const unavailable: string[] = [];
	const parent = readAnchor(link);
	const parentSessionId = parent?.id;
	if (parentSessionId === undefined) unavailable.push("direct parent session");
	const visited = new Set<string>();
	let file: string | undefined = link;
	while (file !== undefined && !visited.has(file)) {
		visited.add(file);
		const anchor = readAnchor(file);
		if (anchor === undefined) break;
		if (anchor.parentSession === undefined) {
			return {
				...(parentSessionId === undefined ? {} : { parentSessionId }),
				...(anchor.id === undefined ? {} : { mainSessionId: anchor.id }),
				unavailable,
			};
		}
		file = anchor.parentSession;
	}
	return { ...(parentSessionId === undefined ? {} : { parentSessionId }), unavailable };
}

