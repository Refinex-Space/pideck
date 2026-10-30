import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { homedir, tmpdir, userInfo } from "node:os";
import { dirname, join, relative } from "node:path";
import { chromium } from "@playwright/test";
import { locateDesktopLauncher } from "@thinkrail/artifact-tests";
import { prepareBrowserLiveProbe, runBrowserLiveProbe } from "./browser-live-fixture";
import {
	browserFixtureEnvironment,
	prepareBrowserPiProbe,
	runBrowserPiProbe,
} from "./browser-pi-fixture";
import { holdE2eIdleSleep } from "./idleSleep";

await holdE2eIdleSleep();
const closeRegression = process.argv.includes("--close");
const automation = process.argv.includes("--automation");
const live = process.argv.includes("--live");
const liveAgentDir = process.argv[process.argv.indexOf("--agent-dir") + 1];
if (live && (!automation || !process.argv.includes("--agent-dir") || !liveAgentDir))
	throw new Error(
		"Live validation requires --automation --live --agent-dir after explicit credential authorization",
	);
const root = mkdtempSync(join(tmpdir(), "pideck-browser-native-"));
const source = locateDesktopLauncher();
const bundle =
	process.platform === "darwin" ? dirname(dirname(dirname(source))) : dirname(dirname(source));
const copy = join(
	root,
	process.platform === "darwin" ? "PiDeck-browser-test.app" : "PiDeck-browser-test",
);
cpSync(bundle, copy, { recursive: true });
const resources = join(copy, process.platform === "darwin" ? "Contents" : "", "Resources");
const metadata = JSON.parse(readFileSync(join(resources, "version.json"), "utf8"));
metadata.identifier = `space.refinex.pideck.browser-test-${Date.now()}`;
writeFileSync(join(resources, "version.json"), JSON.stringify(metadata));
const reportDirectory = join(
	import.meta.dir,
	"..",
	"apps",
	"desktop",
	"artifacts",
	"browser-native",
);
mkdirSync(reportDirectory, { recursive: true });
const report = join(root, "report.json");
const ready = join(root, "ready.json");
const control = join(root, "control");
mkdirSync(join(root, "data"), { recursive: true });
writeFileSync(join(root, "upload.txt"), "fixture upload");
writeFileSync(
	join(root, "data", "config.json"),
	JSON.stringify({ analyticsEnabled: false, analyticsConsentConfirmed: true }),
);
const downloadFilename = `pideck-browser-fixture-${crypto.randomUUID()}.txt`;
const fixture = Bun.serve({
	hostname: "127.0.0.1",
	port: 0,
	fetch(request) {
		if (new URL(request.url).pathname === "/frame")
			return new Response(
				`<button onclick="parent.postMessage({frameClicked:true}, '*')">Frame button</button>`,
				{ headers: { "Content-Type": "text/html" } },
			);
		if (new URL(request.url).pathname === "/video")
			return new Response(Bun.file(join(root, "demo.webm")), {
				headers: { "Content-Type": "video/webm" },
			});
		if (new URL(request.url).pathname === "/download")
			return new Response("fixture download", {
				headers: {
					"Content-Disposition": `attachment; filename="${downloadFilename}"`,
					"Content-Type": "text/plain",
				},
			});
		if (automation)
			return new Response(
				`<!doctype html><title>PiDeck automation fixture</title><style>body{font:16px system-ui;background:white}button{padding:10px}#paint{position:fixed;left:500px;top:80px;width:50px;height:50px;background:red;pointer-events:none}#paste{border:1px solid;width:200px;height:40px}iframe{width:200px;height:50px}main{height:1200px}</style><main><h1>Automation fixture</h1><button id="choose" onclick="window.clicked=true;window.trustedClick=event.isTrusted;document.querySelector('#paint').style.background='blue'">Select this button</button><div><label>Name<input id="name"></label><input type="password" value="fixture-secret"></div><input id="check" type="checkbox"><select id="select"><option value="one">One</option><option value="two">Two</option></select><div id="paste" contenteditable="true">Paste image here</div><input id="upload" type="file"><a id="download" href="/download" download="${downloadFilename}">Download</a><div><iframe id="frame" src="http://localhost:${new URL(request.url).port}/frame"></iframe></div><div id="shadow"></div></main><div id="paint"></div><img id="media" style="position:fixed;left:560px;top:80px;width:32px;height:32px" src="data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='32'%20height='32'%3E%3Crect%20width='32'%20height='32'%20fill='blue'/%3E%3C/svg%3E"><div id="drag" style="position:fixed;left:300px;top:300px;width:40px;height:40px;background:green" onpointerdown="this.setPointerCapture(event.pointerId)" onpointermove="if(event.buttons)window.dragged=true"></div><script>addEventListener('message',event=>{if(event.origin==='http://localhost:${new URL(request.url).port}' && event.data?.frameClicked)window.frameClicked=true});const shadow=document.querySelector('#shadow').attachShadow({mode:'open'});shadow.innerHTML='<button id="shadow-button">Shadow button</button>';shadow.querySelector('button').onclick=()=>window.shadowClicked=true;document.querySelector('#paste').addEventListener('paste',async event=>{window.pasteTypes=[...event.clipboardData.types];const file=event.clipboardData.files[0];if(file){const image=await createImageBitmap(file);window.pastedImage={type:file.type,width:image.width,height:image.height};event.preventDefault()}});</script>`,
				{ headers: { "Content-Type": "text/html" } },
			);
		return new Response(
			'<!doctype html><title>PiDeck browser fixture</title><style>body{font:18px system-ui;background:#f5f5f5}button{padding:20px}main{border:8px solid #123456;min-height:1000px}</style><main><h1>Native browser fixture</h1><button id="choose" onclick="window.clicked=true">Select this button</button><input type="password" value="fixture-secret"><a href="/next">Next page</a></main><div data-corner style="position:fixed;left:0;top:0;width:16px;height:16px;background:rgb(255,0,0);pointer-events:none"></div><div data-corner style="position:fixed;right:0;top:0;width:16px;height:16px;background:rgb(0,255,0);pointer-events:none"></div><div data-corner style="position:fixed;left:0;bottom:0;width:16px;height:16px;background:rgb(0,0,255);pointer-events:none"></div><div data-corner style="position:fixed;right:0;bottom:0;width:16px;height:16px;background:rgb(255,255,0);pointer-events:none"></div>',
			{ headers: { "Content-Type": "text/html" } },
		);
	},
});
const environment: Record<string, string> = {};
for (const key of ["PATH", "LANG", "TMPDIR", "SystemRoot", "WINDIR", "DISPLAY", "XAUTHORITY"]) {
	const value = process.env[key];
	if (value) environment[key] = value;
}
Object.assign(environment, {
	...browserFixtureEnvironment(root),
	THINKRAIL_DATA_DIR: join(root, "data"),
	PI_CODING_AGENT_DIR: join(root, "agent"),
	THINKRAIL_DESKTOP_USER_DATA: join(root, "desktop"),
	THINKRAIL_DESKTOP_READY_FILE: ready,
	THINKRAIL_DESKTOP_CONTROL_FILE: control,
	THINKRAIL_DESKTOP_BROWSER_PROBE_FILE: report,
	THINKRAIL_DESKTOP_BROWSER_PROBE_URL: `http://127.0.0.1:${fixture.port}/`,
	THINKRAIL_DESKTOP_BROWSER_PROBE_MODE: automation
		? "automation"
		: closeRegression
			? "close"
			: "browser",
	THINKRAIL_DESKTOP_HIDDEN: "0",
});
if (automation) prepareBrowserPiProbe(root, `http://127.0.0.1:${fixture.port}/`, environment);
let verifySource: (() => boolean) | undefined;
if (live && liveAgentDir) {
	try {
		const selected = prepareBrowserLiveProbe(
			root,
			liveAgentDir,
			`http://127.0.0.1:${fixture.port}/`,
		);
		Object.assign(environment, selected.environment);
		verifySource = selected.sourceUnchanged;
	} catch {
		fixture.stop(true);
		rmSync(root, { recursive: true, force: true });
		throw new Error("Authorized live validation could not be prepared");
	}
}
const app = Bun.spawn([join(copy, relative(bundle, source))], {
	env: environment,
	stdout: "pipe",
	stderr: "pipe",
});
let log = "";
async function collect(stream: ReadableStream<Uint8Array>) {
	for await (const chunk of stream) {
		const value = new TextDecoder().decode(chunk);
		if (live)
			log +=
				value
					.match(
						/Remote debugging enabled on 127\.0\.0\.1:\d+ \(ELECTROBUN_CEF_REMOTE_DEBUGGING_PORT\)/g,
					)
					?.join("\n") ?? "";
		else log += value;
	}
}
const streams = Promise.all([collect(app.stdout), collect(app.stderr)]);
async function waitFor(check: () => boolean, label: string) {
	const deadline = Date.now() + (automation ? 90000 : 30000);
	while (!check()) {
		if (existsSync(report)) {
			const current = JSON.parse(readFileSync(report, "utf8"));
			if (current.error || current.state?.error)
				throw new Error(`${label}: ${JSON.stringify(current)}`);
			if (current.systemVideo?.passed === false)
				throw new Error(`System WebM player failed: ${JSON.stringify(current.systemVideo)}`);
		}
		if (app.exitCode !== null || Date.now() > deadline)
			throw new Error(`${label}: ${log.slice(-12000)}`);
		await Bun.sleep(100);
	}
}
let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined;
try {
	await waitFor(
		() =>
			existsSync(ready) &&
			/Remote debugging enabled on 127.0.0.1:(\d+) \(ELECTROBUN_CEF_REMOTE_DEBUGGING_PORT\)/.test(
				log,
			),
		"CEF endpoint not ready",
	);
	const port = log.match(/Remote debugging enabled on 127.0.0.1:(\d+)/)?.[1];
	browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { noDefaults: true });
	if (automation) {
		await waitFor(
			() =>
				existsSync(report) &&
				JSON.parse(readFileSync(report, "utf8")).phase === "automation-complete" &&
				JSON.parse(readFileSync(report, "utf8")).systemVideo?.passed === true,
			"Native browser automation did not complete",
		);
		const result = JSON.parse(readFileSync(report, "utf8"));
		cpSync(join(root, "demo.webm"), join(reportDirectory, "demo.webm"));
		await browser.close();
		browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { noDefaults: true });
		await waitFor(
			() =>
				browser
					?.contexts()
					.flatMap((context) => context.pages())
					.some((page) => page.url() === `http://127.0.0.1:${fixture.port}/verify`) === true,
			"Video verification target not ready",
		);
		const page = browser
			.contexts()
			.flatMap((context) => context.pages())
			.find((page) => page.url() === `http://127.0.0.1:${fixture.port}/verify`);
		if (!page) throw new Error("Video verification page unavailable");
		const video = await page.evaluate(async (url) => {
			const video = document.createElement("video");
			video.src = url;
			video.muted = true;
			Object.assign(video.style, {
				position: "fixed",
				top: "0",
				left: "0",
				width: "640px",
				height: "480px",
				zIndex: "2147483647",
			});
			document.body.append(video);
			await new Promise<void>((resolve, reject) => {
				const timer = setTimeout(() => reject(new Error("Video decoding timed out")), 10000);
				video.onloadeddata = () => {
					clearTimeout(timer);
					resolve();
				};
				video.onerror = () => {
					clearTimeout(timer);
					reject(new Error("Video cannot be decoded"));
				};
			});
			const canvas = document.createElement("canvas");
			canvas.width = video.videoWidth;
			canvas.height = video.videoHeight;
			const context = canvas.getContext("2d");
			if (!context) throw new Error("Canvas unavailable");
			const pixel = () => {
				context.drawImage(video, 0, 0);
				return [...context.getImageData(525, 105, 1, 1).data];
			};
			const firstFrame = new Promise<void>((resolve, reject) => {
				const timer = setTimeout(() => reject(new Error("Video produced no frame")), 5000);
				video.requestVideoFrameCallback(() => {
					clearTimeout(timer);
					resolve();
				});
			});
			await video.play();
			await firstFrame;
			video.pause();
			const first = pixel();
			await video.play();
			await new Promise((resolve) => setTimeout(resolve, 1500));
			video.pause();
			const later = pixel();
			const playedUntil = video.currentTime;
			const duration = video.duration;
			if (!Number.isFinite(duration) || duration < 1)
				throw new Error("Recorded WebM has no finite duration");
			video.currentTime = 0.1;
			await new Promise<void>((resolve, reject) => {
				const timer = setTimeout(() => reject(new Error("Video seeking timed out")), 5000);
				video.onseeked = () => {
					clearTimeout(timer);
					resolve();
				};
			});
			const seeked = pixel();
			return {
				width: video.videoWidth,
				height: video.videoHeight,
				duration,
				seeked,
				first,
				later,
				currentTime: playedUntil,
			};
		}, `http://127.0.0.1:${fixture.port}/video`);
		if (
			video.width !== 640 ||
			video.height !== 480 ||
			(video.first[0] ?? 0) < 200 ||
			(video.later[2] ?? 0) < 200 ||
			video.currentTime < 1 ||
			(video.seeked[0] ?? 0) < 200
		)
			throw new Error(`Recording has wrong pixels or cannot play: ${JSON.stringify(video)}`);
		await page
			.evaluate(() => window.close())
			.catch((error) => {
				if (!page.isClosed()) throw error;
			});
		await waitFor(
			() => browser?.contexts().flatMap((context) => context.pages()).length === 0,
			"Recording targets were not released",
		);
		const origin = JSON.parse(readFileSync(ready, "utf8")).origin;
		if (!(await fetch(`${origin}/health`)).ok)
			throw new Error("Host exited after recording cleanup");
		const pi = live
			? await runBrowserLiveProbe(origin, root, `http://127.0.0.1:${fixture.port}/`)
			: await runBrowserPiProbe(origin, root);
		writeFileSync(
			join(reportDirectory, live ? "live-recording.webm" : "pi-recording.webm"),
			pi.video,
		);
		const { video: _piVideo, ...piReport } = pi;
		writeFileSync(
			join(reportDirectory, live ? "live-report.json" : "automation-report.json"),
			JSON.stringify(
				{
					...result,
					video,
					pi: piReport,
					hostAlive: true,
					...(verifySource ? { originalCredentialUnchanged: verifySource() } : {}),
				},
				null,
				2,
			),
		);
		console.log(`Native browser automation and real WebM playback passed: ${reportDirectory}`);
	} else if (closeRegression) {
		await waitFor(
			() =>
				existsSync(report) && JSON.parse(readFileSync(report, "utf8")).phase === "close-complete",
			"Closing a browser page stopped the application",
		);
		const origin = JSON.parse(readFileSync(ready, "utf8")).origin;
		const health = await fetch(`${origin}/health`, { signal: AbortSignal.timeout(3000) });
		if (!health.ok || (await health.text()) !== "ok")
			throw new Error("Host stopped after closing browser pages");
		if (browser.contexts().flatMap((context) => context.pages()).length !== 0)
			throw new Error("Closed browser targets remain alive");
		writeFileSync(
			join(reportDirectory, "close-report.json"),
			JSON.stringify({ phase: "close-complete", hostAlive: true, closedTargets: 5 }),
		);
		console.log(`Native browser close regression passed: ${reportDirectory}`);
	} else {
		await waitFor(
			() => existsSync(report) && JSON.parse(readFileSync(report, "utf8")).phase === "picking",
			"Native picker not ready",
		);
		await waitFor(
			() =>
				browser
					?.contexts()
					.flatMap((context) => context.pages())
					.some((page) => page.url().startsWith(`http://127.0.0.1:${fixture.port}/`)) === true,
			"Native guest URL not ready on the CDP connection",
		);
		const page = browser
			.contexts()
			.flatMap((context) => context.pages())
			.find((page) => page.url().startsWith(`http://127.0.0.1:${fixture.port}/`));
		if (!page) throw new Error("Native guest not found");
		writeFileSync(
			join(reportDirectory, "before-pick.json"),
			JSON.stringify(
				await page.evaluate(() => ({
					width: innerWidth,
					height: innerHeight,
					rect: document.querySelector("#choose")?.getBoundingClientRect().toJSON(),
				})),
				null,
				2,
			),
		);
		if (
			(await page.evaluate(() => typeof Reflect.get(window, "__pideckBrowserMessage"))) !==
			"undefined"
		)
			throw new Error("Browser bridge exposed in the page world");
		await page.evaluate(() =>
			document.dispatchEvent(
				new KeyboardEvent("keydown", { key: "w", ctrlKey: true, bubbles: true }),
			),
		);
		await page.locator("#choose").click();
		await waitFor(
			() => JSON.parse(readFileSync(report, "utf8")).phase === "complete",
			"Native capture not complete",
		);
		const result = JSON.parse(readFileSync(report, "utf8"));
		if (result.state.canGoBack) throw new Error("Bootstrap leaked into navigation history");
		if (result.scrollTop !== 200) throw new Error("Responsive preview cannot scroll");
		if (result.selection.selector !== "#choose") throw new Error("Wrong native selection");
		if (await page.evaluate(() => Reflect.get(window, "clicked")))
			throw new Error("Picker activated the page button");
		const metrics = await page.evaluate(() => ({
			width: innerWidth,
			height: innerHeight,
			dpr: devicePixelRatio,
		}));
		if (metrics.width !== 393 || metrics.height !== 852 || metrics.dpr !== 1)
			throw new Error(`Incorrect viewport: ${JSON.stringify(metrics)}`);
		const png = readFileSync(`${report}.png`);
		const dimensions = { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
		if (dimensions.width !== 393 || dimensions.height !== 852)
			throw new Error(`Incorrect screenshot: ${JSON.stringify(dimensions)}`);
		writeFileSync(join(reportDirectory, "screenshot.png"), png);
		const pixels = await page.evaluate(
			async (dataUrl) => {
				const image = new Image();
				image.src = dataUrl;
				await image.decode();
				const canvas = document.createElement("canvas");
				canvas.width = image.width;
				canvas.height = image.height;
				const context = canvas.getContext("2d");
				if (!context) throw new Error("Canvas unavailable");
				context.drawImage(image, 0, 0);
				return [...document.querySelectorAll("[data-corner]")].map((node) => {
					const rect = node.getBoundingClientRect();
					return [
						...context.getImageData(
							Math.floor(rect.x + rect.width / 2),
							Math.floor(rect.y + rect.height / 2),
							1,
							1,
						).data,
					];
				});
			},
			`data:image/png;base64,${png.toString("base64")}`,
		);
		const [red, green, blue, yellow] = pixels;
		const channel = (pixel: number[] | undefined, index: number) => pixel?.[index] ?? -1;
		if (
			!(
				pixels.length === 4 &&
				channel(red, 0) > 200 &&
				channel(red, 1) < 100 &&
				channel(red, 2) < 100 &&
				channel(green, 1) > 200 &&
				channel(green, 0) < 150 &&
				channel(green, 2) < 150 &&
				channel(blue, 2) > 200 &&
				channel(blue, 0) < 100 &&
				channel(blue, 1) < 100 &&
				channel(yellow, 0) > 200 &&
				channel(yellow, 1) > 200 &&
				channel(yellow, 2) < 100
			)
		)
			throw new Error(`Screenshot corner coverage is incorrect: ${JSON.stringify(pixels)}`);
		writeFileSync(
			join(reportDirectory, "report.json"),
			JSON.stringify({ ...result, metrics, dimensions, pixels, root }, null, 2),
		);
		console.log(`Native browser smoke passed: ${reportDirectory}`);
	}
} finally {
	if (live && existsSync(join(root, "live-probe.json")))
		writeFileSync(
			join(reportDirectory, "live-audit.json"),
			readFileSync(join(root, "live-probe.json")),
		);
	if (
		automation &&
		existsSync(report) &&
		String(JSON.parse(readFileSync(report, "utf8")).error ?? "").includes("pasted")
	) {
		try {
			const port = log.match(/Remote debugging enabled on 127.0.0.1:(\d+)/)?.[1];
			const diagnostic = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, {
				noDefaults: true,
			});
			const page = diagnostic
				.contexts()
				.flatMap((context) => context.pages())
				.find((page) => page.url().startsWith(`http://127.0.0.1:${fixture.port}/`));
			if (page)
				writeFileSync(
					join(reportDirectory, "clipboard-debug.json"),
					JSON.stringify(
						await page.evaluate(() => ({
							active: document.activeElement?.id,
							focused: document.hasFocus(),
							types: Reflect.get(window, "pasteTypes"),
							image: Reflect.get(window, "pastedImage"),
						})),
					),
				);
			await diagnostic.close();
		} catch {}
	}
	await browser?.close();
	writeFileSync(control, "stop");
	await Promise.race([app.exited, Bun.sleep(5000)]);
	if (app.exitCode === null) app.kill();
	await streams;
	fixture.stop(true);
	if (process.platform === "darwin") {
		const fixtureDownload = join(userInfo().homedir, "Downloads", downloadFilename);
		if (existsSync(fixtureDownload) && readFileSync(fixtureDownload, "utf8") === "fixture download")
			rmSync(fixtureDownload);
	}
	writeFileSync(join(reportDirectory, live ? "live-native.log" : "native.log"), log);
	if (existsSync(report)) cpSync(report, join(reportDirectory, "probe-state.json"));
	rmSync(root, { recursive: true, force: true });
	if (process.platform === "darwin")
		rmSync(join(homedir(), "Library", "Application Support", metadata.identifier), {
			recursive: true,
			force: true,
		});
}
