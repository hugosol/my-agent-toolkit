/**
 * The marker area is process-wide, not per module instance (S2; P13, C10).
 *
 * The OMP legacy loader rewrites every relative import of an extension's module graph to
 * `specifier?mtime=<per-load tag>` (`legacy-pi-compat.ts:1182-1184`, and the entry itself at
 * `:2645`), with a fresh tag per extension load. Two extensions that import this framework by
 * relative path — codebase-tools and connect-bot both do — therefore evaluate their own copy
 * of `framework/behaviors/marker.ts`. With a module-scoped area each copy holds its own, so
 * each extension publishes only its own line under the one widget key and the later write
 * wins: the reported defect where only one of two enabled extensions shows a marker.
 *
 * Bun keys a query string as part of a module's identity, so importing the behavior twice with
 * different suffixes reproduces that duplication in-process, with no loader. The duplication is
 * asserted below, so this file cannot pass by importing one instance twice.
 *
 * The area is process-wide, so it outlives a test: every test names its own owner key, and an
 * entry another test registered reads the default for a key its store never saw.
 */
import { describe, expect, test } from "bun:test";
import type * as MarkerBehavior from "../../framework/behaviors/marker";
import { activationField, statePersistence, type ExtensionDefinition, defineExtension } from "../../framework/core/definition";
import type { OwnerReference } from "../../framework/interface/state";
import type { MarkerTransport } from "../../framework/core/protocol";
import { StateStore } from "../../framework/core/state";

/** One module instance of the marker behavior: what one extension's duplicated graph evaluates. */
type MarkerModule = typeof MarkerBehavior;

/**
 * Imports a fresh instance of the marker behavior, keyed by `tag` exactly as the loader's
 * `?mtime=` tag keys it. The specifier is built at run time so each call is its own module.
 */
function duplicatedMarkerModule(tag: string): Promise<MarkerModule> {
	const specifier = `../../framework/behaviors/marker.ts?mtime-repro=${tag}`;
	return import(specifier) as Promise<MarkerModule>;
}

/**
 * The seat a case projects unless it names another one: the position the delivery itself carries,
 * which is what a harness publishing no viewed-session outlet leaves the framework with.
 */
const ownSeat = (own: OwnerReference): OwnerReference => own;

/** A marker-only extension: nothing but the text and the activation State its line follows. */
function markerExtension(id: string, text: string, inheritance?: "follow"): ExtensionDefinition {
	return defineExtension({
		id,
		displayName: id,
		state: inheritance === undefined ? { field: "enabled" } : { field: "enabled", inheritance },
		marker: { text },
	});
}

/** Declared out of id order on purpose: only a sort by id can put alpha's line first. */
const OMEGA = markerExtension("graph-omega-extension", "◈ omega");
/** The field that follows the Owner, so a subagent's seat reads the Owner's current value. */
const ALPHA = markerExtension("graph-alpha-extension", "◈ alpha", "follow");

/** Writes one copy's activation value through its own store's declared-value write path. */
function writeActivation(store: StateStore, ownerKey: string, value: boolean): void {
	store.writer({ ownerKey, persist: () => {}, publishMarker: () => {} }).write(value);
}

/** Publishes one copy's area after a State transition, and returns the lines that copy wrote. */
function linesPublishedBy(
	behavior: MarkerModule,
	definition: ExtensionDefinition,
	ownerKey: string,
	seat: (own: OwnerReference) => OwnerReference = ownSeat,
): readonly string[] {
	const published: Array<readonly string[]> = [];
	const transport: MarkerTransport = {
		publishMarkers: lines => {
			published.push([...lines]);
		},
	};

	behavior.publishMarkerOnTransition(definition, ownerKey, transport, seat);

	const last = published[published.length - 1];
	if (last === undefined) throw new Error(`the "${definition.id}" transition published nothing`);
	return last;
}

/** Publishes one copy's area at a run initiation, and returns the lines that copy wrote. */
function linesPublishedOnRun(
	behavior: MarkerModule,
	definition: ExtensionDefinition,
	ownerKey: string,
	seat: (own: OwnerReference) => OwnerReference = ownSeat,
): readonly string[] {
	const published: Array<readonly string[]> = [];
	behavior.publishMarkerOnRun(
		definition,
		{
			owner: { kind: "owner", key: ownerKey },
			contributionIdentities: [],
			markers: {
				publishMarkers: lines => {
					published.push([...lines]);
				},
			},
		},
		seat,
	);

	const last = published[published.length - 1];
	if (last === undefined) throw new Error(`the "${definition.id}" run published nothing`);
	return last;
}

