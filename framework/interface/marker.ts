/**
 * The Marker capability's canonical extension-facing declaration.
 *
 * An extension contributes only the text of its own line. The one process-wide area, its
 * ordering, the viewed-session projection, its publication triggers and the transport an
 * adapter renders through stay internal: an extension affects its line through the same
 * managed State operations it uses everywhere else, never by managing the area.
 */
/** The extension's status-marker text; placement, ordering and lifecycle are framework-owned. */
export interface MarkerDeclaration {
	readonly text: string;
}
