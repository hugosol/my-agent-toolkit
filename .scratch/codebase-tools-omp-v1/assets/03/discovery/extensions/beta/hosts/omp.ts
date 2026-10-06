// Host assembly for beta: TS + Markdown imports outside the discovery root.
import reminderText from "../prompts/reminder.md" with { type: "text" };

export function createBetaFactory() {
	return (pi: { setLabel(label: string): void; registerCommand(name: string, command: unknown): void }) => {
		pi.setLabel("probe-beta");
		pi.registerCommand("beta-cmd", {
			description: reminderText.trim(),
			handler: async () => {},
		});
	};
}
