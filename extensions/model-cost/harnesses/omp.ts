/**
 * model-cost's OMP harness assembly: the extension's only module that touches the OMP-native
 * surface.
 *
 * The thin entrypoint at `entrypoints/omp/model-cost.ts` re-exports nothing but this file's default
 * factory. What belongs here is the native access the extension is allowed and the plain facts its
 * shared logic is handed: the framework's OMP adapter binds the definition, and this assembly
 * supplies the directory the definition's relative configuration path is resolved against (its own
 * module location knows the repository, which no shared module does) plus the operating system user
 * home the storage field's `~/` prefix means. Shared logic receives plain data and names no native
 * type.
 *
 * The supported harness version is not this assembly's to declare: version support belongs to the
 * framework's own Supported harness baseline, and this assembly names only what its extension
 * needs. A binding the harness refuses has already reported why on the non-model channel, and this
 * session then simply runs without the extension.
 */
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type OmpExtensionApi, ompAdapter } from "../../../adapters/omp";
import type { ExtensionImplementation } from "../../../framework/public";
import { MODEL_COST } from "../definition";
import { type ModelCostRuntime, createModelCostRuntime } from "../shared-logic/runtime";
import { createBoundaryTimer } from "./boundary-timer";
import { type WidgetDrawing, attachModelCostWidget } from "./omp/widget";

/**
 * The extension repository this assembly belongs to: `harnesses/omp.ts` -> `harnesses` -> the
 * extension -> `extensions` -> the repository root, from this module's own location.
 *
 * The framework resolves the definition's relative configuration path — the convention
 * `extensions/<definition.id>/config.yaml` — against the directory an assembly supplies, because
 * the loader discovers an extension by an absolute path while the process runs in an arbitrary
 * project directory. This module is the only place that knows the repository from its own location:
 * the entrypoint is a thin re-export, and the extension's shared source is harness-neutral and
 * holds no path of its own.
 */
export const EXTENSION_REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** The directory the extension's own `config.yaml` lives in, inside that repository. */
const EXTENSION_CONFIG_DIRECTORY = join(EXTENSION_REPOSITORY_ROOT, "extensions", MODEL_COST.id);

/**
 * How this CLI's UI draws what the extension's frontend hands it.
 *
 * Only the CLI itself knows this: the interactive UI draws a component and asks it for its lines at
 * its own width, while a headless host takes text alone — so a colour the frontend mapped would be
 * text nobody drew, and there would be no width to fit a line into. The check is the host's own (the
 * same stdout-is-a-terminal test the CLI makes for itself), and the extension reads it here, in its
 * own harness assembly, rather than in the shared modules that draw the lines.
 */
export const MODEL_COST_WIDGET_DRAWING: WidgetDrawing = process.stdout.isTTY === true ? "component" : "lines";

/**
 * The harness this assembly serves, as this extension's data names it.
 *
 * It is the harness half of every stored session identity (`harnesses.<harness>.sessions`), so it
 * is this assembly's to state — a harness-neutral shared module cannot know which one is binding it
 * — and it stays the same string across processes so that one harness's sessions continue to be
 * found where the previous process wrote them.
 */
export const MODEL_COST_HARNESS = "omp";

/**
 * The process's one business instance, as this assembly built it.
 *
 * The framework's factory runs once per process and hands the same implementation to every later
 * binding, so this is the runtime the widget draws from: the session that built it and every
 * subagent that reuses it read one accumulation. A binding that rebuilds the instance after a
 * disposal replaces it, and the widget attached around that binding draws the new one.
 */
let runtime: ModelCostRuntime | undefined;

/**
 * The process's one UI boundary wait, shared by the extension's own frontends.
 *
 * One CLI draws one display, and that display shows one season whatever is being viewed, so the wait
 * for the season to change is the UI's rather than a session's: the schedule it reads is the same
 * process-wide presentation result every frontend draws. Reading it through a function is what keeps
 * the timer itself free of any pricing rule — and a process whose runtime is not built yet has no
 * schedule, so nothing is armed for it.
 */
const uiBoundaryTimer = createBoundaryTimer(() => {
	const period = runtime?.presentation.period();
	if (period === undefined) return undefined;
	return { at: period.at, ...(period.nextChangeAt === undefined ? {} : { nextChangeAt: period.nextChangeAt }) };
});

/**
 * One implementation with this extension's own frontend release composed into its cleanup.
 *
 * The dispose front-end is the framework's: a binding runs the one `cleanup` it declared, exactly
 * once, when the session that initialized the instance ends. Composing the frontend's release into
 * that entry is what keeps the widget and the UI's boundary wait bound to the same lifetime — and
 * what keeps this extension from naming a native shutdown event of its own, which it may not.
 *
 * The implementation's own cleanup still runs, and after the frontend's release: nothing is drawn
 * through an accumulation that is being closed.
 */
