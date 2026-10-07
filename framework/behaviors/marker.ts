/**
 * The marker behavior: the framework's one unified status area and the update rule
 * that keeps it mirroring State.
 *
 * The area is the framework's, not an extension's: it has one native identity, one
 * placement and one line order, and an extension supplies nothing but its marker text.
 * What the area shows for one owner is a read-only projection of that owner's State —
 * the marker texts of the extensions whose activation value is true, ordered by
 * extension id — so an extension can neither claim the widget nor decide where it
 * appears, and two extensions rendering in one session never overwrite each other. The one
 * area belongs to the process rather than to this module instance, so it is resolved from
 * the process global ({@link MARKER_AREA_KEY}): an agent runtime that evaluates a copy of
 * this module per extension still binds every extension to the one native widget.
 *
 * This module is agent-runtime-independent: it reads State through the read view and
 * publishes through a transport an adapter supplied, and names no native API.
 */
import { activationField, type ExtensionDefinition } from "../core/definition";
import type { MarkerTransport, RunDelivery } from "../core/protocol";
import type { StateStore } from "../core/state";
import { stateValueFor } from "./state-scope";

/** One extension's participation in the area: its line and how to read whether it shows. */
interface MarkerEntry {
	readonly text: string;
	/** Whether this extension shows for `ownerKey`, read from its own State cell. */
	readonly active: (ownerKey: string) => boolean;
}

/**
 * The unified area: every bound extension's marker, keyed by extension id.
 *
 * Registration is idempotent — a definition registers once per binding, and a later
 * binding of the same extension replaces its entry with the same content — and ordering
 * is derived rather than recorded, so no host registration order can leak into the
 * rendering.
 */
class MarkerArea {
	/** Extension id -> its marker entry. */
	readonly #entries = new Map<string, MarkerEntry>();

	/** Registers or replaces one extension's marker entry. */
	register(id: string, entry: MarkerEntry): void {
		this.#entries.set(id, entry);
	}

	/** The lines the area shows for one owner: active extensions' texts, ordered by id. */
	lines(ownerKey: string): readonly string[] {
		return [...this.#entries.entries()]
			.filter(([, entry]) => entry.active(ownerKey))
			.map(([id, entry]) => ({ id, text: entry.text }))
			.sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
			.map(entry => entry.text);
	}
}

/**
 * The process-global key the one area is registered under.
 *
 * The area belongs to the process, not to a module instance. The OMP legacy loader rewrites
 * every relative import of an extension's graph to `specifier?mtime=<per-load tag>` — the
 * relative-import branch at `legacy-pi-compat.ts:1182-1184`, the entry import at `:2645` — with
 * a fresh tag per extension load, so two extensions that import this framework by relative path
 * evaluate their own copy of this module. A module-scoped area would then be one area per
 * extension, each publishing only its own line under the framework's one widget key, and the
 * later write would win: only one of two enabled extensions would show. Registering the area on
 * the process global under a well-known symbol gives the copies one area, and `Symbol.for` is
 * what lets them agree on the key by name while holding no shared module identity.
 */
const MARKER_AREA_KEY: unique symbol = Symbol.for("my-agent-toolkit.semantic-extensions.marker-area");

/** The process global, narrowed to the one entry this module reads and writes. */
interface MarkerAreaScope {
	[MARKER_AREA_KEY]?: MarkerArea;
}

/** The process-wide area: one native widget shared by every extension bound in it. */
function markerArea(): MarkerArea {
	const scope = globalThis as MarkerAreaScope;
	const registered = scope[MARKER_AREA_KEY];
	if (registered !== undefined) return registered;

	const area = new MarkerArea();
	scope[MARKER_AREA_KEY] = area;
	return area;
}

/**
 * Registers a definition's marker in the area, reading its activation value from the
 * State store the definition is bound through.
 *
 * A definition that declares no marker registers nothing; it neither renders a line nor
 * influences the area's content or order.
 */
export function registerMarker(definition: ExtensionDefinition, state: StateStore): void {
	const marker = definition.marker;
	if (marker === undefined) return;

	const field = activationField(definition);
	markerArea().register(definition.id, {
		text: marker.text,
		active: ownerKey => state.view(ownerKey).read(field),
	});
}

/**
 * Publishes the area at a run initiation this extension is active in.
 *
 * An `enabled run` re-asserts the whole area, which is what keeps the widget honest if
 * the native surface dropped it between turns. Whether this delivery reads an active
 * value is the per-field inheritance axis, exactly as it is for prompt planning: a
 * subagent session renders the owner's area only when the field declares `follow`. A run
 * this extension is not active in publishes nothing: the transition that turned it off
 * already removed its line, and a session with no owner has no State to project.
 */
export function publishMarkerOnRun(
	definition: ExtensionDefinition,
	state: StateStore,
	run: RunDelivery,
): void {
	if (definition.marker === undefined) return;
	// An ownerless session has no cell to project, so its area is not re-asserted.
	if (run.owner.kind === "unresolved") return;
	if (!stateValueFor(definition, state, run.owner)) return;

	run.markers.publishMarkers(markerArea().lines(run.owner.key));
}

/**
 * Publishes the area after one State transition of this extension.
 *
 * The transition is what makes the area change, so this publishes unconditionally: a
 * value that just turned true adds this extension's line, and a value that turned false
 * removes it — and clears the widget when that leaves the area empty.
 */
export function publishMarkerOnTransition(
	definition: ExtensionDefinition,
	ownerKey: string,
	transport: MarkerTransport,
): void {
	if (definition.marker === undefined) return;

	transport.publishMarkers(markerArea().lines(ownerKey));
}
