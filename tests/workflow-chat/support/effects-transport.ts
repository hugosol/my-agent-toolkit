import { createServer } from "node:http";
import type { Socket } from "node:net";

interface Deferred<T> {
	readonly promise: Promise<T>;
	resolve(value: T): void;
	reject(reason: unknown): void;
}

interface HeldEffect {
	readonly path: string;
	readonly accepted: Deferred<{ status: number; body: unknown }>;
	readonly closed: Deferred<void>;
	readonly release: Deferred<void>;
}

/** HTTP boundary observer: send to the REAL backend once, capture its completed result,
 * then withhold only that response from OMP. It does not supply backend state or effects.
 */
export async function effectsTransport() {
	let endpoint: string | undefined;
	let held: HeldEffect | undefined;
	const gates: HeldEffect[] = [];
	const calls: { path: string; body: unknown }[] = [];
	const sockets = new Set<Socket>();
	function hold(path: string) {
		return { path, accepted: Promise.withResolvers<{ status: number; body: unknown }>(), closed: Promise.withResolvers<void>(), release: Promise.withResolvers<void>() };
	}
	const server = createServer(async (incoming, response) => {
		try {
			const chunks: Buffer[] = [];
			for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
			const body = Buffer.concat(chunks).toString();
			const path = incoming.url!;
			calls.push({ path, body: JSON.parse(body) });
			const gate = held?.path === path ? held : undefined;
			if (gate) { held = undefined; response.once("close", gate.closed.resolve); }
			const upstream = await fetch(`${endpoint}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body });
			const text = await upstream.text();
			if (gate) {
				gate.accepted.resolve({ status: upstream.status, body: JSON.parse(text) });
				await gate.release.promise;
			}
			if (!response.destroyed) { response.writeHead(upstream.status, { "content-type": "application/json" }); response.end(text); }
		} catch (error) {
			for (const gate of gates) gate.accepted.reject(error);
			response.destroy(error instanceof Error ? error : new Error(String(error)));
		}
	});
	server.on("connection", socket => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); });
	const ready = Promise.withResolvers<void>(); server.listen(0, "127.0.0.1", ready.resolve); await ready.promise;
	const address = server.address(); if (!address || typeof address === "string") throw new Error("No effects observer port");
	return {
		endpoint: `http://127.0.0.1:${address.port}`, calls,
		connect(target: string) { endpoint = target; },
		hold(path: string) { const gate = hold(path); gates.push(gate); held = gate; return gate; },
		async close() {
			for (const gate of gates) gate.release.resolve();
			for (const socket of sockets) socket.destroy();
			const closed = Promise.withResolvers<void>(); server.close(error => error ? closed.reject(error) : closed.resolve()); await closed.promise;
		},
	};
}
