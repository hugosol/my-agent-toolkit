/**
 * How the consumption document's diagnostics name a value that is not the one its schema requires.
 *
 * This is the extension's own small helper, beside the document that reads it. The diagnostics are
 * consumer-visible feedback, so their wording stays exactly what the extension has always stated;
 * owning the phrasing here keeps that business vocabulary out of the framework's configuration
 * loader and adds no framework public tool.
 */
export function describeValue(value: unknown): string {
	if (value === null) return "null";
	if (Array.isArray(value)) return "an array";
	switch (typeof value) {
		case "string":
			return `"${value}"`;
		case "number":
			return Number.isFinite(value) ? "a number" : "a non-finite number";
		case "object":
			return "a mapping";
		default:
			return String(value);
	}
}
