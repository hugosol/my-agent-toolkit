/**
 * model-cost's pi harness assembly: the extension's only module that touches the pi-native surface.
 *
 * The thin entrypoint at `entrypoints/pi/model-cost.ts` re-exports nothing but this module's default
 * factory. What belongs here is the native access the extension is allowed and the plain facts its
 * shared logic is handed: the framework's pi adapter binds the definition, and this assembly supplies
 * the directory the definition's relative configuration path is resolved against (its own module
 * location knows the repository, which no shared module does) plus the operating system user home the
 * storage field's `~/` prefix means. Shared logic receives plain data and names no native type.
 *
 * The repository root is a parameter of {@link modelCostPiHarness} rather than a constant of this
 * module's only because it is the deployment fact the framework resolves the declared configuration
 * path against — a controlled run may state another root to exercise a different configuration, and
 * the default export below is this module's own repository. Nothing else differs between deployments:
 * the same definition, the same runtime and the same frontend are bound either way.
 *
 * The one further harness fact this assembly states is its entry's subagent integration, which the
 * framework settles once per process and hands over at the entry's initialization node. It declares
 * the entry a spawned session loads (`childEntry`), so the answer is this assembly's own to record
 * and shared logic reads it from there: `/budget detail` draws the descendants the entry observed, so
 * an entry that settled as the no-subagent mode answers a notice instead of switching a form it has
 * nothing to draw in. The OMP assembly states none, because every entry it binds is integrated.
 *
 * The supported harness version is not this assembly's to declare: version support belongs to the
 * framework's own Supported harness baseline, and this assembly names only what its extension needs. A
 * binding the harness refuses has already reported why on the non-model channel, and this session then
 * simply runs without the extension.
 */
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type PiExtensionApi, piAdapter } from "../../../framework/adapters/pi";
import type { ExtensionImplementation, SubagentIntegration } from "../../../framework/public";
import { MODEL_COST } from "../definition";
import { type ModelCostRuntime, createModelCostRuntime } from "../shared-logic/runtime";
import { createBoundaryTimer } from "./boundary-timer";
import { attachModelCostWidget } from "./pi/widget";

/**
 * The extension repository this module belongs to: `harnesses/pi.ts` -> `harnesses` -> the extension
 * -> `extensions` -> the repository root, from this module's own location.
 *
 * The framework resolves the definition's relative configuration path — the convention
 * `extensions/<definition.id>/config.yaml` — against the directory an assembly supplies, because the
 * loader discovers an extension by an absolute path while the process runs in an arbitrary project
 * directory. This module is the only place that knows the repository from its own location: the
 * entrypoint is a thin re-export, and the extension's shared source is harness-neutral and holds no
 * path of its own.
 */
export const EXTENSION_REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/**
 * The harness this assembly serves, as this extension's data names it.
 *
 * It is the harness half of every stored session identity (`harnesses.<harness>.sessions`), so it is
 * this assembly's to state — a harness-neutral shared module cannot know which one is binding it — and
 * it stays the same string across processes so that one harness's sessions continue to be found where
 * the previous process wrote them. It is also what keeps a pi session and an OMP session of the same
 * id apart in one shared storage root.
 */
export const MODEL_COST_HARNESS = "pi";

/**
 * One implementation with every frontend release this process attached composed into its cleanup.
 *
 * The dispose front-end is the framework's: a binding runs the one `cleanup` it declared, exactly once,
 * when the session that initialized the instance ends. Composing the frontends' releases into that one
 * entry is what keeps each binding's widget, its context observation and its registration with the UI's
 * one boundary wait bound to the same lifetime — and what keeps this extension from naming a native
 * shutdown event of its own, which it may not. A process binds this entry more than once (the session it
 * serves and every session the subagent provider spawns), so each of those bindings' own release is
 * reached here, and each is forgotten as it is released.
 *
 * The implementation's own cleanup still runs, and after those releases: nothing is drawn through an
 * accumulation that is being closed.
 */
export function releasingFrontendsOnCleanup(
	implementation: ExtensionImplementation,
	frontendReleases: Set<() => void>,
): ExtensionImplementation {
	const cleanup = implementation.cleanup;
	return {
		...implementation,
		cleanup: () => {
			for (const release of [...frontendReleases]) {
				frontendReleases.delete(release);
				release();
			}
			return cleanup?.();
		},
	};
}

/**
 * The extension's pi assembly for one repository root: a binding of the shared definition whose
 * declared configuration is resolved under `repositoryRoot`.
 *
 * The returned factory carries the process's single business instance: the framework's factory runs
 * once and hands the same implementation to every later binding, so every binding of this process
 * reads one accumulation. A binding that rebuilds the instance after a disposal replaces it, and the
 * frontend attached around that binding draws the new one.
 */
