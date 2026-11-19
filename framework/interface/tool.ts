/**
 * Native-free description of model input, not an authoritative framework validator.
 * Adapters may relax native validation to preserve raw values; handlers receive unknown
 * and retain responsibility for strict business input checks.
 */
export type ToolParameterSchema =
	| { readonly type: "string"; readonly enum?: readonly string[]; readonly description?: string }
	| { readonly type: "boolean"; readonly description?: string }
	| { readonly type: "array"; readonly items: ToolParameterSchema; readonly description?: string }
	| { readonly type: "object"; readonly properties: Readonly<Record<string, ToolParameterSchema>>; readonly required?: readonly string[]; readonly additionalProperties?: boolean; readonly description?: string }
	| { readonly anyOf: readonly ToolParameterSchema[]; readonly description?: string };

/** The actual call's identity and cancellation, never a native execution context. */
export interface ToolExecutionDelivery {
	readonly sessionId: string;
	readonly callId: string;
	readonly signal?: AbortSignal;
	/** Replace the current call’s presentation with a UI-only details snapshot. */
	readonly onUpdate?: (details: unknown) => void;
	/** Native user approval only; absent UI, cancellation, errors and timeout all refuse. */
	readonly confirm?: (request: {
		readonly title: string;
		readonly message: string;
		readonly timeoutMs: number;
		/** Ask the host integration to signal attention while this confirmation is visible. */
		readonly notifyOnWait?: boolean;
		/** Additional business lifetime cancellation, alongside this tool call's signal. */
		readonly signal?: AbortSignal;
	}) => Promise<boolean>;
}

/** A business result that each adapter maps into its native result. */
export interface ToolExecutionResult {
	readonly content: readonly { readonly type: "text"; readonly text: string }[];
	readonly details?: unknown;
	readonly isError?: boolean;
}

/** Static authoring plus the business operation over the implementation's one state. */
export interface ToolDeclaration<State> {
	readonly name: string;
	readonly label: string;
	readonly description: string;
	readonly parameters: ToolParameterSchema;
	/** Keep the call visible as a top-level model tool instead of routing it through code tools. */
	readonly directOnly?: true;
	/** Optional UI-only rows derived from details. OMP replaces the raw result display; Pi shows rows alongside its existing result. */
	readonly displayOutput?: (details: unknown) => readonly string[] | undefined;
	readonly execute: (state: State, params: unknown, delivery: ToolExecutionDelivery) => ToolExecutionResult | Promise<ToolExecutionResult>;
}

