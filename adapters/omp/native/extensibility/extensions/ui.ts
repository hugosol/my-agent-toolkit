/**
 * The ExtensionUIContext contract consumed by the OMP adapter, from
 * `extensibility/extensions/types.ts`. The interactive controller is an implementation of
 * this public native surface, not the ownership coordinate for extension feedback/widgets.
 * Only the members the framework maps are named; no-UI contexts retain the same shape.
 */
export interface OmpUiContext {
	/** Native confirmation, with host-owned dialog cancellation and countdown. */
	confirm?(title: string, message: string, options?: { readonly signal?: AbortSignal; readonly timeout?: number; readonly onTimeout?: () => void }): Promise<boolean>;
	/** Shows a notification to the user. */
	notify(message: string, type?: "info" | "warning" | "error"): void;
	/** Sets one widget in the editor area, or clears it when `content` is undefined. */
	setWidget(
		key: string,
		content: readonly string[] | undefined,
		options?: { readonly placement?: "aboveEditor" | "belowEditor" },
	): void;
}
