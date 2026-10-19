/**
 * The marker behavior: the framework's one unified status area and the update rule
 * that keeps it mirroring State.
 *
 * The area is the framework's, not an extension's: it has one native identity, one
 * placement and one line order, and an extension supplies nothing but its marker text.
 * What the area shows is a read-only projection of the *seat* it is rendered for — the
 * session the host is displaying, re-read whenever the area is published, and otherwise the
 * position the delivery itself carries — so the marker texts of the extensions whose
 * effective value for that seat is true are shown, ordered by extension id. The effective
 * value is the same per-field inheritance rule every framework-managed reader applies: the
 * owner reads its own cell, a subagent reads the owner's current value only for a field that
 * declares `follow` and otherwise the declared default. An extension can therefore neither
 * claim the widget nor decide where it appears nor make a view of it an owner, and two
 * extensions rendering in one session never overwrite each other. The one area belongs to the
 * process rather than to this module instance, so it is resolved from the process global
 * ({@link MARKER_AREA_KEY}): a harness that evaluates a copy of this module per extension
 * still binds every extension to the one native widget.
 *
 * One extension is bound once per session — the host's loader evaluates an extension's graph for
 * each session's runner — and those bindings keep independent State, so the area keeps them
 * together instead of letting the last registration speak for all: a seat is answered by the
 * registration whose store serves that seat's Owner, and a session nobody is displaying therefore
 * cannot empty the area or answer with its own value. What the stores served decides, not the order
 * the host bound the sessions in.
 *
 * This module is harness-independent: it reads State through the read view, resolves the
 * seat from the port's own viewed-session fact, and publishes through a transport an
 * adapter supplied, and it names no native API.
 */
import type { ExtensionDefinition } from "../core/definition";
import type { OwnerReference } from "../interface/state";
import type { HarnessPort, MarkerTransport, RunDelivery } from "../core/protocol";
import type { StateStore } from "../core/state";
import { stateValueFor } from "./state-scope";

/**
 * One binding's participation in the area: its line, the store it reads, and how to read whether it
 * shows.
 *
 * The store is part of the registration because one extension is bound once per session — the host's
 * loader evaluates an extension's graph for each session's runner — and those bindings keep
 * independent State. What a seat reads is the Owner that seat names, so only a registration whose
 * store serves that Owner can answer for it; a registration of another session's binding cannot, and
 * must not be able to make the area drop the line either.
 */
interface MarkerEntry {
	readonly text: string;
	/** The State store this binding reads: the Owner cells it can answer for. */
	readonly state: StateStore;
	/** Whether this extension shows for `seat`, read from its own State through the inheritance rule. */
	readonly active: (seat: OwnerReference) => boolean;
}

/**
 * The seat one area rendering is projected for: the session the host is displaying, re-read when it
 * is asked, or the position the delivery itself carries when this harness publishes no viewed-session
 * outlet. A delivery's own position is the honest fallback — it is the session whose work produced
 * the publication — and it is what keeps a host without the outlet behaving exactly as before.
 */
export type MarkerSeat = (own: OwnerReference) => OwnerReference;

/**
 * The seat resolver of one binding.
 *
 * The read happens per publication rather than once per binding: the displayed session can move
 * between two publications, and the area must show what is on screen *then*. A harness that
 * publishes no outlet answers `undefined`, which is the fallback above and never an empty area.
 */
export function markerSeat(port: HarnessPort): MarkerSeat {
	const viewed = port.viewedSession;
	if (viewed === undefined) return own => own;
	return own => viewed.read() ?? own;
}

/**
 * The unified area: every bound extension's marker, keyed by extension id.
 *
 * One extension is one line however many bindings of it exist: the entries of one id are its
 * bindings' registrations, oldest first, and registering the same store again replaces its own entry
 * rather than adding one. Line order is derived rather than recorded, so no host registration order
 * can leak into the rendering.
 *
 * A seat is answered by the newest registration whose store serves that seat's Owner, which is what
 * makes the area the *displayed* session's State even while several sessions have bound the same
 * extension: the store of a session nobody is displaying never served the Owner on screen, and a
 * bind-everything-again running order therefore cannot empty the area or answer with the wrong
 * session's value. A seat no registration serves reads the declared default, so nothing is projected
 * for it, and an Owner whose session ended still belongs to the store that served it — so it reads
 * the default there rather than a leftover registration's value.
 */
class MarkerArea {
	/** Extension id -> the registrations of its bindings, oldest first. */
	readonly #entries = new Map<string, MarkerEntry[]>();

	/** Registers one binding's marker entry, replacing this store's earlier one if it has any. */
	register(id: string, entry: MarkerEntry): void {
		const registered = this.#entries.get(id);
		if (registered === undefined) {
			this.#entries.set(id, [entry]);
			return;
		}

		const replaced = registered.findIndex(candidate => candidate.state === entry.state);
		if (replaced === -1) registered.push(entry);
		else registered[replaced] = entry;
	}

	/**
	 * The registration that answers for one seat, or nothing when no registration serves it.
	 *
	 * The newest server wins: a store serves the Owner the seat names by reconciling that Owner's
	 * boundaries and writing its cells, and the most recent binding that served it is the one holding
	 * its State now — a session's own binding beside an older one that served the same key. An
	 * unresolved seat names no Owner any binding could serve, so no registration answers for it.
	 */
	#speaker(id: string, seat: OwnerReference): MarkerEntry | undefined {
		const registered = this.#entries.get(id);
		if (registered === undefined || seat.kind === "unresolved") return undefined;

