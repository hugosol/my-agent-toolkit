/**
 * The Command capability's canonical extension-facing entry.
 *
 * One entry, two groups organized in its public `details/` files: what an extension declares
 * (`details/definition.ts`) and what its assembly implements, what a handler receives and the
 * directive it reads (`details/implementation.ts`). The framework's invocation construction,
 * argument parsing, declaration validation, help tooling and the unrecognized-path directive
 * vocabulary stay internal; an extension reads the delivery and the parsed directive it is handed
 * and never builds either.
 */

// The declaration group: the closed control-kind union and each kind's plain-data declaration.
export type {
	CommandActionsDeclaration,
	CommandDeclaration,
	CommandDirectedDeclaration,
	CommandToggleDeclaration,
	ControlKind,
} from "./details/definition";

// The implementation and delivery group: what an assembly injects and what a handler receives.
export type {
	ActionsCommandImplementation,
	ActionDelivery,
	CanAcceptInput,
	CommandAction,
	CommandDelivery,
	CommandImplementation,
	CommandImplementations,
	DirectedCommandImplementation,
	RecognizedDirective,
} from "./details/implementation";
