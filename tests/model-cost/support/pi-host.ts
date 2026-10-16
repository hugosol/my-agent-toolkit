/**
 * One controlled pi surface: the native host a suite drives a pi binding through, as far as the
 * framework's pi adapter and this extension's own frontend read it.
 *
 * A real pi process is a child process with its own session manager, model registry and UI, and a
 * suite that reads a binding's behavior in-process states the same facts directly: the events a case
 * delivers, the context each session's binding publishes, the widget hand-overs the frontend made and
 * the colours a theme was asked for. Nothing here decides anything — it records what was registered
 * and hands a case's stated facts to it — so a case about the extension's reading of a fact is a case
 * about that reading rather than about this double's own synthesis.
 *
 * Two details are modelled because the host really has them: a session context a case has *spent*
 * throws on every read, exactly as pi's own contract states for a context belonging to a session the
 * host replaced or disposed; and `setWidget` reads what it was handed the way pi's own CLIs do — an
 * array of lines is the text form, a function is the component form, and nothing at all is the clear.
 * The theme hands every colour back as text it was given, recording the call, because what a case can
 * assert about a theme is which of its own colours the frontend asked for.
 */
import type {
	PiCommandRegistration,
	PiExtensionApi,
	PiExtensionContext,
	PiSessionShutdownReason,
	PiSessionStartReason,
	PiWidgetComponentFactory,
	PiWidgetTheme,
} from "../../../framework/adapters/pi";

/** One colour the frontend asked its host's theme for, as the theme recorded the call. */
export interface Paint {
	/** Which of the theme's two members was called. */
	readonly call: "fg" | "thinking";
	/** The colour token, or the thinking level whose colour was asked for. */
	readonly name: string;
	/** The text the colour was wrapped around. */
	readonly text: string;
}

/** One notice the extension published through the surface, with the severity it carried. */
export interface PublishedNotice {
	readonly level: string;
	readonly message: string;
}

/** One widget hand-over: the lines of the text form, or the factory of the component form. */
export interface HandOver {
	readonly lines: readonly string[] | undefined;
	readonly factory: PiWidgetComponentFactory | undefined;
}

/** One session as a controlled surface publishes it. */
export interface HostSession {
	readonly sessionId: string;
	/** The name the host reports for the session. */
	readonly name?: string;
	readonly provider: string;
	readonly model: string;
	/** The effective thinking level the session's own context reports. */
	readonly effort?: string;
	/** The run mode this session's context belongs to; absent models a host that publishes none. */
	readonly mode?: "tui" | "rpc" | "json" | "print";
	/** Whether this session has a UI; absent means it has one. */
	readonly hasUI?: boolean;
	/** The session's own context reading, as pi reports it; absent models a host that reports none. */
	readonly context?: { readonly tokens?: number | null; readonly contextWindow?: number };
}

/** One controlled pi surface, with everything a case observes through it. */
export interface ControlledPiSurface {
	readonly api: PiExtensionApi;
	/** The commands the adapter registered, by name. */
	readonly commands: ReadonlyMap<string, PiCommandRegistration>;
	/** Every widget hand-over made through this surface, in order. */
	handOvers(): readonly HandOver[];
	/** The last widget hand-over this surface was given. */
	last(): HandOver;
	/** The lines of the last hand-over in the text form, or nothing when it was cleared. */
	lines(): readonly string[] | undefined;
	/** The last component drawn at one width with this surface's theme, or nothing when none was handed. */
	drawn(width: number): readonly string[] | undefined;
	/** Every colour the theme was asked for, in call order. */
	paints(): readonly Paint[];
	/** Every notice the surface was handed, in call order: the extension's own feedback. */
	notices(): readonly PublishedNotice[];
	/** Delivers one native session start, exactly as pi reaches an extension's own handlers. */
	sessionStarts(session: HostSession, reason?: PiSessionStartReason): void;
	/** Delivers one native session end. */
	sessionEnds(session: HostSession, reason?: PiSessionShutdownReason): void;
	/** Delivers one agent-run initiation, which is the node the framework initializes at. */
	runInitiates(session: HostSession): Promise<void>;
	/** Delivers one whole settled Turn: the request, its response boundary and the finalized message. */
	turnSettles(session: HostSession, usage?: { readonly input: number; readonly output: number }): void;
	/** Delivers pi's own name-change fact for that session. */
	sessionRenames(session: HostSession, name: string | undefined): void;
	/** Runs one registered command the way the operator's own entry does. */
	command(args: string, session: HostSession): Promise<void>;
	/** Makes every context this surface publishes unreadable, as a session replacement does. */
	spend(): void;
}