export function releasingFrontendOnCleanup(
	implementation: ExtensionImplementation,
	releaseFrontend: () => void,
): ExtensionImplementation {
	const cleanup = implementation.cleanup;
	return {
		...implementation,
		cleanup: () => {
			releaseFrontend();
			return cleanup?.();
		},
	};
}

/**
 * The process's one frontend release, as the binding's cleanup reaches it.
 *
 * The factory runs before the frontend can be attached — attaching needs the host's own api and the
 * runtime's read-only results — so the two are joined in this one module-level handle: the cleanup
 * composed above calls whatever `modelCost` attached below.
 */
let releaseFrontend: (() => void) | undefined;

/**
 * The extension's binding for one OMP session, created once at module load.
 *
 * The adapter is what carries the process's single business instance: it builds the runtime for the
 * first binding that gets far enough and hands that same one to every later binding. That is what
 * makes a session, its subagents and an ordinary view change share one accumulation instead of
 * starting a second one — and it is not a detail of this extension, because a subagent's own binding
 * never initializes: only a session that is its own owner starts an implementation's initialization,
 * so a runtime built per binding would account a subagent's requests nowhere at all.
 */
const bindModelCost = ompAdapter(MODEL_COST, {
	configBaseDir: EXTENSION_REPOSITORY_ROOT,
	// The extension's own half: the framework hands the factory the configuration it validated, and
	// the runtime resolves the storage root from it, supplies the catalog the framework asks for a
	// request's price, observes every actual session's Turns and saves a session's own consumption
	// at its Round's end. The factory runs at most once per process, on the first binding.
	factory: context => {
		const built = createModelCostRuntime({
			config: context.config,
			configDirectory: EXTENSION_CONFIG_DIRECTORY,
			userHomeDirectory: homedir(),
			harness: MODEL_COST_HARNESS,
			// The framework's Session capability: its observation reader is the one place every
			// session's context reading and activity is collected — each binding's own session and each
			// subagent this process runs — so this extension reads the common interface and subscribes
			// to no native context event of its own. Its `recordCommit` is the one statement this
			// extension makes: on OMP every session of the process is bound here and the owner is served
			// here, so a confirmed write is recorded in this process's own observation source and
			// carried to no other process — the session that wrote and the owner that reads share this
			// process's memory and document.
			session: context.session,
			// The harness's own model prices, as the framework mapped them from the host's catalog: the
			// extension's single price catalog composes them after its maintained data, which is what
			// makes the allowance channel's own price a real request-time fact on this host.
			...(context.modelPrices === undefined ? {} : { modelPrices: context.modelPrices }),
			// The harness's own access to the providers it serves, as the framework mapped it from the
			// host's registry: the balance query reads the address and the credential of the moment from
			// it, so a host-side replacement is what the next query uses.
			...(context.providerAccess === undefined ? {} : { providerAccess: context.providerAccess }),
		});
		runtime = built;
		return releasingFrontendOnCleanup(built.implementation, () => {
			releaseFrontend?.();
			releaseFrontend = undefined;
		});
	},
});

export default function modelCost(pi: OmpExtensionApi): void {
	const bound = bindModelCost(pi);
	// The extension's own frontend, attached after the binding it draws beside and only when that
	// binding was admitted: it reads the same read-only display result the framework's binding feeds,
	// and the host's native widget is the only thing it owns. A refused binding subscribes nothing
	// here — no widget, no drawing timer. The context readings this half used to collect itself are the
	// framework's now: the adapter reads the session's own context where the host moves one and the
	// Session capability's observation reader holds the result, so the detail tree reads a subagent's
	// context from the common interface with no native subscription of this extension's at all.
	if (bound.bound && runtime !== undefined) {
		const releaseWidget = attachModelCostWidget(pi, runtime, uiBoundaryTimer, MODEL_COST_WIDGET_DRAWING);
		const releaseResults = observeOmpSubagentResults(pi, runtime);
		releaseFrontend = () => { releaseResults(); releaseWidget(); };
	}
}

/** Observe terminal task results actually delivered to a main session, never global child activity. */
export function observeOmpSubagentResults(pi: OmpExtensionApi, runtime: ModelCostRuntime): () => void {
	let active = true;
	pi.on("message_end", async (event, ctx) => {
		if (!active || ctx.agent.kind !== "main") return;
		// These custom-message fields belong to this extension's native integration, not the
		// framework's assistant-response accounting surface.
		const message = event.message as {
			readonly role?: string;
			readonly customType?: string;
			readonly details?: { readonly jobs?: readonly { readonly type?: string }[] };
		};
		if (message.role !== "custom" || message.customType !== "async-result") return;
		// async-result is the terminal delivery. Its task entries need no status metadata;
		// the supported host can omit that field even for a successful result.
		if (!(message.details?.jobs ?? []).some(job => job.type === "task")) return;
		// The runtime reports through the feedback channel the framework handed it at
		// initialization — this native hook has no delivery of its own, and the adapter maps
		// that channel through the same actual output as every other extension notice.
		await runtime.subagentResultReceived(ctx.sessionManager.getSessionId());
	});
	return () => { active = false; };
}