		for (let index = registered.length - 1; index >= 0; index -= 1) {
			const candidate = registered[index];
			if (candidate !== undefined && candidate.state.serves(seat.key)) return candidate;
		}
		return undefined;
	}

	/** Whether this extension's line is part of the area's rendering for one seat. */
	shows(id: string, seat: OwnerReference): boolean {
		const speaker = this.#speaker(id, seat);
		return speaker !== undefined && speaker.active(seat);
	}

	/**
	 * Whether the registration answering one seat reads that Owner through the framework's local
	 * access rather than from a cell this process holds.
	 *
	 * It is the one thing that separates a seat whose change a transition *here* already published
	 * from one whose change happened in the process serving the Owner: the latter has no local
	 * transition, so a publication this process makes is the first that can carry it.
	 */
	follows(id: string, seat: OwnerReference): boolean {
		if (seat.kind === "unresolved") return false;
		const speaker = this.#speaker(id, seat);
		return speaker !== undefined && speaker.state.follows(seat.key);
	}

	/** The lines the area shows for one seat: active extensions' texts, ordered by id. */
	lines(seat: OwnerReference): readonly string[] {
		const lines: Array<{ readonly id: string; readonly text: string }> = [];
		for (const [id, registered] of this.#entries) {
			const speaker = this.#speaker(id, seat);
			if (speaker === undefined || !speaker.active(seat)) continue;
			lines.push({ id, text: speaker.text });
		}

		return lines
			.sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
			.map(line => line.text);
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
 * influences the area's content or order. A definition bound more than once — one binding per
 * session, each with its own store — registers once per binding, and the store is what the area
 * keeps to decide which of them answers for the seat it publishes for.
 */
export function registerMarker(definition: ExtensionDefinition, state: StateStore): void {
	const marker = definition.marker;
	if (marker === undefined) return;

	markerArea().register(definition.id, {
		text: marker.text,
		state,
		// The effective value for the seat, not the raw cell of one owner: a seat that is a subagent
		// reaches the owner's cell only where this extension's field declares `follow`.
		active: seat => stateValueFor(definition, state, seat),
	});
}

/**
 * Publishes the area for one seat through one transport.
 *
 * The content is always the whole area — every registered extension's line for that seat, in
 * id order — so a projection published by one binding is the same rendering any other binding
 * would publish, and an empty list is the framework's instruction to clear the widget.
 */
export function publishMarkerArea(transport: MarkerTransport, seat: OwnerReference): void {
	transport.publishMarkers(markerArea().lines(seat));
}

/**
 * Publishes the area because the displayed session changed.
 *
 * A view change is not a State transition: nothing an extension owns moved, so what this renders
 * is the new seat's own projection — and, like every other publication, the whole area, so the
 * binding that speaks and the binding that stays quiet produce the same rendering.
 *
 * A binding whose line the new seat does not carry stays quiet: it has nothing to re-assert, and
 * the transition that hid its line already republished the area. What answers that question is the
 * area's own rendering, not this binding's store: a binding of another session reads its own cells,
 * so only the registration that keeps the new seat's Owner cell can say what that seat carries. The
 * one exception is a seat whose rendering carries no line at all — that is exactly the rendering
 * which clears the widget when the operator looks at a session nothing is active in, so it is
 * always published.
 */
export function publishMarkerOnViewChange(
	definition: ExtensionDefinition,
	transport: MarkerTransport,
	seat: OwnerReference,
): void {
	if (definition.marker === undefined) return;
	const lines = markerArea().lines(seat);
	if (lines.length > 0 && !markerArea().shows(definition.id, seat)) return;

	transport.publishMarkers(lines);
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
 *
 * Whether this run is one of those is the area's answer for the running session's position — the
 * store that keeps that Owner's cell is the one that knows the value — so a subagent's own run
 * re-asserts the owner's rendering when its field follows instead of reading its own empty store.
 *
 * What it publishes is the *displayed* session's rendering, not the running session's: a run in
 * another session while the operator looks at this one re-asserts what is on screen.
 */
export function publishMarkerOnRun(
	definition: ExtensionDefinition,
	run: RunDelivery,
	seat: MarkerSeat,
): void {
	if (definition.marker === undefined) return;
	// A run this extension is not active in publishes nothing, because the transition that turned it
	// off already removed its line. That holds for a seat whose value this process holds; for one
	// another process serves it does not: the change that added or removed the line happened over
	// there, and no publication of this process carried it. This run is then the first chance this
	// process has to render what the value now is, so the area is published either way.
	const area = markerArea();
	if (!area.shows(definition.id, run.owner) && !area.follows(definition.id, run.owner)) return;

	publishMarkerArea(run.markers, seat(run.owner));
}

/**
 * Publishes the area after one State transition of this extension.
 *
 * The transition is what makes the area change, so this publishes unconditionally: a
 * value that just turned true adds this extension's line, and a value that turned false
 * removes it — and clears the widget when that leaves the area empty. `ownerKey` is the owner
 * whose cell moved, which is the position this publication falls back to when the harness
 * publishes no viewed-session outlet; with one, the area shows the displayed session either way.
 */
export function publishMarkerOnTransition(
	definition: ExtensionDefinition,
	ownerKey: string,
	transport: MarkerTransport,
	seat: MarkerSeat,
): void {
	if (definition.marker === undefined) return;

	publishMarkerArea(transport, seat({ kind: "owner", key: ownerKey }));
}
