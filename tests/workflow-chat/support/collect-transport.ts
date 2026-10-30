import { connect, createServer, type Socket } from "node:net";

export interface CollectConnection {
	readonly head: string;
	readonly bodyBytes: number;
	readonly clientClosed: Promise<void>;
	readonly backendEnded: Promise<void>;
	readonly events: { event: string; elapsedMs: number }[];
}

/** Transparent TCP forwarding: real OMP and backend keep their HTTP implementation.
 * On client EOF forward FIN (not destroy) and observe the backend's independent EOF.
 * No response, timeout, cancellation or business state is supplied by this observer.
 */
export async function collectTransport(endpoint: string) {
	const backend = new URL(endpoint);
	const calls: { path: string; body: Record<string, unknown> }[] = [];
	const sockets = new Set<Socket>();
	const waiters: ((connection: CollectConnection) => void)[] = [];
	const server = createServer({ allowHalfOpen: true }, client => {
		const upstream = connect({ host: backend.hostname, port: Number(backend.port), allowHalfOpen: true });
		for (const socket of [client, upstream]) { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); }
		const start = performance.now();
		const events: CollectConnection["events"] = [];
		const record = (event: string) => events.push({ event, elapsedMs: Math.round(performance.now() - start) });
		const closed = Promise.withResolvers<void>();
		const ended = Promise.withResolvers<void>();
		let input = Buffer.alloc(0);
		let output = Buffer.alloc(0);
		let head = "";
		let bodyBytes = 0;
		let path: string | undefined;
		let notified = false;
		let headForwarded = false;
		const connection: CollectConnection = { get head() { return head; }, get bodyBytes() { return bodyBytes; }, clientClosed: closed.promise, backendEnded: ended.promise, events };
		const notify = () => {
			if (!notified && headForwarded && path === "/api/workflow/manager/collect") {
				notified = true;
				const waiter = waiters.shift();
				if (waiter) waiter(connection);
			}
		};
		client.on("data", chunk => {
			upstream.write(chunk);
			if (path) return;
			input = Buffer.concat([input, typeof chunk === "string" ? Buffer.from(chunk) : chunk]);
			const boundary = input.indexOf("\r\n\r\n");
			if (boundary < 0) return;
			const headers = input.subarray(0, boundary).toString();
			const length = Number(headers.match(/content-length:\s*(\d+)/i)?.[1] ?? 0);
			if (input.length < boundary + 4 + length) return;
			path = headers.split(" ")[1]!;
			calls.push({ path, body: JSON.parse(input.subarray(boundary + 4, boundary + 4 + length).toString()) });
			input = Buffer.alloc(0);
			notify();
		});
		upstream.on("data", chunk => {
			let completesHead = false;
			if (!head) {
				output = Buffer.concat([output, typeof chunk === "string" ? Buffer.from(chunk) : chunk]);
				const boundary = output.indexOf("\r\n\r\n");
				if (boundary >= 0) {
					head = output.subarray(0, boundary).toString();
					bodyBytes = output.length - boundary - 4;
					output = Buffer.alloc(0);
					record("backend-headers");
					completesHead = true;
				}
			} else bodyBytes += chunk.length;
			if (!client.destroyed) client.write(chunk, () => {
				if (completesHead) { headForwarded = true; record("headers-forwarded"); notify(); }
			});
		});
		client.on("end", () => { record("client-fin"); closed.resolve(); upstream.end(); });
		client.on("error", () => { record("client-error"); closed.resolve(); upstream.end(); });
		upstream.on("end", () => { record("backend-fin"); ended.resolve(); client.end(); upstream.destroy(); });
		upstream.on("error", error => { record(`backend-error:${"code" in error ? error.code : error.message}`); client.destroy(); upstream.destroy(); });
	});
	const ready = Promise.withResolvers<void>();
	server.listen(0, "127.0.0.1", ready.resolve);
	await ready.promise;
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("No TCP observer port");
	return {
		endpoint: `http://127.0.0.1:${address.port}`, calls,
		nextCollect() {
			const waiting = Promise.withResolvers<CollectConnection>();
			waiters.push(waiting.resolve);
			return waiting.promise;
		},
		async close() {
			for (const socket of sockets) socket.destroy();
			const closed = Promise.withResolvers<void>();
			server.close(error => error ? closed.reject(error) : closed.resolve());
			await closed.promise;
		},
	};
}
