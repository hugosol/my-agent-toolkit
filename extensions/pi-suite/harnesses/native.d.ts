/** Pi supplies this public export at extension load time; toolkit does not bundle a second host. */
declare module "@earendil-works/pi-coding-agent" {
	export function createCodemodeExtension(options: { mode: "on" | "only" }):
		(api: import("./pi").PiSuiteApi) => void | Promise<void>;
}
