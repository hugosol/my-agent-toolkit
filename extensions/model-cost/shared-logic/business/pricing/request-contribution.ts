/**
 * Pricing owns the request's classification, start-time price and resulting contribution.
 * Session accounting retains the returned settlement function by Turn identity and applies its
 * result once; it never needs to inspect the captured price or know a pricing tier or season.
 */
import type { TurnUsage } from "../../../../../framework/core/protocol";
import type { RequestContribution, RequestSettlement } from "../../foundation/session/request-accounting";
import type { ModelPricingData } from "./model-data";
import { requestPriceOf } from "./request-price";

const TOKEN_BUCKETS = ["input", "cacheRead", "cacheWrite", "output"] as const;
const TOKENS_PER_UNIT = 1_000_000;

/** Value only the request's reported buckets at its own anchored price. */
function amountOf(usage: TurnUsage, amounts: Readonly<Record<string, number>>): number {
	let total = 0;
	for (const bucket of TOKEN_BUCKETS) total += usage[bucket] * (amounts[bucket] ?? 0);
	return total / TOKENS_PER_UNIT;
}

/** Build the contribution policy without session state, file access or save scheduling. */
export function createRequestContribution(data: ModelPricingData): RequestContribution {
	return {
		anchor(request) {
			const { provider, model } = request;
			const price = requestPriceOf(data, request);
			return (usage): RequestSettlement => {
				if (price.kind === "no-amount-policy" && price.mode === "hidden") return { kind: "skip" };
				if (usage === undefined) {
					return {
						kind: "skip",
						notice: {
							level: "warning",
							message: `本次请求（${provider}/${model}）没有可靠的 usage 读数，已跳过该次消费统计；跳过不等于免费。`,
						},
					};
				}
				if (price.kind === "monetary") {
					return { kind: "account", usage, costCny: amountOf(usage, price.price.amounts) };
				}
				if (price.kind === "reference") {
					return { kind: "account", usage, referenceCostUsd: amountOf(usage, price.price.amounts) };
				}
				if (price.kind === "missing-price") {
					return {
						kind: "account",
						usage,
						notice: {
							level: "warning",
							message: `本次请求（${provider}/${model}）缺适用价格：token 已累计，本次金额跳过；已累计的费用不受影响。`,
						},
					};
				}
				// Token-only and an allowance channel with no catalog price keep usage, not a zero amount.
				return { kind: "account", usage };
			};
		},
	};
}