/** Binds extensions through separate copies of the behavior, as two duplicated graphs do. */
async function twoDuplicatedGraphs(): Promise<{
	readonly alpha: MarkerModule;
	readonly omega: MarkerModule;
	readonly alphaState: StateStore;
	readonly omegaState: StateStore;
}> {
	const [alpha, omega] = await Promise.all([duplicatedMarkerModule("alpha"), duplicatedMarkerModule("omega")]);

	// The repro is only real while the two imports are different module instances: a deduped
	// import would give both extensions one module and hide the defect this file exists for.
	expect(alpha.registerMarker).not.toBe(omega.registerMarker);

	// Each copy's store carries its own extension's declaration rules, as its assembly resolves them.
	const alphaState = new StateStore({ field: activationField(ALPHA), persistence: statePersistence(ALPHA) });
	const omegaState = new StateStore({ field: activationField(OMEGA), persistence: statePersistence(OMEGA) });
	alpha.registerMarker(ALPHA, alphaState);
	omega.registerMarker(OMEGA, omegaState);

	return { alpha, omega, alphaState, omegaState };
}

describe("one area across duplicated module instances (P13, C10)", () => {
	test("either copy publishes both extensions' lines, ordered by id, not by registration", async () => {
		const { alpha, omega, alphaState, omegaState } = await twoDuplicatedGraphs();
		const ownerKey = "duplicated-graph-owner";

		writeActivation(alphaState, ownerKey, true);
		writeActivation(omegaState, ownerKey, true);

		// Each copy reads the one area the process holds, whichever extension registered where.
		expect(linesPublishedBy(alpha, ALPHA, ownerKey)).toEqual(["◈ alpha", "◈ omega"]);
		expect(linesPublishedBy(omega, OMEGA, ownerKey)).toEqual(["◈ alpha", "◈ omega"]);
	});

	test("a run initiation from either copy re-asserts the whole area", async () => {
		const { alpha, omega, alphaState, omegaState } = await twoDuplicatedGraphs();
		const ownerKey = "duplicated-graph-run-owner";

		writeActivation(alphaState, ownerKey, true);
		writeActivation(omegaState, ownerKey, true);

		expect(linesPublishedOnRun(alpha, ALPHA, ownerKey)).toEqual(["◈ alpha", "◈ omega"]);
		expect(linesPublishedOnRun(omega, OMEGA, ownerKey)).toEqual(["◈ alpha", "◈ omega"]);
	});

	test("either copy projects the same displayed subagent, each extension reading its own declaration", async () => {
		const { alpha, omega, alphaState, omegaState } = await twoDuplicatedGraphs();
		const ownerKey = "duplicated-graph-viewed-owner";

		writeActivation(alphaState, ownerKey, true);
		writeActivation(omegaState, ownerKey, true);

		// The seat is a subagent of that Owner: the following field reads the Owner's current value,
		// and the other one reads its declared default. Both copies read the one area, so either of
		// them publishes the same rendering — the duplicated graphs share the area, not the projection.
		const displayedSubagent = { kind: "inherited", key: ownerKey } as const;
		const subagentSeat = (): typeof displayedSubagent => displayedSubagent;

		expect(linesPublishedBy(alpha, ALPHA, ownerKey, subagentSeat)).toEqual(["◈ alpha"]);
		expect(linesPublishedOnRun(omega, OMEGA, ownerKey, subagentSeat)).toEqual(["◈ alpha"]);
	});
});

describe("coexistence across duplicated copies: alone, together, one off (P13, B6)", () => {
	test("the area follows State through all three states, from either copy", async () => {
		const { alpha, omega, alphaState, omegaState } = await twoDuplicatedGraphs();
		const ownerKey = "duplicated-graph-coexistence";

		// Only alpha is enabled: the one extension that is on renders, and nothing else.
		writeActivation(alphaState, ownerKey, true);
		expect(linesPublishedBy(alpha, ALPHA, ownerKey)).toEqual(["◈ alpha"]);

		// Both are enabled: the second extension's line joins the same area.
		writeActivation(omegaState, ownerKey, true);
		expect(linesPublishedBy(omega, OMEGA, ownerKey)).toEqual(["◈ alpha", "◈ omega"]);

		// Omega is turned off: only its line goes, published from the other copy.
		writeActivation(omegaState, ownerKey, false);
		expect(linesPublishedBy(alpha, ALPHA, ownerKey)).toEqual(["◈ alpha"]);

		// Alpha is turned off last: the area is empty, so the transport is told to clear it.
		writeActivation(alphaState, ownerKey, false);
		expect(linesPublishedBy(alpha, ALPHA, ownerKey)).toEqual([]);
	});
});
