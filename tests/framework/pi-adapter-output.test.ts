/**
 * The pi adapter's assembly output contract.
 *
 * The overloads state what an assembly's own `childEntry` means: an explicit entry gives this
 * process's subagent integration something to require, so the constructed port carries the settle
 * member; an omitted or explicitly undefined entry states none, so the port declares it absent; a
 * `string | undefined` entry or a general `PiAssembly` keeps the generic optional member because the
 * outcome is not known from the type. The assertions below are compile-time (`bun run typecheck`),
 * while the runtime cases read the port `createPiPort` actually constructed — the overload is never
 * read as evidence that the member was assembled.
 */
import { describe, expect, test } from "bun:test";
import {
	piAdapter,
	type PiAssembly,
	type PiExtensionApi,
	type PiExtensionFactory,
} from "../../adapters/pi";
import type { PiSubagentIntegration } from "../../adapters/pi/domain/subagent/integration";
import { piSessionFileAnchors } from "../../adapters/pi/domain/subagent/queries";
import { piProviderFacts } from "../../adapters/pi/native/core/model-registry";
import { piSessionPositions } from "../../adapters/pi/domain/session/queries";
import {
	createPiPort,
	type PiPortInput,
	type PiPortResult,
	type PiPortWithSubagents,
	type PiPortWithoutSubagents,
} from "../../adapters/pi/internal/port";
import type { ExtensionDefinition } from "../../framework/interface/details/definition";
import type { AdapterFactory } from "../../framework/runtime/adapter-authoring";
import type { HarnessPort } from "../../framework/runtime/port";

const DEFINITION: ExtensionDefinition = { id: "pi-output-contract", displayName: "piOutputContract" };

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;

/** The process-scoped readings one binding supplies; the integration is the case's own. */
function portInputBase(): Omit<PiPortInput, "integration"> {
	const pi: PiExtensionApi = {
		on: () => () => {},
		registerCommand: () => {},
		appendEntry: () => {},
	};
	return {
		pi,
		definition: DEFINITION,
		positions: piSessionPositions(piSessionFileAnchors()),
		providerFacts: piProviderFacts(),
		keepSubscription: () => {},
	};
}

/** One process integration, with the members a port reads and no requirement bookkeeping. */
function integrationStub(): PiSubagentIntegration {
	return {
		attach: () => {},
		requireIn: () => {},
		releaseSession: () => {},
		releaseAll: () => {},
		settle: async () => ({ mode: "none" }),
		backgroundActivity: () => ({ state: "clear" }),
	};
}

/**
 * Compile-time only: this function is never called, and `tsc` checks the selected return types and
 * the rejected correlations. The union cases are parameters rather than `const`s on purpose: a
 * `const` initialized to one value is flow-narrowed, which would select a precise overload and stop
 * testing the unresolved-option output.
 */
function assertOutputSelections(
	optionalEntry: string | undefined,
	optionalIntegration: PiSubagentIntegration | undefined,
): void {
	const enabledPort = createPiPort({ ...portInputBase(), integration: integrationStub() });
	const absentPort = createPiPort({ ...portInputBase(), integration: undefined });
	const unionPort = createPiPort({ ...portInputBase(), integration: optionalIntegration });

	type _EnabledPort = Assert<Equal<typeof enabledPort, PiPortResult<PiPortWithSubagents>>>;
	type _AbsentPort = Assert<Equal<typeof absentPort, PiPortResult<PiPortWithoutSubagents>>>;
	type _UnionPort = Assert<
		Equal<typeof unionPort, PiPortResult<PiPortWithSubagents | PiPortWithoutSubagents>>
	>;

	const explicit = piAdapter(DEFINITION, { childEntry: "entrypoints/pi/model-cost.ts" });
	const omitted = piAdapter(DEFINITION);
	const explicitlyUndefined = piAdapter(DEFINITION, { childEntry: undefined });
	const uncertain = piAdapter(DEFINITION, { childEntry: optionalEntry });
	const assembly: PiAssembly = { childEntry: optionalEntry };
	const uncertainAssembly = piAdapter(DEFINITION, assembly);

	type _Explicit = Assert<Equal<typeof explicit, AdapterFactory<PiPortWithSubagents, PiExtensionFactory>>>;
	type _Omitted = Assert<Equal<typeof omitted, AdapterFactory<PiPortWithoutSubagents, PiExtensionFactory>>>;
	type _Undefined = Assert<
		Equal<typeof explicitlyUndefined, AdapterFactory<PiPortWithoutSubagents, PiExtensionFactory>>
	>;
	type _Uncertain = Assert<Equal<typeof uncertain, AdapterFactory<HarnessPort, PiExtensionFactory>>>;
	type _UncertainAssembly = Assert<
		Equal<typeof uncertainAssembly, AdapterFactory<HarnessPort, PiExtensionFactory>>
	>;

	// A stated integration's required member cannot be read as the absent shape, and the absent
	// shape cannot promise a member it does not construct.
	// @ts-expect-error an explicit child entry does not produce the absent output
	const notAbsent: AdapterFactory<PiPortWithoutSubagents, PiExtensionFactory> = explicit;
	// @ts-expect-error an omitted child entry does not produce the enabled output
	const notEnabled: AdapterFactory<PiPortWithSubagents, PiExtensionFactory> = omitted;
	// @ts-expect-error an explicitly undefined child entry does not produce the enabled output
	const undefinedNotEnabled: AdapterFactory<PiPortWithSubagents, PiExtensionFactory> = explicitlyUndefined;
	// @ts-expect-error a string | undefined entry keeps the uncertain output
	const uncertainNotEnabled: AdapterFactory<PiPortWithSubagents, PiExtensionFactory> = uncertain;
	// @ts-expect-error a string | undefined entry keeps the uncertain output
	const uncertainNotAbsent: AdapterFactory<PiPortWithoutSubagents, PiExtensionFactory> = uncertain;
	// @ts-expect-error a general assembly option keeps the uncertain output
	const assemblyNotEnabled: AdapterFactory<PiPortWithSubagents, PiExtensionFactory> = uncertainAssembly;
}

describe("the constructed pi port follows the integration it was assembled with", () => {
	test("a stated integration constructs the settle member", () => {
		const created = createPiPort({ ...portInputBase(), integration: integrationStub() });

		expect("subagentIntegration" in created.port).toBe(true);
		expect(typeof created.port.subagentIntegration).toBe("function");
	});

	test("an explicitly absent integration constructs no such member", () => {
		const created = createPiPort({ ...portInputBase(), integration: undefined });

		expect("subagentIntegration" in created.port).toBe(false);
		expect(created.port.subagentIntegration).toBeUndefined();
	});
});
