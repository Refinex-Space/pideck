import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SettingsManager } from "@earendil-works/pi-coding-agent";
import { buildResourceLoader } from "../agent/extensions";
import { readInstructions, saveInstruction } from "./files";

// The settings page only writes files; this pins that PiDeck's own chat loader then injects them and that a
// reload (what "Apply to open chats" requests) re-reads them.
test("a chat's resource loader injects the saved global files and picks up a later save on reload", async () => {
	const root = mkdtempSync(join(tmpdir(), "pideck-instructions-inject-"));
	const agentDir = join(root, "agent");
	const cwd = join(root, "project");
	mkdirSync(agentDir);
	mkdirSync(cwd);
	const priorAgentDir = process.env.PI_CODING_AGENT_DIR;
	process.env.PI_CODING_AGENT_DIR = agentDir;
	const write = (kind: "agents" | "append", content: string) => {
		const doc = readInstructions(agentDir)[kind];
		saveInstruction(agentDir, {
			kind,
			content,
			expectedPath: doc.path,
			expectedRevision: doc.revision,
		});
	};
	try {
		write("agents", "Answer in the user's language.");
		write("append", "Keep answers short.");
		writeFileSync(join(cwd, "AGENTS.md"), "Project rule.\n");
		const loader = await buildResourceLoader(
			cwd,
			SettingsManager.create(cwd, agentDir, { projectTrusted: false }),
			() => ({
				trusted: false,
				piResourceTrusted: false,
				acknowledged: [],
				disabled: [],
				disabledGroups: [],
				overrides: {},
			}),
		);
		expect(loader.getAgentsFiles().agentsFiles.map((file) => file.content)).toEqual([
			"Answer in the user's language.\n",
			"Project rule.\n",
		]);
		expect(loader.getAppendSystemPrompt()).toEqual(["Keep answers short.\n"]);

		write("agents", "Be formal.");
		write("append", "");
		await loader.reload();
		expect(loader.getAgentsFiles().agentsFiles[0]?.content).toBe("Be formal.\n");
		expect(loader.getAppendSystemPrompt()).toEqual([]);
	} finally {
		if (priorAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = priorAgentDir;
		rmSync(root, { recursive: true, force: true });
	}
});
