// A small language server for tests, spoken over stdio with its own framing so it checks the client's.
// Lines containing ERROR_MARK are errors, WARN_MARK warnings. FAKE_LSP_PULL=1 answers pulls instead
// of pushing; FAKE_LSP_CRASH=1 exits once a document opens (after writing FAKE_LSP_STDERR); FAKE_LSP_DELAY_MS delays the verdict.

let buffer = Buffer.alloc(0);
const pull = process.env.FAKE_LSP_PULL === "1";
const delay = Number(process.env.FAKE_LSP_DELAY_MS ?? 0);
const documents = new Map<string, string>();

function send(message: Record<string, unknown>): void {
	const body = JSON.stringify({ jsonrpc: "2.0", ...message });
	process.stdout.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
}

function diagnosticsOf(text: string) {
	const out: unknown[] = [];
	text.split("\n").forEach((line, index) => {
		for (const [mark, severity] of [
			["ERROR_MARK", 1],
			["WARN_MARK", 2],
		] as const) {
			const column = line.indexOf(mark);
			if (column < 0) continue;
			out.push({
				range: {
					start: { line: index, character: column },
					end: { line: index, character: column + mark.length },
				},
				severity,
				source: "fake",
				message: `${mark.toLowerCase()} on line ${index + 1}`,
			});
		}
	});
	return out;
}

function publish(uri: string, version: unknown): void {
	if (pull) return;
	const text = documents.get(uri) ?? "";
	setTimeout(
		() =>
			send({
				method: "textDocument/publishDiagnostics",
				params: { uri, version, diagnostics: diagnosticsOf(text) },
			}),
		delay,
	);
}

const place = (uri: string, line: number) => ({
	uri,
	range: { start: { line, character: 0 }, end: { line, character: 3 } },
});

interface Params {
	textDocument: { uri: string; version?: number; text: string };
	contentChanges: { text: string }[];
	position: { line: number; character: number };
	query: string;
	item: Record<string, unknown>;
}

function handle(message: { id?: number; method?: string; params: Params }): void {
	const { id, method, params } = message;
	const reply = (result: unknown) => id !== undefined && send({ id, result });
	switch (method) {
		case "initialize":
			return void reply({
				capabilities: {
					textDocumentSync: 1,
					hoverProvider: true,
					definitionProvider: true,
					referencesProvider: true,
					implementationProvider: true,
					documentSymbolProvider: true,
					workspaceSymbolProvider: true,
					callHierarchyProvider: true,
					...(pull
						? { diagnosticProvider: { interFileDependencies: false, workspaceDiagnostics: false } }
						: {}),
				},
			});
		case "textDocument/didOpen": {
			const doc = params.textDocument;
			documents.set(doc.uri, doc.text);
			if (process.env.FAKE_LSP_CRASH === "1") {
				if (process.env.FAKE_LSP_STDERR) process.stderr.write(`${process.env.FAKE_LSP_STDERR}\n`);
				process.exit(3);
			}
			return void publish(doc.uri, doc.version);
		}
		case "textDocument/didChange": {
			const doc = params.textDocument;
			documents.set(doc.uri, params.contentChanges[0]?.text ?? "");
			return void publish(doc.uri, doc.version);
		}
		case "textDocument/diagnostic":
			return void reply({
				kind: "full",
				items: diagnosticsOf(documents.get(params.textDocument.uri) ?? ""),
			});
		case "textDocument/hover":
			return void reply({
				contents: {
					kind: "markdown",
					value: `hover ${params.position.line}:${params.position.character}`,
				},
			});
		case "textDocument/definition":
			return void reply([place(params.textDocument.uri, 0)]);
		case "textDocument/references":
			return void reply([place(params.textDocument.uri, 0), place(params.textDocument.uri, 2)]);
		case "textDocument/implementation":
			return void reply([place(params.textDocument.uri, 1)]);
		case "textDocument/documentSymbol":
			return void reply([
				{
					name: "Thing",
					kind: 5,
					range: place(params.textDocument.uri, 0).range,
					selectionRange: place(params.textDocument.uri, 0).range,
					children: [
						{
							name: "run",
							kind: 6,
							range: place(params.textDocument.uri, 1).range,
							selectionRange: place(params.textDocument.uri, 1).range,
						},
					],
				},
			]);
		case "workspace/symbol":
			return void reply([
				{ name: `match ${params.query}`, kind: 12, location: place("file:///work/a.fake", 4) },
			]);
		case "textDocument/prepareCallHierarchy":
			return void reply([
				{
					name: "caller",
					kind: 12,
					uri: params.textDocument.uri,
					range: place("", 0).range,
					selectionRange: place("", 0).range,
				},
			]);
		case "callHierarchy/incomingCalls":
			return void reply([{ from: params.item, fromRanges: [] }]);
		case "callHierarchy/outgoingCalls":
			return void reply([{ to: { ...params.item, name: "callee" }, fromRanges: [] }]);
		case "shutdown":
			return void reply(null);
		case "exit":
			return void process.exit(0);
		default:
			if (id !== undefined) send({ id, error: { code: -32601, message: `unhandled ${method}` } });
	}
}

process.stdin.on("data", (chunk: Buffer) => {
	buffer = Buffer.concat([buffer, chunk]);
	for (;;) {
		const end = buffer.indexOf("\r\n\r\n");
		if (end < 0) return;
		const length = Number(/content-length:\s*(\d+)/i.exec(buffer.subarray(0, end).toString())?.[1]);
		if (buffer.length < end + 4 + length) return;
		const body = buffer.subarray(end + 4, end + 4 + length).toString();
		buffer = buffer.subarray(end + 4 + length);
		handle(JSON.parse(body));
	}
});
