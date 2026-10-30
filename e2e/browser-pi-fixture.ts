import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PROTOCOL_VERSION, type WsMethodMap } from "@thinkrail/contracts";
import { LOGIN_ENV_END, LOGIN_ENV_MARKER } from "@thinkrail/shared/shellEnv";

function quote(value: string) {
	return `'${value.replaceAll("'", "'\\''")}'`;
}

export function browserFixtureEnvironment(root: string): Record<string, string> {
	const bin = join(root, "bin");
	const home = join(root, "home");
	mkdirSync(bin);
	mkdirSync(home);
	const gitConfig = join(root, "gitconfig");
	writeFileSync(gitConfig, "");
	const git = Bun.which("git");
	if (!git) throw new Error("Native browser fixture requires Git");
	if (process.platform === "win32")
		return {
			HOME: home,
			USERPROFILE: home,
			GIT_CONFIG_GLOBAL: gitConfig,
			GIT_CONFIG_NOSYSTEM: "1",
		};
	for (const [name, executable] of [
		["bun", process.execPath],
		["git", git],
	]) {
		const target = join(bin, name ?? "");
		writeFileSync(target, `#!/bin/sh\nexec ${quote(executable ?? "")} "$@"\n`);
		chmodSync(target, 0o755);
	}
	const path = `${bin}:/usr/bin:/bin:/usr/sbin:/sbin`;
	const shell = join(bin, "login-shell");
	writeFileSync(
		shell,
		`#!/bin/sh\ncase "$*" in *${LOGIN_ENV_MARKER}*) printf '%sPATH=%s\\0%s' ${quote(LOGIN_ENV_MARKER)} ${quote(path)} ${quote(LOGIN_ENV_END)}; exit 0;; esac\nexec /bin/sh "$@"\n`,
	);
	chmodSync(shell, 0o755);
	return {
		HOME: home,
		SHELL: shell,
		PATH: path,
		XDG_CACHE_HOME: join(root, "cache"),
		GIT_CONFIG_GLOBAL: gitConfig,
		GIT_CONFIG_NOSYSTEM: "1",
	};
}

export function prepareBrowserPiProbe(
	root: string,
	fixtureUrl: string,
	env: Record<string, string>,
) {
	const project = join(root, "project");
	const agent = join(root, "agent");
	mkdirSync(project);
	mkdirSync(join(agent, "extensions"), { recursive: true });
	mkdirSync(join(root, "no-hooks"));
	writeFileSync(join(project, "README.md"), "# Isolated native browser fixture\n");
	for (const args of [
		["init", "-b", "main"],
		["add", "README.md"],
		[
			"-c",
			"user.name=PiDeck fixture",
			"-c",
			"user.email=fixture@example.invalid",
			"-c",
			"commit.gpgsign=false",
			"-c",
			`core.hooksPath=${join(root, "no-hooks")}`,
			"commit",
			"-m",
			"fixture",
		],
	]) {
		const result = Bun.spawnSync(["git", "-C", project, ...args], {
			env,
			stdout: "ignore",
			stderr: "pipe",
		});
		if (!result.success) throw new Error("Could not initialize the isolated browser fixture");
	}
	writeFileSync(
		join(agent, "models.json"),
		JSON.stringify({
			providers: {
				"native-browser-probe": {
					baseUrl: `${fixtureUrl}model-must-not-run`,
					api: "openai-completions",
					apiKey: "synthetic-browser-key",
					models: [
						{
							id: "native-browser-model",
							name: "Native browser fixture",
							reasoning: false,
							input: ["text", "image"],
							cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
							contextWindow: 1000000,
							maxTokens: 4096,
						},
					],
				},
			},
		}),
	);
	writeFileSync(
		join(agent, "extensions", "browser-probe.ts"),
		`
import { createFauxCore, fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { writeFileSync } from "node:fs";
const api = "native-browser-faux";
const model = { id: "native-browser-model", name: "Native browser fixture", api, reasoning: false, input: ["text","image"], cost: { input:0,output:0,cacheRead:0,cacheWrite:0 },contextWindow:1000000,maxTokens:4096 };
const faux = createFauxCore({api,provider:"native-browser-probe",models:[model],tokensPerSecond:100000});
let stage=0, tabId, recordingId, polls=0;
const report={offered:false, actions:[], complete:false};
const write=()=>writeFileSync(${JSON.stringify(join(root, "pi-probe.json"))},JSON.stringify(report));
const call=(name,args)=>fauxAssistantMessage([fauxToolCall(name,args)],{stopReason:"toolUse"});
const browser=args=>{report.actions.push(args.action);write();return call("browser",args)};
const respond=async context=>{
 faux.appendResponses([respond]);
 try {
  const offered=new Set();for(const message of context.messages){if(message.role!=="system")continue;for(const name of message.toolsRemoved??[])offered.delete(name);for(const tool of message.toolsAdded??[])offered.add(tool.name)}
  report.offered=offered.has("browser");
  if(!report.offered)throw new Error("Native host did not offer the browser tool to Pi");
  const last=context.messages.findLast(message=>message.role==="toolResult");
  if(last?.isError)throw new Error(last.content.filter(block=>block.type==="text").map(block=>block.text).join("\\n").slice(0,2000));
  let result={};try{result=JSON.parse(last?.content.filter(block=>block.type==="text").map(block=>block.text).join("\\n")??"{}")}catch{}
  if(stage===0){stage++;return call("set_title",{chat_title:"Native browser fixture"})}
  if(stage===1){stage++;return browser({action:"newTab",url:${JSON.stringify(fixtureUrl)}})}
  if(stage===2){tabId=result.data?.tabId;if(!tabId)throw new Error("Pi did not receive the created tab id");stage++;return browser({action:"snapshot",tabId})}
  if(stage===3){stage++;return browser({action:"fill",tabId,locator:{label:"Name",exact:true},text:"Native Pi"})}
  if(stage===4){stage++;return browser({action:"screenshot",tabId})}
  if(stage===5){stage++;return browser({action:"recordingStart",tabId,viewport:{width:640,height:480},outputPath:"pi-recording.webm",maxDurationMs:10000,actions:[{type:"wait",durationMs:100},{type:"click",selector:"#choose"},{type:"type",selector:"#name",text:"Pi recorded"},{type:"wait",durationMs:200}]})}
  if(stage===6){recordingId=result.recording?.id;if(!recordingId)throw new Error("Pi did not receive a recording id");stage++;return browser({action:"recordingStatus",tabId,recordingId})}
  if(stage===7){if(result.recording?.phase==="failed"||result.recording?.phase==="cancelled")throw new Error(JSON.stringify(result.recording));if(result.recording?.phase!=="completed"){if(++polls>100)throw new Error("Pi recording did not complete");await new Promise(resolve=>setTimeout(resolve,200));return browser({action:"recordingStatus",tabId,recordingId})}if(result.recording.artifact?.path!=="pi-recording.webm")throw new Error("Pi recording artifact was not delivered");stage++;return browser({action:"evaluate",tabId,script:"() => document.querySelector('#name').value"})}
  if(stage===8){if(result.data!=="Pi recorded")throw new Error("Pi browser scenario did not change the real page");stage++;return browser({action:"finalize",keep:[tabId]})}
  report.complete=true;write();return fauxAssistantMessage("Native Pi browser verified.");
 } catch(error){report.error=String(error);write();return fauxAssistantMessage("Native browser fixture failed.")}
};
faux.setResponses([respond]);
export default function browserProbe(pi){pi.registerProvider("native-browser-probe",{api,baseUrl:"https://fixture.invalid",apiKey:"synthetic-browser-key",models:[model],streamSimple:faux.streamSimple});report.loaded=true;write()}
`,
	);
	return project;
}

