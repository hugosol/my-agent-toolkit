/**
 * Bare package supplied by OMP's extension loader from its own package scope.
 * Only the surface consumed by this repository is declared; this does not install a host
 * package or change the support baseline in framework/docs/harness-support.md.
 */
declare module "@oh-my-pi/pi-utils" {
	export namespace logger {
		function debug(message: string, context?: Record<string, unknown>): void;
	}
}
