/**
 * The request price anchor: which price one model request is charged at, decided when the request
 * really began.
 *
 * This module is the algorithm half of the extension's pricing, and it reads the maintained data
 * (see `model-data.ts`) as an argument rather than importing it, so the rules below can be driven —
 * in the extension's own tests — with a self-made list, self-made prices and self-made windows. What
 * it decides is:
 *
 * - **Mode**: the reported provider and the exact model id together, exactly as the data names them.
 *   Nothing here looks at a base URL, an `owned_by` field, a prefix, a suffix, an alias or the
 *   session's current model, so a model the data does not name is `hidden` and never upgraded into a
 *   tier it resembles.
 * - **Season**: peak or off-peak, from the request's own start instant and the accounting period's
 *   holiday fact. The pricing zone's workdays have two closed windows ([09:00, 12:00] and
 *   [14:00, 18:00] in the data's zone); 12:00:00.000 is still peak and 12:00:00.001 is not, weekends
 *   are off-peak all day, and a holiday period is off-peak for every instant inside it. The
 *   determination uses the *start* instant only: a request that began inside a peak window keeps the
 *   peak price however long it runs, which is what "anchored at the request's start" means.
 * - **Amount**: the season's factor applied to the data's off-peak tier price, with the currency and
 *   the unit the data states. A monetary mode whose tier the data carries no price for is
 *   `missing-price`: usage still counts, no amount does, and the caller is expected to say so.
 * - **The allowance channel's amount is the harness's own price.** An allowance model is priced by
 *   the catalog price the framework snapshotted at that request's start — the harness states what its
 *   subscription-backed models cost, and the maintained data does not — so the answer is a
 *   `reference` in that snapshot's own currency and unit. A request whose channel stated no price has
 *   nothing to reference: its usage counts and no amount is produced, which is not the monetary
 *   `missing-price` case and is not reported as one.
 *
 * Every answer is fixed by the facts of the request's start. Later changes of the data, of the
 * session's model or of the current season do not re-price a request that was already anchored, and
 * nothing here is ever asked to recompute an amount that was already accumulated.
 */
import type { CatalogPrice } from "../../../../../framework/interface/host-facts";
import { type ModelPricingData, catalogPriceOf, classify } from "./model-data";

/** Which of the two prices of a pricing zone's day an instant falls in. */
export type Season = "peak" | "off-peak";

/** What one request's start fixed about its price, as the extension's accounting reads it. */
export type RequestPrice =
	/** A monetary model with a price in the data: the season's applicable price, currency and unit. */
	| { readonly kind: "monetary"; readonly season: Season; readonly price: CatalogPrice }
	/**
	 * An allowance model whose own catalog price the framework snapshotted at this request's start.
	 *
	 * It is a *reference*: the amount is the same usage valued at the harness's own stated price, kept
	 * in the currency that price is stated in and never added to a monetary amount or converted into
	 * one. Nothing here re-decides it later — the snapshot is the price of this request's own start.
	 */
	| { readonly kind: "reference"; readonly price: CatalogPrice }
	/**
	 * A monetary model whose tier the data states no price for.
	 *
	 * This is a gap in the maintained data, not a mode without an accounting policy: the request's
	 * usage is still real and still counted, only the amount is skipped.
	 */
	| { readonly kind: "missing-price" }
	/**
	 * A mode this extension prices no amount for at all: token-only, hidden, and an allowance request
	 * whose channel stated no price — which is a channel with nothing to reference rather than a
	 * missing price of a policy, so no amount is skipped and nothing is reported missing.
	 */
	| { readonly kind: "no-amount-policy"; readonly mode: "token-only" | "allowance" | "hidden" };

/** The facts of one request's start that decide its price. */
export interface RequestPriceFacts {
	/** The provider the host reported for the request. */
	readonly provider: string;
	/** The exact model id the host reported for the request. */
	readonly model: string;
	/** When the request really began, on the process's own clock (epoch milliseconds). */
	readonly startedAt: number;
	/** Whether the accounting period the request began in is a holiday period. */
	readonly holiday: boolean;
	/**
	 * The catalog price the framework snapshotted at this request's start, when its catalog answered
	 * one.
	 *
	 * It is the one price a request carries from outside the maintained data: the allowance channel's
	 * subscription-backed models, whose price the harness itself states. The data's own prices are
	 * read from the data rather than from here, because only the data states the tier a peak price
	 * derives from.
	 */
	readonly catalogPrice?: CatalogPrice;
}

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/**
 * Whether one instant is inside a workday peak window of the data's zone.
 *
 * The zone is applied as a fixed offset (the data names it, and Beijing does not shift), and the
 * windows are inclusive at both ends: an instant exactly on a boundary is peak, and one millisecond
 * past it is not. Weekends are off-peak all day, before any window is consulted.
 */
