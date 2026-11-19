/**
 * The ExtensionUIContext contract consumed by the OMP adapter, from
 * `extensibility/extensions/types.ts`. The interactive controller is an implementation of
 * this public native surface, not the ownership coordinate for extension feedback/widgets.
 * Only the members the framework maps are named; no-UI contexts retain the same shape.
 */
interface OmpWidgetTui {
	getFocused(): unknown;
	hasOverlay?(): boolean;
}

type OmpWidgetFactory = (tui: OmpWidgetTui) => { render(width: number): string[]; invalidate(): void };

/** Read the native TUI borrowed from a zero-row widget, without changing focus or the editor. */
export function observeComposerGate(ui: OmpUiContext): (() => boolean) | undefined {
	const widget = ui as OmpUiContext & { setWidget(key: string, content: OmpWidgetFactory): void };
	const key = `framework:composer-gate:${crypto.randomUUID()}`;
	let tui: OmpWidgetTui | undefined;
	widget.setWidget(key, view => {
		tui = view;
		return { render: () => [], invalidate() {} };
	});
	ui.setWidget(key, undefined);
	const view = tui;
	if (view === undefined || typeof view.getFocused !== "function") return undefined;
	return () => {
		// The composer is the focused CustomEditor (or its configured subclass), not a plain
		// modal editor. `disableSubmit` is opened by OMP itself when its bootstrap wiring ends.
		const editor = view.getFocused() as { disableSubmit?: boolean; onSubmit?: unknown; setCustomKeyHandler?: unknown } | null;
		return view.hasOverlay?.() !== true && editor?.disableSubmit === false &&
			typeof editor.onSubmit === "function" && typeof editor.setCustomKeyHandler === "function";
	};
}

export interface OmpUiContext {
	/** Native confirmation, with host-owned dialog cancellation and countdown. */
	confirm?(title: string, message: string, options?: { readonly signal?: AbortSignal; readonly timeout?: number; readonly onTimeout?: () => void; readonly onTimeoutStart?: (timeoutSeconds: number) => void }): Promise<boolean>;
	/** Shows a notification to the user. */
	notify(message: string, type?: "info" | "warning" | "error"): void;
	/** Sets one widget in the editor area, or clears it when `content` is undefined. */
	setWidget(
		key: string,
		content: readonly string[] | undefined,
		options?: { readonly placement?: "aboveEditor" | "belowEditor" },
	): void;
}
