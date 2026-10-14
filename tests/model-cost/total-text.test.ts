/**
 * The Total row's own text rules before any consumption exists (the initialization the operator
 * first sees).
 *
 * The seam is the production one a frontend draws through: `totalText` is what the widget's Total
 * line is, exactly as `widget.ts` calls it. Each case hands it a display result assembled the way
 * `createPresentation` assembles one — an empty current-model scope and an empty main tree — and
 * asserts the literal text. The point of the suite is the old row's fields surviving: a scope that
 * has measured nothing writes dashes for its cache rate and Sum, a channel that displays a
 * fee-structure ratio or an account amount still writes that field with dashes when it has no value,
 * and a channel with no amount policy writes neither.
 */
import { describe, expect, test } from "bun:test";
import type { CatalogPrice } from "../../framework/core/protocol";
import { MODEL_PRICING_DATA, catalogPriceOf } from "../../extensions/model-cost/shared-logic/model-data";
import {
	type ConsumptionFields,
	type ConsumptionMode,
	type ConsumptionDisplay,
	fieldsOf,
	totalText,
} from "../../extensions/model-cost/shared-logic/presentation/display";

/** The maintained DeepSeek pro price, as the catalog query answers it. */
const PRO_PRICE = catalogPriceOf(MODEL_PRICING_DATA, "pro") as CatalogPrice;

/** No tokens and no amount at all, the state a fresh accounting period starts in. */
const EMPTY_TOKENS = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 } as const;

/** An empty main tree: no session record has contributed anything yet. */
const EMPTY_TREE: ConsumptionFields = { tokens: EMPTY_TOKENS, sum: 0 };

/**
 * The display result `createPresentation` would answer for one target on a fresh period: the
 * current-model scope is the target's own pair with no consumption, gated by the mode's amount
 * policy, and the tree it belongs to is empty.
 */
function freshDisplay(mode: ConsumptionMode, price?: CatalogPrice): ConsumptionDisplay {
	const amounts = mode === "monetary" || mode === "allowance";
	return {
		mode,
		form: "brief",
		current: fieldsOf(
			{},
			{ provider: "deepseek", model: "deepseek-v4-pro", amounts, ...(price === undefined ? {} : { price }) },
		),
		tree: EMPTY_TREE,
		effort: "?",
	};
}

describe("the Total row keeps the old extension's fields with dashes at initialization", () => {
	test("the monetary channel writes its three-bucket ratio field and Cost with no value", () => {
		expect(totalText(freshDisplay("monetary", PRO_PRICE))).toBe(
			"Cache: -  \u00A5Cache/In/Out\uff1a--:--:--  Sum: -  Cost: -  Span: \u2014",
		);
	});

	test("the allowance channel writes its four-bucket ratio field and Ref with no value", () => {
		expect(totalText(freshDisplay("allowance"))).toBe(
			"Cache: -  $CacheR/In/CacheW/Out\uff1a--:--:--:--  Sum: -  Ref: -  Span: \u2014",
		);
	});

	test("a token-only channel writes no amount and no ratio of its own", () => {
		expect(totalText(freshDisplay("token-only"))).toBe("Cache: -  Sum: -  Span: \u2014");
	});

	test("an empty ratio keeps its field while the tree's known Cost is written beside it", () => {
		const withTree: ConsumptionDisplay = {
			...freshDisplay("monetary", PRO_PRICE),
			tree: { tokens: { ...EMPTY_TOKENS, input: 1_000, output: 2_000 }, sum: 3_000, costCny: 0.05 },
		};
		expect(totalText(withTree)).toBe(
			"Cache: -  \u00A5Cache/In/Out\uff1a--:--:--  Sum: 3,000  Cost: \u00A50.05  Span: \u2014",
		);
	});
});
