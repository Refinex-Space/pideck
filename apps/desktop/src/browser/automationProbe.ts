import type { BrowserCommand, BrowserEngineResult, BrowserScope } from "@thinkrail/contracts";
import type { createBrowserEngine } from "./automation";

export async function runBrowserAutomationProbe(
	engine: ReturnType<typeof createBrowserEngine>,
	root: string,
	url: string,
	progress: (value: Record<string, unknown>) => void,
	pasteSystemImage: (viewId: number) => Promise<void>,
) {
	const scope: BrowserScope = {
		workspaceId: "native-automation",
		sessionId: "native-fixture",
		workspacePath: root,
	};
	const report: Record<string, unknown> = {};
	const created = await engine.workbench({ action: "new", workspaceId: scope.workspaceId });
	if (!created.tabId || created.viewId === undefined)
		throw new Error("Automation fixture could not create a tab");
	const tabId = created.tabId;
	const viewId = created.viewId;
	const execute = async (command: BrowserCommand): Promise<BrowserEngineResult> => {
		progress({ step: command.action });
		await engine.workbench({
			action: "activity",
			workspaceId: scope.workspaceId,
			tabId,
			active: true,
			method: command.action,
		});
		try {
			return await engine.execute(scope, { ...command, tabId }, viewId, AbortSignal.timeout(30000));
		} finally {
			await engine.workbench({
				action: "activity",
				workspaceId: scope.workspaceId,
				tabId,
				active: false,
			});
		}
	};
	const evaluate = async (script: string) => (await execute({ action: "evaluate", script })).data;
	const assert = (condition: unknown, message: string) => {
		if (!condition) throw new Error(message);
	};
	await execute({ action: "navigate", url });
	await execute({ action: "back" });
	assert(
		await evaluate(`() => location.href === ${JSON.stringify(url)}`),
		"Bootstrap leaked into agent history",
	);
	const snapshot = await execute({ action: "snapshot" });
	progress({ snapshot: snapshot.data });
	assert(
		JSON.stringify(snapshot).includes("Select this button") &&
			!JSON.stringify(snapshot).includes("fixture-secret"),
		"Snapshot exposed a password or missed the button",
	);
	await execute({
		action: "click",
		locator: { role: "button", name: "Select this button", exact: true },
	});
	assert(
		await evaluate("() => window.clicked === true && window.trustedClick === true"),
		"Locator click was not trusted",
	);
	await execute({ action: "fill", locator: { label: "Name", exact: true }, text: "自动操作" });
	await execute({ action: "press", locator: { selector: "#name" }, key: "End" });
	await execute({ action: "type", locator: { selector: "#name" }, text: " Pi" });
	await execute({ action: "check", locator: { selector: "#check" } });
	await execute({ action: "select", locator: { selector: "#select" }, values: ["two"] });
	await execute({
		action: "click",
		locator: { frames: ["#frame"], role: "button", name: "Frame button" },
	});
	await execute({ action: "click", locator: { selector: "#shadow-button" } });
	assert(
		await evaluate(
			"() => document.querySelector('#name').value === '自动操作 Pi' && document.querySelector('#check').checked && document.querySelector('#select').value === 'two' && window.frameClicked && window.shadowClicked",
		),
		"Form/frame/shadow operations failed",
	);
	report.domAutomation = true;
	const frame = (await evaluate(
		"() => document.querySelector('#frame').getBoundingClientRect().toJSON()",
	)) as { x: number; y: number };
	const inspected = (await execute({ action: "elementInfo", x: frame.x + 20, y: frame.y + 20 }))
		.data as { tagName: string; selector: { frameSelectors: string[] } };
	assert(
		inspected.tagName === "button" && inspected.selector.frameSelectors.includes("#frame"),
		"Point inspection did not enter the cross-origin frame",
	);
	report.crossOriginFrame = true;
	await execute({ action: "clipboardWrite", text: "virtual clipboard" });
	await execute({ action: "fill", locator: { selector: "#name" }, text: "" });
	await execute({ action: "paste", locator: { selector: "#name" } });
	assert(
		await evaluate("() => document.querySelector('#name').value === 'virtual clipboard'"),
		"Virtual clipboard failed",
	);
	await execute({ action: "viewport", viewport: { width: 640, height: 480 } });
	const screenshot = await execute({
		action: "screenshot",
		clip: { x: 0, y: 0, width: 200, height: 100 },
	});
	const png = Buffer.from(screenshot.image?.data ?? "", "base64");
	assert(
		png.readUInt32BE(16) === 200 && png.readUInt32BE(20) === 100,
		`Clipped screenshot dimensions differ: ${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`,
	);
	await engine.workbench({
		action: "activity",
		workspaceId: scope.workspaceId,
		tabId,
		method: "copy-fixture",
	});
	await execute({ action: "press", locator: { selector: "#name" }, key: "ControlOrMeta+A" });
	await execute({ action: "press", key: "ControlOrMeta+C" });
	assert(
		(await execute({ action: "clipboardRead" })).data === "virtual clipboard",
		"Agent copy did not update its private clipboard",
	);
	await execute({ action: "click", locator: { selector: "#paste" } });
	await pasteSystemImage(viewId);
	const pasteDeadline = Date.now() + 3000;
	while (!(await evaluate("() => !!window.pastedImage")) && Date.now() < pasteDeadline)
		await Bun.sleep(50);
	report.clipboard = await evaluate("() => window.pastedImage ?? null");
	progress({
		clipboard: report.clipboard,
		pasteTypes: await evaluate("() => window.pasteTypes ?? null"),
	});
	assert(
		await evaluate(
			"() => window.pastedImage?.type === 'image/png' && window.pastedImage.width === 640 && window.pastedImage.height === 480",
		),
		"Copy screenshot could not be pasted as an image",
	);
	await execute({
		action: "upload",
		locator: { selector: "#upload" },
		files: [new URL("upload.txt", `file://${root}/`).pathname],
	});
	assert(
		await evaluate("() => document.querySelector('#upload').files[0]?.name === 'upload.txt'"),
		"File upload failed",
	);
	const download = await execute({
		action: "download",
		trigger: { action: "click", locator: { selector: "#download" } },
	});
	assert(
		download.temporaryArtifact &&
			(await Bun.file(download.temporaryArtifact.temporaryPath).text()) === "fixture download",
		"Download bytes differ",
	);
	report.download = true;
	const media = await execute({ action: "downloadMedia", locator: { selector: "#media" } });
	assert(
		media.temporaryArtifact &&
			(await Bun.file(media.temporaryArtifact.temporaryPath).text()).includes("<svg"),
		"Inline media download failed",
	);
	await execute({
		action: "evaluate",
		script: "() => { console.log('fixture-loop-entered'); while(true) {} }",
		timeoutMs: 1000,
	}).then(
		() => {
			throw new Error("Unbounded evaluation did not abort");
		},
		() => {},
	);
	assert(
		JSON.stringify((await execute({ action: "console" })).data).includes("fixture-loop-entered"),
		"Evaluation timeout did not exercise guest execution",
	);
	assert((await evaluate("() => 42")) === 42, "Guest was not usable after evaluation cancellation");
	report.evaluationCancelled = true;
	await evaluate(
		"() => { document.querySelector('#paint').style.background='red'; document.querySelector('#name').value='before'; }",
	);
	await engine.workbench({
		action: "activate",
		workspaceId: scope.workspaceId,
		tabId,
		visible: false,
	});
	assert(
		(await engine.workbench({ action: "list", workspaceId: scope.workspaceId })).tabs.find(
			(tab) => tab.id === tabId,
		)?.visible === false,
		"Recording fixture was not hidden",
	);
	const started = await execute({
		action: "recordingStart",
		outputPath: "demo.webm",
		actions: [
			{ type: "wait", durationMs: 400 },
			{ type: "move", x: 60, y: 60, durationMs: 100 },
			{ type: "hover", selector: "#choose", durationMs: 100 },
			{ type: "click", selector: "#choose", delayAfterMs: 400 },
			{ type: "type", selector: "#name", text: "recorded 中文", delayAfterMs: 400 },
			{ type: "scroll", deltaY: 100, durationMs: 100 },
			{ type: "scrollTo", selector: "#choose", durationMs: 100 },
			{ type: "waitFor", selector: "#name", state: "visible", timeoutMs: 1000 },
			{
				type: "drag",
				path: [
					{ x: 320, y: 320 },
					{ x: 360, y: 340 },
					{ x: 380, y: 360 },
				],
				durationMs: 100,
			},
			{ type: "wheel", deltaY: 40, times: 2, intervalMs: 30 },
			{ type: "scrollTo", x: 0, y: 0, durationMs: 100 },
			{ type: "wait", durationMs: 400 },
		],
		fps: 15,
		maxDurationMs: 10000,
	});
	assert(started.recording, "Recording did not start");
	let status = started;
	const deadline = Date.now() + 25000;
	while (
		status.recording &&
		["preparing", "capturing", "finalizing"].includes(status.recording.phase) &&
		Date.now() < deadline
	) {
		await Bun.sleep(200);
		status = await execute({ action: "recordingStatus", recordingId: started.recording?.id });
	}
	assert(
		status.recording?.phase === "completed" && status.recording.artifact?.path === "demo.webm",
		`Recording failed: ${JSON.stringify(status.recording)}`,
	);
	report.recording = status.recording;
	assert(await evaluate("() => window.dragged === true"), "Recording drag did not reach the page");
	report.hiddenRecording = true;
	assert(
		await evaluate("() => document.querySelector('#name').value === 'recorded 中文'"),
		"Recording scenario did not type into the original page",
	);
	const cancelled = await execute({ action: "recordingStart", maxDurationMs: 10000 });
	let cancelling = cancelled;
	const capturingDeadline = Date.now() + 10000;
	while (cancelling.recording?.phase === "preparing" && Date.now() < capturingDeadline) {
		await Bun.sleep(100);
		cancelling = await execute({ action: "recordingStatus", recordingId: cancelled.recording?.id });
	}
	assert(
		cancelling.recording?.phase === "capturing",
		"Cancellation fixture never captured a frame",
	);
	const cancelledResult = await execute({
		action: "recordingCancel",
		recordingId: cancelled.recording?.id,
	});
	assert(cancelledResult.recording?.phase === "cancelled", "Recording cancellation failed");
	report.cancelled = true;
	await evaluate("() => window.close()").catch(() => {});
	await Bun.sleep(200);
	assert(
		!(await engine.workbench({ action: "list", workspaceId: scope.workspaceId })).tabs.some(
			(tab) => tab.id === tabId,
		),
		"window.close did not close its own tab",
	);
	const verifier = await engine.workbench({ action: "new", workspaceId: scope.workspaceId });
	if (!verifier.tabId || verifier.viewId === undefined)
		throw new Error("Video verification page unavailable");
	await engine.execute(
		scope,
		{ action: "navigate", tabId: verifier.tabId, url: `${url}verify` },
		verifier.viewId,
		AbortSignal.timeout(10000),
	);
	return { ...report, phase: "automation-complete" };
}
