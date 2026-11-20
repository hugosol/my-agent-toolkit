import type { ToolExecutionDelivery } from "../interface/tool";

type NativeConfirmation = (title: string, message: string, options: { readonly signal: AbortSignal; readonly timeout: number; readonly onTimeout: () => void; readonly onTimeoutStart: () => void }) => Promise<boolean>;

/** Native UI stays adapter-owned; only a bounded literal approval reaches business code. */
export function toolConfirmation(
	native: NativeConfirmation | undefined,
	toolSignal: AbortSignal | undefined,
	waiting?: (active: boolean, label: string) => void,
): NonNullable<ToolExecutionDelivery["confirm"]> {
	return request => {
		const { title, message, timeoutMs, signal } = request;
		if (!native || toolSignal?.aborted || signal?.aborted || !Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647) {
			return Promise.resolve(false);
		}
		const { promise, resolve } = Promise.withResolvers<boolean>();
		const controller = new AbortController();
		let settled = false;
		let visible = false;
		const notify = (active: boolean) => {
			// Attention is auxiliary: a missing or failing terminal integration cannot decide approval.
			try { waiting?.(active, title); } catch { /* Keep the native confirmation authoritative. */ }
		};
		const onTimeoutStart = () => {
			if (settled || visible || !request.notifyOnWait) return;
			visible = true;
			notify(true);
		};
		const started = performance.now();
		const finish = (approved: boolean) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			toolSignal?.removeEventListener("abort", cancel);
			signal?.removeEventListener("abort", cancel);
			resolve(approved);
			// Also dismiss hosts that do not implement their own timeout correctly.
			controller.abort();
			if (visible) notify(false);
		};
		const cancel = () => finish(false);
		const timer = setTimeout(cancel, timeoutMs);
		toolSignal?.addEventListener("abort", cancel, { once: true });
		signal?.addEventListener("abort", cancel, { once: true });
		try {
			Promise.resolve(native(title, message, { signal: controller.signal, timeout: timeoutMs, onTimeout: cancel, onTimeoutStart })).then(
				answer => finish(answer === true && !toolSignal?.aborted && !signal?.aborted && performance.now() - started < timeoutMs),
				cancel,
			);
		} catch {
			cancel();
		}
		return promise;
	};
}