export function controlledPiSurface(): ControlledPiSurface {
	const handlers = new Map<string, Array<(event: unknown, ctx: PiExtensionContext) => unknown>>();
	const commands = new Map<string, PiCommandRegistration>();
	const handOvers: HandOver[] = [];
	const paints: Paint[] = [];
	const notices: PublishedNotice[] = [];
	let spent = false;
	/** How many Turns this surface has settled, which is what makes each response id its own. */
	let turns = 0;
	const theme: PiWidgetTheme = {
		fg: (color, text) => {
			paints.push({ call: "fg", name: color, text });
			return text;
		},
		getThinkingBorderColor: level => text => {
			paints.push({ call: "thinking", name: level, text });
			return text;
		},
	};
	const api = {
		on(event: string, handler: (event: unknown, ctx: PiExtensionContext) => unknown): () => void {
			const list = handlers.get(event) ?? [];
			list.push(handler);
			handlers.set(event, list);
			return () => {
				const current = handlers.get(event) ?? [];
				const index = current.indexOf(handler);
				if (index >= 0) current.splice(index, 1);
			};
		},
		registerCommand(name: string, registration: PiCommandRegistration): void {
			commands.set(name, registration);
		},
		appendEntry(): void {},
	} as unknown as PiExtensionApi;
	const contextOf = (session: HostSession): PiExtensionContext => {
		const assert = (): void => {
			if (spent) throw new Error("This extension ctx is stale after session replacement or reload.");
		};
		return {
			sessionManager: {
				getSessionId: () => {
					assert();
					return session.sessionId;
				},
				getSessionName: () => session.name,
				getBranch: () => [],
			},
			get hasUI(): boolean {
				assert();
				return session.hasUI ?? true;
			},
			get model(): { readonly provider: string; readonly id: string } {
				assert();
				return { provider: session.provider, id: session.model };
			},
			ui: {
				notify: (message: string, level?: string) => {
					notices.push({ level: level ?? "info", message });
				},
				setWidget: (key: string, content: readonly string[] | PiWidgetComponentFactory | undefined) => {
					handOvers.push({
						lines: Array.isArray(content) ? content : undefined,
						factory: typeof content === "function" ? content : undefined,
					});
					void key;
				},
			},
			...(session.effort === undefined ? {} : { thinkingLevel: session.effort }),
			...(session.mode === undefined ? {} : { mode: session.mode }),
			...(session.context === undefined ? {} : { getContextUsage: () => session.context }),
			isIdle: () => true,
			hasPendingMessages: () => false,
		} as unknown as PiExtensionContext;
	};
	/**
	 * Delivers one native fact to every handler registered for it, exactly as pi reaches an extension's
	 * own handlers, and answers with what each of them returned: a handler the framework awaits — the
	 * run initiation's one-time initialization — is awaited by the case that delivers it.
	 */
	const deliver = (event: string, payload: unknown, session: HostSession): readonly unknown[] =>
		[...(handlers.get(event) ?? [])].map(handler => handler(payload, contextOf(session)));
	return {
		api,
		commands,
		handOvers: () => handOvers,
		last: () => handOvers[handOvers.length - 1] as HandOver,
		lines: () => (handOvers[handOvers.length - 1] as HandOver).lines,
		drawn(width) {
			const factory = (handOvers[handOvers.length - 1] as HandOver).factory;
			if (factory === undefined) return undefined;
			return factory(undefined, theme).render(width);
		},
		paints: () => paints,
		notices: () => notices,
		sessionStarts: (session, reason = "startup") => deliver("session_start", { type: "session_start", reason }, session),
		sessionEnds: (session, reason = "quit") => deliver("session_shutdown", { type: "session_shutdown", reason }, session),
		runInitiates: async session => {
			// The framework's one-time initialization runs on this node and waits for what it returns, so
			// a case that awaits this delivery has the document really loaded when it continues.
			await Promise.all(deliver("before_agent_start", { type: "before_agent_start", messageType: "user" }, session));
		},
		turnSettles: (session, usage = { input: 10, output: 10 }) => {
			turns += 1;
			deliver("before_provider_request", { type: "before_provider_request" }, session);
			deliver("after_provider_response", { type: "after_provider_response", status: 200, headers: {} }, session);
			deliver(
				"message_end",
				{
					type: "message_end",
					message: { role: "assistant", stopReason: "stop", responseId: `response-${turns}`, usage },
				},
				session,
			);
		},
		sessionRenames: (session, name) =>
			deliver("session_info_changed", { type: "session_info_changed", name }, session),
		async command(args, session) {
			const command = commands.get("budget");
			if (command === undefined) throw new Error("the assembly registered no /budget command");
			await command.handler(args, contextOf(session));
		},
		spend() {
			spent = true;
		},
	};
}
