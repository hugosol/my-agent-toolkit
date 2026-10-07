/**
 * Harness fixture: the real extension assembled with a support set the running agent
 * runtime is not part of.
 *
 * It is the same assembly `entrypoints/omp/codebase-tools.ts` deploys — the real
 * definition through the framework's real OMP adapter — with only the declared support
 * set changed, so a controlled run exercises the unlisted-version admission path (one
 * notice per main session, then continue) without modifying the agent runtime or its
 * installed version. Loaded explicitly through `-e`; it never touches host configuration.
 */
import { CODEBASE_TOOLS } from "../../../../extensions/codebase-tools/definition";
import { ompAdapter } from "../../../../framework/adapters/omp";

export default ompAdapter(CODEBASE_TOOLS, { supportedVersions: ["0.0.0-unlisted"] });
