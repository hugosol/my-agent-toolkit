// Initialize Node text imports before loading the unchanged shared definition.
import "../../../framework/adapters/pi-text-imports";
import { piAdapter } from "../../../framework/adapters/pi";
import type { PiExtensionApi } from "../../../framework/adapters/pi";
import { CODEBASE_TOOLS } from "../definition";

const bindCodebaseTools = piAdapter(CODEBASE_TOOLS);

export default function codebaseTools(pi: PiExtensionApi): void {
	bindCodebaseTools(pi);
}
