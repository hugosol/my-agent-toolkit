// Decoy: a pi-side entrypoint that must NOT be selected when OMP scans entrypoints/omp.
export default function gamma(pi: { setLabel(label: string): void; registerCommand(name: string, command: unknown): void }) {
	pi.setLabel("probe-gamma");
	pi.registerCommand("gamma-cmd", { description: "gamma", handler: async () => {} });
}
