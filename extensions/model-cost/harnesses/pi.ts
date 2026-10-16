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
 * The supported harness version is not this assembly's to declare: version support belongs to the
 * framework's own Supported harness baseline, and this assembly names only what its extension needs. A
 * binding the harness refuses has already reported why on the non-model channel, and this session then
 * simply runs without the extension.
 */
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type PiExtensionApi, piAdapter } from "../../../framework/adapters/pi";
import type { ExtensionImplementation } from "../../../framework/public";
import { MODEL_COST } from "../definition";
import { type ModelCostRuntime, createModelCostRuntime } from "../shared-logic/runtime";
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
	 * The process's one frontend release, as the binding's cleanup reaches it.
	 *
	 * The factory runs before the frontend can be attached — attaching needs the host's own api and the
	 * runtime's read-only results — so the two are joined in this one handle: the cleanup composed below
	 * calls whatever the binding function attached under it.
	 */
	let releaseFrontend: (() => void) | undefined;

	const bindModelCost = piAdapter(MODEL_COST, {
		configBaseDir: repositoryRoot,
		// The extension's own half: the framework hands the factory the configuration it validated, and
		// the runtime resolves the storage root from it, supplies the catalog the framework asks for a
		// request's price, observes this session's Turns and Rounds, and saves the session's own
		// consumption at its Round's end. The factory runs at most once per process, on the first binding.
		factory: context => {
			const built = createModelCostRuntime({
				config: context.config,
				configDirectory,
				userHomeDirectory: homedir(),
				harness: MODEL_COST_HARNESS,
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
			// The dispose front-end is the framework's: a binding runs the one `cleanup` it declared,
			// exactly once, when the session that initialized the instance ends. Composing the frontend's
			// release into that entry is what keeps the widget bound to the same lifetime — and what keeps
			// this extension from naming a native shutdown event of its own, which it may not. The
			// implementation's own cleanup still runs, and after the frontend's release.
			const cleanup = built.implementation.cleanup;
			const implementation: ExtensionImplementation = {
				...built.implementation,
				cleanup: () => {
					releaseFrontend?.();
					releaseFrontend = undefined;
					return cleanup?.();
				},
			};
			return implementation;
		},
	});

	return pi => {
		const bound = bindModelCost(pi);
		// The extension's own frontend, attached after the binding it draws beside and only when that
		// binding was admitted: it reads the same read-only display result the framework's binding feeds,
		// and pi's own widget is the only thing it owns. A refused binding subscribes nothing here.
		if (bound.bound && runtime !== undefined) releaseFrontend = attachModelCostWidget(pi, runtime);
	};
}

export default modelCostPiHarness(EXTENSION_REPOSITORY_ROOT);