export function seasonAt(data: ModelPricingData, at: number, holiday: boolean): Season {
	if (holiday) return "off-peak";
	const shifted = at + data.zoneOffsetMinutes * MINUTE_MS;
	const weekday = new Date(shifted).getUTCDay();
	if (weekday === 0 || weekday === 6) return "off-peak";
	const minuteOfDay = (((shifted % DAY_MS) + DAY_MS) % DAY_MS) / MINUTE_MS;
	const peak = data.peakWindows.some(window => minuteOfDay >= window.fromMinute && minuteOfDay <= window.toMinute);
	return peak ? "peak" : "off-peak";
}

/**
 * The days of the zone's schedule this search looks through before it answers nothing.
 *
 * The windows the data states are daily ones, so a whole week of them is more than one change can
 * be away; the bound only stops a data set with no window at all from being searched forever.
 */
const SCHEDULE_DAYS = 8;

/**
 * The first instant strictly after `at` whose season differs, or nothing when no instant ahead differs.
 *
 * The instants a season can change at are the schedule's own: each window's start (the first peak
 * millisecond) and **one millisecond past each window's end** — the endpoint itself is still peak, so
 * the first off-peak instant of a window that closes at 12:00:00.000 is 12:00:00.001, and a reading
 * taken exactly on such an endpoint is answered with that one-millisecond wait rather than with the
 * next window's start. A holiday period answers nothing: every instant inside it is off-peak, so no
 * instant ahead differs and there is nothing for a caller to wait for.
 *
 * This is a schedule query rather than a price: what a caller does with the instant — wait until it
 * and re-read — is the caller's business, and nothing here reads a clock of its own.
 */
export function nextSeasonChange(data: ModelPricingData, at: number, holiday: boolean): number | undefined {
	if (holiday) return undefined;
	const season = seasonAt(data, at, holiday);
	const offset = data.zoneOffsetMinutes * MINUTE_MS;
	// The zone's own midnight the instant falls in: the search runs in shifted time, and every instant
	// it produces is shifted back, so a zone that is not the process's own is still exact.
	const shiftedAt = at + offset;
	const midnight = Math.floor(shiftedAt / DAY_MS) * DAY_MS;
	let soonest: number | undefined;
	for (let day = 0; day < SCHEDULE_DAYS; day += 1) {
		const base = midnight + day * DAY_MS;
		for (const window of data.peakWindows) {
			for (const candidate of [base + window.fromMinute * MINUTE_MS, base + window.toMinute * MINUTE_MS + 1]) {
				if (candidate <= shiftedAt) continue;
				if (soonest !== undefined && candidate >= soonest) continue;
				if (seasonAt(data, candidate - offset, holiday) === season) continue;
				soonest = candidate;
			}
		}
	}
	return soonest === undefined ? undefined : soonest - offset;
}

/**
 * The price one request is charged at, from the request's own start facts.
 *
 * The answer is the anchor: the accounting charges this request by it and never by anything that
 * changed afterwards. Usage is unaffected by this decision — a mode this extension prices no amount
 * for, and a monetary mode whose price is missing, both still have their reported usage counted.
 */
export function requestPriceOf(data: ModelPricingData, request: RequestPriceFacts): RequestPrice {
	const classification = classify(data, request.provider, request.model);
	// The allowance channel is priced by the harness's own catalog, not by the data: this request keeps
	// the price that was snapshotted at its start, and a channel that stated none is a channel with
	// nothing to reference rather than a monetary gap.
	if (classification.mode === "allowance") {
		const snapshot = request.catalogPrice;
		return snapshot === undefined
			? { kind: "no-amount-policy", mode: "allowance" }
			: { kind: "reference", price: snapshot };
	}
	if (classification.mode !== "monetary") return { kind: "no-amount-policy", mode: classification.mode };
	const season = seasonAt(data, request.startedAt, request.holiday);
	const base = catalogPriceOf(data, classification.tier);
	if (base === undefined) return { kind: "missing-price" };
	const factor = season === "peak" ? data.peakMultiplier : 1;
	const amounts = Object.fromEntries(
		Object.entries(base.amounts).map(([bucket, amount]) => [bucket, amount * factor]),
	);
	return { kind: "monetary", season, price: { currency: base.currency, unit: base.unit, amounts } };
}