export function modelCostPiHarness(repositoryRoot: string): (pi: PiExtensionApi) => void {
	/** The directory the extension's own `config.yaml` lives in, inside that repository. */
	const configDirectory = join(repositoryRoot, "extensions", MODEL_COST.id);
	/** The process's one business instance, as this assembly built it. */
	let runtime: ModelCostRuntime | undefined;
	/**
	 * The process's one UI boundary wait, shared by every frontend this assembly attaches.
	 *
	 * One pi process draws one display, and that display shows one season whatever session is bound, so
	 * the wait for the season to change belongs to the UI rather than to a session: the schedule it reads
	 * is the same process-wide presentation result every frontend draws, and reading it through a
	 * function is what keeps the timer itself free of any pricing rule. A process whose runtime is not
	 * built yet has no schedule, so nothing is armed for it. What a registering frontend supplies is its
	 * own timer carrier — pi publishes no timer API, so its frontend owns the raw one-shot and clears it
	 * with its own release (see `pi/widget.ts`).
	 */
	const uiBoundaryTimer = createBoundaryTimer(() => {
		const period = runtime?.presentation.period();
		if (period === undefined) return undefined;
		return { at: period.at, ...(period.nextChangeAt === undefined ? {} : { nextChangeAt: period.nextChangeAt }) };
	});
	/**
	 * Every frontend release this assembly has attached, as the binding's cleanup reaches them.
	 *
	 * The factory runs before a frontend can be attached — attaching needs the host's own api and the
	 * runtime's read-only results — and every binding of the process attaches its own: the session this
	 * entry serves and each session the subagent provider spawns run their own binding, so the cleanup
	 * composed below releases every one of them, so that no widget, no context observation and no
	 * boundary wait of a session that ended outlives it.
	 */
	const frontendReleases = new Set<() => void>();

	const bindModelCost = piAdapter(MODEL_COST, {
		configBaseDir: repositoryRoot,
		// The module pi's loader discovers this extension through, required in every child session the
		// subagent provider spawns: a spawned session reports its own facts through this same entry, so
		// the adapter requires it there rather than the provider guessing which extensions to load.
		childEntry: join(repositoryRoot, "entrypoints", "pi", "model-cost.ts"),
		// The extension's own half: the framework hands the factory the configuration it validated, and
		// the runtime resolves the storage root from it, supplies the catalog the framework asks for a
		// request's price, observes this session's Turns and Rounds, and saves the session's own
		// consumption at its Round's end. The factory runs at most once per process, on the first binding.
		factory: context => {
			/**
			 * The one answer the framework settles about this entry's subagent integration, recorded
			 * where the framework hands it over — this entry's initialization node — and read by shared
			 * logic through the input below. Before that initialization settles, no answer exists and
			 * `/budget detail` is exactly what the extension delivers.
			 */
			let subagentIntegrationMode: SubagentIntegration["mode"] | undefined;
			const built = createModelCostRuntime({
				config: context.config,
				configDirectory,
				userHomeDirectory: homedir(),
				harness: MODEL_COST_HARNESS,
				subagentIntegrationMode: () => subagentIntegrationMode,
				// The framework's own session observation source: the one place every session's context
				// reading and activity is collected, in this process and — through local access — across
				// its process boundary, so this extension reads the common interface and subscribes to no
				// native context event of its own.
				sessionObservations: context.sessionObservations,
				// The framework's own statement channel: this process's sessions state each write they
				// confirmed, and the framework carries it to the process serving their owner — the one
				// other process that has to read the shared document again. This process serves a spawned
				// session's owner only when it is the session that owns it, and nothing is stated for a
				// session whose owner is served here.
				recordSessionCommit: context.recordSessionCommit,
				// The harness's own model prices, as the framework mapped them from pi's catalog: the
				// extension's single price catalog composes them after its maintained data, which is what
				// makes the allowance channel's own price a real request-time fact on this host.
				...(context.modelPrices === undefined ? {} : { modelPrices: context.modelPrices }),
				// The harness's own access to the providers it serves, as the framework mapped it from pi's
				// registry: the balance query reads the address and the credential of the moment from it, so a
				// host-side replacement is what the next query uses.
				...(context.providerAccess === undefined ? {} : { providerAccess: context.providerAccess }),
			});
			runtime = built;
			const initialize = built.implementation.initialize;
			const implementation: ExtensionImplementation = {
				...built.implementation,
				// The framework hands this entry's one settled subagent answer over at this node, so it is
				// recorded here — the entry the provider loads into spawned sessions is required by this
				// same assembly, and whether that reached a provider is what `/budget detail` is offered
				// under. The entry's own initialization still runs, with the same delivery.
				initialize: async delivery => {
					subagentIntegrationMode = delivery.subagents.mode;
					await initialize?.(delivery);
				},
			};
			// The dispose front-end is the framework's — the one `cleanup` this instance declares, run when
			// the session that initialized it ends — and every frontend of this process is released through
			// it rather than through a native shutdown event of the extension's own, which it may not name.
			return releasingFrontendsOnCleanup(implementation, frontendReleases);
		},
	});

	return pi => {
		const bound = bindModelCost(pi);
		// The extension's own frontend, attached after the binding it draws beside and only when that
		// binding was admitted: it reads the same read-only display result the framework's binding feeds,
		// and pi's own widget is the only thing it owns. A refused binding subscribes nothing here.
		if (bound.bound && runtime !== undefined) {
			const built = runtime;
			// The widget draws the displayed session's own reading through the UI's one boundary wait.
			// The readings themselves are no longer this half's to collect: the framework's own
			// observation source holds every session's context — the adapter collects it where pi moves
			// one — so a descendant's context is read from there without a viewed-session outlet and
			// without this extension subscribing to a native context event at all. Every registration
			// follows the binding's cleanup, because every one of them is that binding's own and nothing
			// of any outlives the session that initialized the instance.
			const releaseWidget = attachModelCostWidget(pi, built, uiBoundaryTimer);
			frontendReleases.add(releaseWidget);
		}
	};
}

export default modelCostPiHarness(EXTENSION_REPOSITORY_ROOT);
