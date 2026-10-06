// Host assembly for alpha: imports shared logic (TS) and a Markdown resource, both
// outside the discovery root, plus a bare third-party dependency (host dep tree).
import { isRecord } from "@oh-my-pi/pi-utils";
import { ALPHA_LABEL } from "../logic";
import initText from "../prompts/init.md" with { type: "text" };

export function createAlphaFactory() {
	// Prove bare-specifier dependency resolution succeeded (not just text import).
	if (!isRecord({ probe: true })) throw new Error("dependency resolution failed");
	return (pi: { setLabel(label: string): void; registerCommand(name: string, command: unknown): void }) => {
		pi.setLabel(ALPHA_LABEL);
		pi.registerCommand("alpha-cmd", {
			description: initText.trim(),
			handler: async () => {},
		});
	};
}
