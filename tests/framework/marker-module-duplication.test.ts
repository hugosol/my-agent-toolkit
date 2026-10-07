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
import { activationField, type ExtensionDefinition, defineExtension } from "../../framework/core/definition";
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

/** A marker-only extension: nothing but the text and the activation State its line follows. */
function markerExtension(id: string, text: string): ExtensionDefinition {
	return defineExtension({
		id,
		displayName: id,
		state: { field: "enabled" },
		marker: { text },
	});
}

/** Declared out of id order on purpose: only a sort by id can put alpha's line first. */
const OMEGA = markerExtension("graph-omega-extension", "◈ omega");
const ALPHA = markerExtension("graph-alpha-extension", "◈ alpha");

/** Publishes one copy's area after a State transition, and returns the lines that copy wrote. */
function linesPublishedBy(
	behavior: MarkerModule,
	definition: ExtensionDefinition,
	ownerKey: string,
): readonly string[] {
	const published: Array<readonly string[]> = [];
	const transport: MarkerTransport = {
		publishMarkers: lines => {
			published.push([...lines]);
		},
	};

	behavior.publishMarkerOnTransition(definition, ownerKey, transport);

	const last = published[published.length - 1];
	if (last === undefined) throw new Error(`the "${definition.id}" transition published nothing`);
	return last;
}

/** Publishes one copy's area at a run initiation, and returns the lines that copy wrote. */
function linesPublishedOnRun(
	behavior: MarkerModule,
	definition: ExtensionDefinition,
	state: StateStore,
	ownerKey: string,
): readonly string[] {
	const published: Array<readonly string[]> = [];
	behavior.publishMarkerOnRun(definition, state, {
		owner: { kind: "owner", key: ownerKey },
		contributionIdentities: [],
		markers: {
			publishMarkers: lines => {
				published.push([...lines]);
			},
		},
	});

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

	const alphaState = new StateStore();
	const omegaState = new StateStore();
	alpha.registerMarker(ALPHA, alphaState);
	omega.registerMarker(OMEGA, omegaState);

	return { alpha, omega, alphaState, omegaState };
}

describe("one area across duplicated module instances (P13, C10)", () => {
	test("either copy publishes both extensions' lines, ordered by id, not by registration", async () => {
		const { alpha, omega, alphaState, omegaState } = await twoDuplicatedGraphs();
		const ownerKey = "duplicated-graph-owner";

		alphaState.applyTransition(ownerKey, activationField(ALPHA), true);
		omegaState.applyTransition(ownerKey, activationField(OMEGA), true);

		// Each copy reads the one area the process holds, whichever extension registered where.
		expect(linesPublishedBy(alpha, ALPHA, ownerKey)).toEqual(["◈ alpha", "◈ omega"]);
		expect(linesPublishedBy(omega, OMEGA, ownerKey)).toEqual(["◈ alpha", "◈ omega"]);
	});

	test("a run initiation from either copy re-asserts the whole area", async () => {
		const { alpha, omega, alphaState, omegaState } = await twoDuplicatedGraphs();
		const ownerKey = "duplicated-graph-run-owner";

		alphaState.applyTransition(ownerKey, activationField(ALPHA), true);
		omegaState.applyTransition(ownerKey, activationField(OMEGA), true);

		expect(linesPublishedOnRun(alpha, ALPHA, alphaState, ownerKey)).toEqual(["◈ alpha", "◈ omega"]);
		expect(linesPublishedOnRun(omega, OMEGA, omegaState, ownerKey)).toEqual(["◈ alpha", "◈ omega"]);
	});
});

describe("coexistence across duplicated copies: alone, together, one off (P13, B6)", () => {
	test("the area follows State through all three states, from either copy", async () => {
		const { alpha, omega, alphaState, omegaState } = await twoDuplicatedGraphs();
		const ownerKey = "duplicated-graph-coexistence";

		// Only alpha is enabled: the one extension that is on renders, and nothing else.
		alphaState.applyTransition(ownerKey, activationField(ALPHA), true);
		expect(linesPublishedBy(alpha, ALPHA, ownerKey)).toEqual(["◈ alpha"]);

		// Both are enabled: the second extension's line joins the same area.
		omegaState.applyTransition(ownerKey, activationField(OMEGA), true);
		expect(linesPublishedBy(omega, OMEGA, ownerKey)).toEqual(["◈ alpha", "◈ omega"]);

		// Omega is turned off: only its line goes, published from the other copy.
		omegaState.applyTransition(ownerKey, activationField(OMEGA), false);
		expect(linesPublishedBy(alpha, ALPHA, ownerKey)).toEqual(["◈ alpha"]);

		// Alpha is turned off last: the area is empty, so the transport is told to clear it.
		alphaState.applyTransition(ownerKey, activationField(ALPHA), false);
		expect(linesPublishedBy(alpha, ALPHA, ownerKey)).toEqual([]);
	});
});
