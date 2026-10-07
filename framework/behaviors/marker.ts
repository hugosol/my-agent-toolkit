/**
 * The marker behavior: the framework's one unified status area and the update rule
 * that keeps it mirroring State.
 *
 * The area is the framework's, not an extension's: it has one native identity, one
 * placement and one line order, and an extension supplies nothing but its marker text.
 * What the area shows for one owner is a read-only projection of that owner's State —
 * the marker texts of the extensions whose activation value is true, ordered by
 * extension id — so an extension can neither claim the widget nor decide where it
 * appears, and two extensions rendering in one session never overwrite each other.
 *
 * This module is agent-runtime-independent: it reads State through the read view and
 * publishes through a transport an adapter supplied, and names no native API.
 */
import { activationField, type ExtensionDefinition } from "../core/definition";
import type { MarkerTransport, RunDelivery } from "../core/protocol";
import type { StateStore } from "../core/state";

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

/** The process-wide area: one native widget shared by every extension bound in it. */
const markerArea = new MarkerArea();

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
	markerArea.register(definition.id, {
		text: marker.text,
		active: ownerKey => state.view(ownerKey).read(field),
	});
}

/**
 * Publishes the area at a run initiation this extension is active in.
 *
 * An `enabled run` re-asserts the whole area, which is what keeps the widget honest if
 * the native surface dropped it between turns. A run this extension is not active in
 * publishes nothing: the transition that turned it off already removed its line, and a
 * session with no owner has no State to project.
 */
export function publishMarkerOnRun(
	definition: ExtensionDefinition,
	state: StateStore,
	run: RunDelivery,
): void {
	if (definition.marker === undefined) return;
	if (run.owner.kind === "unresolved") return;
	if (!state.view(run.owner.key).read(activationField(definition))) return;

	run.markers.publishMarkers(markerArea.lines(run.owner.key));
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

	transport.publishMarkers(markerArea.lines(ownerKey));
}
