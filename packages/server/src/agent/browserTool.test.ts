import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InMemoryCredentialStore } from "@earendil-works/pi-ai";
import {
	createFauxCore,
	fauxAssistantMessage,
	fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";
import {
	type AgentSessionEvent,
	createAgentSession,
	DefaultResourceLoader,
	ModelRuntime,
	SessionManager,
	SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { browserExtension, createBrowserTool, setBrowserToolHost } from "./browserTool";

test("provider-facing locators expose their object shape instead of an untyped reference", () => {
	expect(Reflect.get(createBrowserTool().parameters, "properties")).toMatchObject({
		locator: {
			type: "object",
			properties: {
				selector: { type: "string" },
				scope: { type: "object", $ref: "#/$defs/locator" },
			},
		},
		trigger: { type: "object", $ref: "#/$defs/command" },
	});
});

test("the real Pi extension dispatches typed browser calls with its own session identity and settles recordings", async () => {
	const cwd = mkdtempSync(join(tmpdir(), "pideck-pi-browser-"));
	const manager = SessionManager.inMemory(cwd);
	const calls: string[] = [];
	let settled = false;
	setBrowserToolHost({
		async executeSession(id, command) {
			expect(id).toBe(manager.getSessionId());
			calls.push(command.action);
			if (command.action === "click")
				expect(command.locator).toEqual({
					scope: { selector: "main" },
					role: "button",
					name: { source: "Submit", flags: "i" },
				});
			return { data: { tabId: "fixture-tab", action: command.action } };
		},
		async settled(id) {
			expect(id).toBe(manager.getSessionId());
			settled = true;
		},
		async releaseSession() {},
	});
	const model = {
		id: "browser-probe",
		name: "Browser probe",
		reasoning: false,
		input: ["text"] as "text"[],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 100000,
		maxTokens: 100,
	};
	const faux = createFauxCore({
		provider: "browser-probe",
		api: "browser-probe",
		models: [model],
		tokensPerSecond: 100000,
	});
	const runtime = await ModelRuntime.create({
		credentials: new InMemoryCredentialStore(),
		modelsPath: null,
		allowModelNetwork: false,
	});
	runtime.registerProvider("browser-probe", {
		api: faux.api,
		baseUrl: "http://faux.local",
		apiKey: "faux",
		streamSimple: faux.streamSimple,
		models: [{ ...model, api: faux.api }],
	});
	faux.setResponses([
		fauxAssistantMessage(fauxToolCall("browser", { action: "help" })),
		fauxAssistantMessage(
			fauxToolCall("browser", { action: "newTab", url: "http://localhost:3000" }),
		),
		fauxAssistantMessage(fauxToolCall("browser", { action: "snapshot", tabId: "fixture-tab" })),
		fauxAssistantMessage(
			fauxToolCall("browser", {
				action: "click",
				tabId: "fixture-tab",
				locator: {
					scope: { selector: "main" },
					role: "button",
					name: { source: "Submit", flags: "i" },
				},
			}),
		),
		fauxAssistantMessage(
			fauxToolCall("browser", {
				action: "recordingStart",
				tabId: "fixture-tab",
				actions: [{ type: "wait", durationMs: 500 }],
			}),
		),
		fauxAssistantMessage(fauxToolCall("browser", { action: "finalize", keep: ["fixture-tab"] })),
		fauxAssistantMessage("Done"),
	]);
	const settingsManager = SettingsManager.inMemory();
	const loader = new DefaultResourceLoader({
		cwd,
		agentDir: cwd,
		settingsManager,
		noExtensions: true,
		noSkills: true,
		noPromptTemplates: true,
		extensionFactories: [browserExtension],
	});
	await loader.reload();
	expect(loader.getExtensions().errors).toEqual([]);
	expect(
		loader.getExtensions().extensions.flatMap((extension) => [...extension.tools.keys()]),
	).toContain("browser");
	const { session } = await createAgentSession({
		cwd,
		agentDir: cwd,
		model: faux.getModel(),
		modelRuntime: runtime,
		settingsManager,
		resourceLoader: loader,
		sessionManager: manager,
	});
	const events: AgentSessionEvent[] = [];
	const unsubscribe = session.subscribe((event) => events.push(event));
	try {
		await session.prompt("Use the browser and record the fixture.");
		expect(
			events.flatMap((event) =>
				event.type === "tool_execution_end" && event.isError ? [event.result] : [],
			),
		).toEqual([]);
		expect(calls).toEqual(["newTab", "snapshot", "click", "recordingStart", "finalize"]);
		expect(
			events
				.filter((event) => event.type === "tool_execution_end")
				.every((event) => !event.isError),
		).toBe(true);
		expect(settled).toBe(true);
		expect(events.at(-1)?.type).toBe("agent_settled");
	} finally {
		unsubscribe();
		session.dispose();
		setBrowserToolHost(null);
		rmSync(cwd, { recursive: true, force: true });
	}
});
