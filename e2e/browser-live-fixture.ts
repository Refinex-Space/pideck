import { createHash } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { connectBrowserProbe } from "./browser-pi-fixture";

const PROVIDER = "zai-coding-cn";
const MODEL = "glm-5.3";

export function prepareBrowserLiveProbe(
	root: string,
	agentDir: string,
	fixtureUrl: string,
): { environment: Record<string, string>; sourceUnchanged(): boolean } {
	const source = join(agentDir, "auth.json");
	const before = createHash("sha256").update(readFileSync(source)).digest("hex");
	let entry: { type?: unknown; key?: unknown; env?: unknown };
	try {
		entry = JSON.parse(readFileSync(source, "utf8"))[PROVIDER];
	} catch {
		throw new Error("The authorized provider credential could not be read");
	}
	if (entry?.type !== "api_key" || typeof entry.key !== "string" || !entry.key)
		throw new Error("The authorized provider requires an API-key credential");
	rmSync(join(root, "agent", "models.json"), { force: true });
	rmSync(join(root, "agent", "extensions", "browser-probe.ts"));
	writeFileSync(
		join(root, "agent", "settings.json"),
		JSON.stringify({ retry: { enabled: false, provider: { maxRetries: 0, timeoutMs: 60000 } } }),
	);
	writeFileSync(
		join(root, "agent", "extensions", "browser-live-audit.ts"),
		`
import {writeFileSync} from "node:fs";
const state={actions:[],errors:0,settled:false,responses:0};
const write=()=>writeFileSync(${JSON.stringify(join(root, "live-probe.json"))},JSON.stringify(state));
export default pi=>{
 pi.on("agent_start",()=>{state.settled=false;write()});
 pi.on("message_end",event=>{const message=event.message;if(message.role!=="assistant")return;state.responses++;state.stopReason=message.stopReason;state.lastText=message.content?.filter(part=>part.type==="text").map(part=>part.text).join("\\n").slice(0,2000);if(message.errorMessage)state.modelError=String(message.errorMessage).replaceAll(process.env.ZAI_CODING_CN_API_KEY||"__absent__","[redacted]").replace(/Bearer\\s+\\S+/gi,"Bearer [redacted]").replace(/[a-zA-Z0-9_.-]{24,}/g,"[redacted]").slice(0,600);write()});
 pi.on("tool_call", event=>{
  if(!["browser","set_title"].includes(event.toolName))return {block:true,terminate:true,reason:"This isolated validation permits only browser and set_title"};
  if(event.toolName==="browser"){
   if(state.actions.length>=35)return {block:true,terminate:true,reason:"Browser validation call budget exhausted"};
   if(event.input.url && !event.input.url.startsWith(${JSON.stringify(fixtureUrl)}) && event.input.url!=="about:blank")return {block:true,terminate:true,reason:"Use only the supplied loopback fixture"};
   state.actions.push(event.input.action);write();
  }
 });
 pi.on("tool_result",event=>{if(event.toolName==="browser"){if(event.isError){state.errors++;state.lastToolError=event.content?.filter(part=>part.type==="text").map(part=>part.text).join("\\n").slice(0,1000)}if(event.input.action==="evaluate" && event.details?.data==="GLM recorded")state.valueVerified=true;const artifact=event.details?.artifact??event.details?.recording?.artifact;if(artifact)state.artifact=artifact;write()}});
 pi.on("agent_settled",()=>{state.settled=true;write()});
};
`,
	);
	const environment: Record<string, string> = { ZAI_CODING_CN_API_KEY: entry.key };
	for (const name of [
		"HTTPS_PROXY",
		"HTTP_PROXY",
		"ALL_PROXY",
		"https_proxy",
		"http_proxy",
		"all_proxy",
	]) {
		if (process.env[name]) environment[name] = process.env[name];
	}
	for (const name of ["NO_PROXY", "no_proxy"])
		environment[name] = [process.env[name], "localhost", "127.0.0.1", "::1"]
			.filter(Boolean)
			.join(",");
	return {
		environment,
		sourceUnchanged: () =>
			createHash("sha256").update(readFileSync(source)).digest("hex") === before,
	};
}

export async function runBrowserLiveProbe(origin: string, root: string, fixtureUrl: string) {
	const { request, close } = await connectBrowserProbe(origin, true);
	let sessionId: string | undefined;
	try {
		const project = await request("project.open", { path: join(root, "project") });
		const workspace = (await request("workspace.list", { projectId: project.id })).find(
			(workspace) => workspace.kind === "default",
		);
		if (!workspace) throw new Error("Live browser workspace is unavailable");
		const model = (await request("model.list", {})).find(
			(model) => model.provider === PROVIDER && model.id === MODEL,
		);
		if (!model)
			throw new Error("The authorized GLM-5.3 model is unavailable in the isolated catalog");
		const created = await request("session.create", {
			workspaceId: workspace.id,
			model,
			thinkingLevel: "low",
		});
		sessionId = created.sessionId;
		await request("session.prompt", {
			sessionId,
			text: `这是一次已授权的隔离浏览器验收，仅使用 browser 工具（命名可用 set_title），不要使用其他工具或访问其他地址。先阅读 browser help，再新建标签打开 ${fixtureUrl}，查看 snapshot，找到 Name 输入框，通过 action=fill、locator 对象和 text 参数填写 GLM browser verified；evaluate 仅能读取验证，禁止改 DOM 绕过原生输入。接着使用 recordingStart 录制一个约 1 秒的动作序列：点击 Select this button，再将 Name 填为 GLM recorded，稍等后完成。viewport 用 640×480，outputPath 用 live-recording.webm。轮询 recordingStatus 直到 completed 且 artifact.path 正确；必要时用 status 的 outputPath 保存。用 evaluate 确认 Name 最终值为 GLM recorded，再 finalize 保留该标签，最后简短报告。禁止在录制未完成时结束回合。当前模型仅支持文字，请使用 DOM 操作，不调用 screenshot。`,
		});
		const deadline = Date.now() + 180000;
		while (Date.now() < deadline) {
			let result: {
				settled?: boolean;
				errors?: number;
				valueVerified?: boolean;
				actions?: string[];
				artifact?: { path?: string };
			} = {};
			try {
				result = JSON.parse(readFileSync(join(root, "live-probe.json"), "utf8"));
			} catch {}
			if (result.settled) {
				if (
					result.artifact?.path !== "live-recording.webm" ||
					!result.actions?.includes("recordingStart") ||
					!result.actions.includes("fill") ||
					!result.actions.includes("evaluate") ||
					!result.valueVerified
				)
					throw new Error("Real GLM browser validation did not complete the required actions");
				const response = await fetch(`${origin}/files/${workspace.id}/live-recording.webm`);
				if (!response.ok || response.headers.get("Content-Type") !== "video/webm")
					throw new Error("Real GLM recording was not delivered");
				return {
					provider: PROVIDER,
					model: MODEL,
					...result,
					video: new Uint8Array(await response.arrayBuffer()),
					workspaceId: workspace.id,
					sessionId,
				};
			}
			await Bun.sleep(500);
		}
		throw new Error("Real GLM browser validation exceeded its time budget");
	} finally {
		if (sessionId) await request("session.abort", { sessionId }).catch(() => {});
		close();
	}
}