export async function connectBrowserProbe(origin: string, sensitive = false) {
	const socket = new WebSocket(
		`${origin.replace(/^http/, "ws")}/ws?client=browser-native-fixture&protocol=${PROTOCOL_VERSION}`,
	);
	await new Promise<void>((resolve, reject) => {
		socket.addEventListener("open", () => resolve(), { once: true });
		socket.addEventListener("error", () => reject(new Error("Native host WebSocket failed")), {
			once: true,
		});
	});
	let sequence = 0;
	function request<M extends keyof WsMethodMap>(
		method: M,
		params: WsMethodMap[M]["params"],
	): Promise<WsMethodMap[M]["result"]> {
		const id = `browser-native-${++sequence}`;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				socket.removeEventListener("message", receive);
				reject(new Error(`${method} timed out`));
			}, 180000);
			const receive = (event: MessageEvent) => {
				const frame = JSON.parse(String(event.data));
				if (frame.id !== id) return;
				clearTimeout(timer);
				socket.removeEventListener("message", receive);
				socket.send(JSON.stringify({ ack: [id] }));
				if (frame.ok) resolve(frame.result);
				else reject(new Error(sensitive ? `${method} failed` : String(frame.error)));
			};
			socket.addEventListener("message", receive);
			socket.send(JSON.stringify({ id, method, params }));
		});
	}
	return { request, close: () => socket.close() };
}

export async function runBrowserPiProbe(origin: string, root: string) {
	const { request, close } = await connectBrowserProbe(origin);
	try {
		const project = await request("project.open", { path: join(root, "project") });
		const workspace = (await request("workspace.list", { projectId: project.id })).find(
			(workspace) => workspace.kind === "default",
		);
		if (!workspace) throw new Error("Native Pi workspace is unavailable");
		const created = await request("session.create", { workspaceId: workspace.id });
		const model = (await request("model.list", {})).find(
			(model) => model.provider === "native-browser-probe" && model.id === "native-browser-model",
		);
		if (!model || !JSON.parse(readFileSync(join(root, "pi-probe.json"), "utf8")).loaded)
			throw new Error("Isolated native Faux provider did not load");
		await request("session.setModel", { sessionId: created.sessionId, model });
		await request("session.prompt", {
			sessionId: created.sessionId,
			text: "Use the browser tool on the isolated fixture. Operate its Name field, capture a screenshot, record the requested actions and retain the result tab.",
		});
		const deadline = Date.now() + 60000;
		while (true) {
			let result: { error?: string; complete?: boolean; offered?: boolean; actions?: string[] } =
				{};
			try {
				result = JSON.parse(readFileSync(join(root, "pi-probe.json"), "utf8"));
			} catch {}
			if (result.error) throw new Error(result.error);
			if (result.complete) {
				const response = await fetch(`${origin}/files/${workspace.id}/pi-recording.webm`);
				if (!response.ok || response.headers.get("Content-Type") !== "video/webm")
					throw new Error("Native Pi recording is not served as playable WebM");
				return {
					...result,
					workspaceId: workspace.id,
					sessionId: created.sessionId,
					video: new Uint8Array(await response.arrayBuffer()),
				};
			}
			if (Date.now() > deadline) throw new Error("Native Pi browser turn did not complete");
			await Bun.sleep(200);
		}
	} finally {
		close();
	}
}
