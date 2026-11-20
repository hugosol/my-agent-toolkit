import { fileURLToPath } from "node:url";
import { ompAdapter } from "../adapters/omp";
import { PSTACK_MODE } from "../extensions/pstack/definition";

// Loaded explicitly by pstack, not by the regular OMP extension directories.
export default ompAdapter(PSTACK_MODE, {
	startupPolicy: fileURLToPath(new URL("../entrypoints/startup/auto.yaml", import.meta.url)),
});
