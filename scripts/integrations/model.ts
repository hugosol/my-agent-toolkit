import type { HarnessPort } from "../../framework/runtime/port";

export type PortMember = keyof HarnessPort;
export type Requirement = "required" | "optional";
export interface SourceLocation { readonly file: string; readonly line: number; readonly column: number; }
export interface IntegrationDiagnostic extends SourceLocation {
	readonly code: string;
	readonly message: string;
	readonly suggestion: string;
}
export interface IntegrationContract {
	readonly id: string;
	readonly kind: "port" | "delivery" | "framework";
	/** Port member, delivery callback member, or framework semantic identifier. */
	readonly member: string;
	readonly delivery?: string;
	readonly requirement: Requirement;
	readonly origins: readonly SourceLocation[];
	readonly path: readonly string[];
}
export interface DemandResult {
	readonly extension: string;
	readonly files: readonly string[];
	readonly contracts: readonly IntegrationContract[];
	readonly diagnostics: readonly IntegrationDiagnostic[];
}
export interface AnalysisOptions { readonly root: string; readonly extension: string; }
export type SupplyStatus = "provided" | "unavailable" | "conditional" | "unresolved" | "missing";
export interface ContractSupply {
	readonly contractId: string;
	readonly status: SupplyStatus;
	readonly reason?: string;
	readonly implementation?: SourceLocation;
}
export type SessionFactsFieldStatus = "mapped" | "unavailable" | "missing" | "unresolved";
/** One canonical SessionFacts field and the bounded evidence found for it in the adapter mapping. */
export interface SessionFactsField extends SourceLocation {
	readonly field: string;
	readonly status: SessionFactsFieldStatus;
	readonly reason?: string;
}
/**
 * Separate field report for a `framework:session-facts` consumer. It exposes mapping completeness;
 * it does not change contract supply, generator handling or completion.
 */
export interface SessionFactsFieldReport {
	readonly mapping: "declared" | "missing" | "unresolved";
	readonly declaration?: SourceLocation;
	readonly fields: readonly SessionFactsField[];
	readonly reason?: string;
}
export interface SupplyResult {
	readonly adapter: string;
	readonly exists: boolean;
	readonly definition?: SourceLocation;
	readonly contextType?: string;
	readonly contextFile?: string;
	readonly supplies: readonly ContractSupply[];
	/** Present only when a `framework:session-facts` contract was demanded. */
	readonly sessionFacts?: SessionFactsFieldReport;
	readonly diagnostics: readonly IntegrationDiagnostic[];
}
export interface SupplyOptions {
	readonly root: string;
	readonly adapter: string;
	readonly contracts: readonly IntegrationContract[];
	/** Selected extension sources; supplied for assembly-specific output contracts, never executed. */
	readonly assemblyFiles?: readonly string[];
}
export interface GenerationOptions extends SupplyOptions {
	readonly supply: SupplyResult;
	/** Optional contracts are included only when explicitly requested. */
	readonly includeOptional?: boolean;
	/** Preview does not write any source. */
	readonly dryRun?: boolean;
}
export interface GeneratedFile { readonly file: string; readonly content: string; }
export interface GenerationResult {
	readonly adapter: string;
	readonly files: readonly GeneratedFile[];
	readonly generatedContracts: readonly string[];
	readonly diagnostics: readonly IntegrationDiagnostic[];
}
