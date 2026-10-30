type Pending = {
	resolve(value: Record<string, unknown>): void;
	reject(error: Error): void;
	timer: ReturnType<typeof setTimeout>;
};

export class BrowserCdp {
	private nextId = 0;
	private disconnected = false;
	private pending = new Map<number, Pending>();
	private listeners = new Set<(method: string, params: Record<string, unknown>) => void>();
	private constructor(private socket: WebSocket) {
		socket.addEventListener("message", (event) => {
			if (typeof event.data !== "string" || event.data.length > 32_000_000) return;
			let message: Record<string, unknown>;
			try {
				message = JSON.parse(event.data);
			} catch {
				return;
			}
			if (typeof message.id === "number") {
				const request = this.pending.get(message.id);
				if (!request) return;
				this.pending.delete(message.id);
				clearTimeout(request.timer);
				if (message.error) request.reject(new Error(JSON.stringify(message.error)));
				else request.resolve((message.result ?? {}) as Record<string, unknown>);
			} else if (typeof message.method === "string") {
				for (const listener of this.listeners)
					listener(message.method, (message.params ?? {}) as Record<string, unknown>);
			}
		});
		socket.addEventListener("close", () => {
			this.disconnect();
		});
		socket.addEventListener("error", () => this.rejectPending());
	}

	static async connect(url: string): Promise<BrowserCdp> {
		const socket = new WebSocket(url);
		const client = new BrowserCdp(socket);
		await new Promise<void>((resolve, reject) => {
			const timer = setTimeout(() => {
				socket.close();
				reject(new Error("Browser connection timed out"));
			}, 5000);
			socket.addEventListener(
				"open",
				() => {
					clearTimeout(timer);
					resolve();
				},
				{ once: true },
			);
			socket.addEventListener(
				"error",
				() => {
					clearTimeout(timer);
					reject(new Error("Browser connection failed"));
				},
				{ once: true },
			);
		});
		return client;
	}

	request(method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
		if (this.socket.readyState !== WebSocket.OPEN)
			return Promise.reject(new Error("Browser disconnected"));
		const id = ++this.nextId;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error(`Browser command timed out: ${method}`));
			}, 15000);
			this.pending.set(id, { resolve, reject, timer });
			this.socket.send(JSON.stringify({ id, method, params }));
		});
	}

	subscribe(listener: (method: string, params: Record<string, unknown>) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	close(): void {
		this.disconnect();
		this.socket.close();
	}
	private disconnect(): void {
		if (this.disconnected) return;
		this.disconnected = true;
		this.rejectPending();
		for (const listener of this.listeners) listener("disconnected", {});
		this.listeners.clear();
	}

	private rejectPending(): void {
		for (const request of this.pending.values()) {
			clearTimeout(request.timer);
			request.reject(new Error("Browser disconnected"));
		}
		this.pending.clear();
	}
}
