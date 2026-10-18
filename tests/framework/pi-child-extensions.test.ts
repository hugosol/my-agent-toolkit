import { describe, expect, test } from "bun:test";
import * as path from "node:path";
import { requirePiChildExtension, type PiSubagentProvider } from "../../adapters/pi/domain/subagent/effects";
import { loadPiSubagentProvider } from "../../adapters/pi/domain/subagent/internal/provider";

const provider = await loadPiSubagentProvider() as PiSubagentProvider;
const root = path.resolve(import.meta.dir, "../..");
const entry = (id: string) => ({ id, path: path.join(root, "entrypoints/pi", `${id}.ts`) });

/** Observe calls to the real provider, not a replacement registry. */
function observedProvider() {
	const snapshots: string[][] = [];
	const observed: PiSubagentProvider = {
		registerRequiredChildExtensions(input) {
			const held = provider.registerRequiredChildExtensions(input);
			expect(input.requireForAllRunners).toBe(true);
			snapshots.push(input.extensions.map(item => item.id));
			return held;
		},
	};
	return { observed, snapshots };
}

describe("the provider's session snapshot combines independently owned child entries", () => {
	for (const order of [["codebase-tools", "model-cost"], ["model-cost", "codebase-tools"]]) {
		test(`register and release independently: ${order.join(" then ")}`, () => {
			const { observed, snapshots } = observedProvider();
			const id = `child-entry-order-${order.join("-")}`;
			const first = requirePiChildExtension(observed, id, entry(order[0]!));
			const second = requirePiChildExtension(observed, id, entry(order[1]!));
			try {
				expect(snapshots).toEqual([[order[0]], order]);
				first.dispose();
				expect(snapshots[snapshots.length - 1]).toEqual([order[1]]);
				first.dispose();
				expect(snapshots).toHaveLength(3);
				expect(() => provider.registerRequiredChildExtensions({
					sessionId: id, extensions: [entry("model-cost")],
				})).toThrow("already registered");
			} finally {
				first.dispose();
				second.dispose();
			}
			const probe = provider.registerRequiredChildExtensions({ sessionId: id, extensions: [] });
			probe.dispose();
		});
	}

	test("a bad second entry restores the first, and a later valid entry still joins", () => {
		const { observed, snapshots } = observedProvider();
		const id = "child-entry-refusal-rollback";
		const first = requirePiChildExtension(observed, id, entry("codebase-tools"));
		let second: { dispose(): void } | undefined;
		try {
			expect(() => requirePiChildExtension(observed, id, {
				id: "missing", path: path.join(root, "missing-child-entry.ts"),
			})).toThrow("not an importable file");
			expect(snapshots).toEqual([["codebase-tools"], ["codebase-tools"]]);
			second = requirePiChildExtension(observed, id, entry("model-cost"));
			expect(snapshots[snapshots.length - 1]).toEqual(["codebase-tools", "model-cost"]);
		} finally {
			second?.dispose();
			first.dispose();
		}
	});

	test("a duplicate extension is refused without discarding the accepted snapshot", () => {
		const { observed, snapshots } = observedProvider();
		const id = "child-entry-duplicate";
		const held = requirePiChildExtension(observed, id, entry("model-cost"));
		try {
			expect(() => requirePiChildExtension(observed, id, entry("model-cost"))).toThrow("duplicated");
			expect(snapshots[snapshots.length - 1]).toEqual(["model-cost"]);
		} finally {
			held.dispose();
		}
	});

	test("another session has a separate snapshot", () => {
		const { observed, snapshots } = observedProvider();
		const first = requirePiChildExtension(observed, "child-entry-session-a", entry("model-cost"));
		const second = requirePiChildExtension(observed, "child-entry-session-b", entry("codebase-tools"));
		try {
			expect(snapshots).toEqual([["model-cost"], ["codebase-tools"]]);
			first.dispose();
			expect(snapshots).toHaveLength(2);
		} finally {
			first.dispose();
			second.dispose();
		}
	});
});
