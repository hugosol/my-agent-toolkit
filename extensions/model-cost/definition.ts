/**
 * The model-cost extension definition, shared by every harness assembly.
 *
 * This is plain data: the framework supplies the behavior behind each declaration, so this module
 * names no harness and holds no logic. The storage root this extension reads and writes, the
 * accounting it performs and the operator surface it offers all live in the extension's shared
 * modules; the native reads those need live in its harness assemblies.
 *
 * What it declares here is the extension's identity, the requirement its own `config.yaml`
 * has to satisfy — one `storageDir` whose value names the root every file of this extension's
 * data lives under, one `balanceTtlMs` whose value is the success TTL of the DeepSeek balance
 * reading, and one `codexQuotaTtlMs` whose value is the success TTL of the Codex allowance-window
 * query — and the operator surface it offers. The `storageDir` field's own `~/` rule is
 * the extension's (see `shared-logic/storage-root.ts`); the framework only reads and validates the
 * declared values.
 *
 * `/budget` is one named-action command, and its whole vocabulary is the action table below: the
 * framework owns the argument surface (trim, case, whole-name match, help, routing, completion and
 * error reporting) and shared logic owns what each action does. `detail` is the entry's own display
 * preference; the period actions are added where their business lives, never as a declared action
 * with nothing behind it.
 */
import { defineExtension } from "../../framework/public";

export const MODEL_COST = defineExtension({
	id: "model-cost",
	displayName: "modelCost",
	config: { fields: { storageDir: "non-empty-string", balanceTtlMs: "milliseconds", codexQuotaTtlMs: "milliseconds" } },
	commands: [
		{
			type: "actions",
			name: "budget",
			description: "费用统计与展示管理",
			actions: {
				detail: "切换简略／详细展示",
				holiday: "开启假日计价",
				clear: "归档并重置统计",
			},
		},
	],
});
