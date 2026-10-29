import { existsSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { createWorkspaceViaDialog, openAppFresh, openFixtureProject } from "./fixtures/app";
import { E2eWire } from "./fixtures/wire";

test("fixture reset closes workspace terminals before removing their working directories", async ({
	page,
}) => {
	await openFixtureProject(page);
	const workspace = await createWorkspaceViaDialog(page);
	const wire = await E2eWire.connect(Number(new URL(page.url()).port));
	try {
		const terminals = await wire.request("terminal.list", { workspaceId: workspace.id });
		expect(terminals.tabs.length).toBeGreaterThan(0);
		const tab = terminals.tabs[0];
		if (!tab) throw new Error("Missing fixture terminal");
		await wire.request("terminal.attach", { workspaceId: workspace.id, tabKey: tab.tabKey });
	} finally {
		wire.close();
	}
	await openAppFresh(page);
	expect(existsSync(workspace.worktreePath)).toBe(false);
	await openFixtureProject(page);
	await createWorkspaceViaDialog(page);
});
