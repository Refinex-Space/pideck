import type { Readable, Writable } from "node:stream";

export class JsonRpcError extends Error {
	constructor(
		message: string,
		readonly code: number,
		readonly data?: unknown,
	) {
		super(message);
		this.name = "JsonRpcError";
	}
}

const METHOD_NOT_FOUND = -32601;
const INTERNAL_ERROR = -32603;
const DEFAULT_TIMEOUT_MS = 30_000;
const HEADER_END = Buffer.from("\r\n\r\n");

export interface JsonRpcConnection {
	request<T = unknown>(method: string, params: unknown, timeoutMs?: number): Promise<T>;
	notify(method: string, params?: unknown): void;
	/** Answers a request the server sends us; an unhandled method is reported as not found. */
	onRequest(method: string, handler: (params: unknown) => unknown): void;
	onNotification(method: string, handler: (params: unknown) => void): void;
	/** Fails every request still waiting and stops reading. */
	dispose(reason?: Error): void;
	readonly closed: boolean;
}

interface Pending {
	method: string;
	resolve: (value: unknown) => void;
	reject: (error: Error) => void;
	timer: ReturnType<typeof setTimeout>;
}

function record(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function contentLength(header: string): number | null {
	for (const line of header.split("\r\n")) {
		const match = /^content-length:\s*(\d+)\s*$/i.exec(line);
		if (match?.[1]) return Number(match[1]);
	}
	return null;
}

/**
 * LSP's wire format: JSON-RPC 2.0 messages framed by a `Content-Length` header over a byte stream. It
 * is the whole transport, so a language server needs no client library on this side.
 */
export function createJsonRpcConnection(input: Readable, output: Writable): JsonRpcConnection {
	const pending = new Map<number, Pending>();
	const requests = new Map<string, (params: unknown) => unknown>();
	const notifications = new Map<string, (params: unknown) => void>();
	let buffer: Buffer = Buffer.alloc(0);
	let nextId = 1;
	let closed = false;

	const send = (message: Record<string, unknown>): void => {
		if (closed) return;
		const body = JSON.stringify({ jsonrpc: "2.0", ...message });
		try {
			output.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
		} catch {
			closed = true;
		}
	};

	const answer = async (id: unknown, method: string, params: unknown): Promise<void> => {
		const handler = requests.get(method);
		if (!handler) {
			send({ id, error: { code: METHOD_NOT_FOUND, message: `Method not found: ${method}` } });
			return;
		}
		try {
			send({ id, result: (await handler(params)) ?? null });
		} catch (error) {
			send({
				id,
				error: { code: INTERNAL_ERROR, message: error instanceof Error ? error.message : "failed" },
			});
		}
	};

	const dispatch = (message: Record<string, unknown>): void => {
		const method = typeof message.method === "string" ? message.method : null;
		const id = message.id;
		if (method !== null && id !== undefined) {
			void answer(id, method, message.params);
			return;
		}
		if (method !== null) {
			notifications.get(method)?.(message.params);
			return;
		}
		if (typeof id !== "number") return;
		const waiting = pending.get(id);
		if (!waiting) return;
		pending.delete(id);
		clearTimeout(waiting.timer);
		const failure = record(message.error);
		if (failure) {
			waiting.reject(
				new JsonRpcError(
					typeof failure.message === "string" ? failure.message : `${waiting.method} failed`,
					typeof failure.code === "number" ? failure.code : INTERNAL_ERROR,
					failure.data,
				),
			);
		} else waiting.resolve(message.result ?? null);
	};

	const read = (chunk: Buffer | string): void => {
		buffer = Buffer.concat([buffer, typeof chunk === "string" ? Buffer.from(chunk) : chunk]);
		for (;;) {
			const end = buffer.indexOf(HEADER_END);
			if (end < 0) return;
			const length = contentLength(buffer.subarray(0, end).toString("ascii"));
			if (length === null) {
				buffer = buffer.subarray(end + HEADER_END.length);
				continue;
			}
			const start = end + HEADER_END.length;
			if (buffer.length < start + length) return;
			const body = buffer.subarray(start, start + length).toString("utf8");
			buffer = buffer.subarray(start + length);
			try {
				const message = record(JSON.parse(body));
				if (message) dispatch(message);
			} catch {}
		}
	};

	input.on("data", read);
	input.on("error", () => {});
	output.on("error", () => {});

	return {
		request<T>(method: string, params: unknown, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
			if (closed) return Promise.reject(new Error("The language server connection is closed"));
			const id = nextId++;
			return new Promise<T>((resolve, reject) => {
				const timer = setTimeout(() => {
					pending.delete(id);
					reject(new Error(`The language server did not answer ${method} in time`));
				}, timeoutMs);
				pending.set(id, { method, resolve: (value) => resolve(value as T), reject, timer });
				send({ id, method, params });
			});
		},
		notify(method, params) {
			send({ method, ...(params === undefined ? {} : { params }) });
		},
		onRequest(method, handler) {
			requests.set(method, handler);
		},
		onNotification(method, handler) {
			notifications.set(method, handler);
		},
		dispose(reason = new Error("The language server connection is closed")) {
			if (closed && pending.size === 0) return;
			closed = true;
			input.off("data", read);
			for (const waiting of pending.values()) {
				clearTimeout(waiting.timer);
				waiting.reject(reason);
			}
			pending.clear();
		},
		get closed() {
			return closed;
		},
	};
}
