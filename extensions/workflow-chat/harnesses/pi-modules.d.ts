/** Pi's loader resolves this host dependency, including in the bundled distribution. */
declare module "@earendil-works/pi-ai" {
	export const Type: {
		Any(options?: { description?: string }): unknown;
		Literal(value: string): unknown;
		Union(members: unknown[]): unknown;
		Object(properties: Readonly<Record<string, unknown>>, options: { additionalProperties: boolean }): unknown;
	};
}
