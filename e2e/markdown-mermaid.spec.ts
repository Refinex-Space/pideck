import { expect, test } from "@playwright/test";
import { createWorkspaceViaDialog, openFixtureProject, revealWorkbenchTool } from "./fixtures/app";

test("renders mermaid fences as diagrams in the rendered markdown view", async ({ page }) => {
	await openFixtureProject(page);
	await createWorkspaceViaDialog(page);
	await revealWorkbenchTool(page, "files");

	const file = page.getByTestId("file-node").filter({ hasText: "DIAGRAM.md" });
	await expect(file).toBeVisible();
	await file.dblclick();

	const preview = page.getByTestId("markdown-preview");
	await expect(preview).toBeVisible();

	await expect(preview.getByTestId("mermaid-svg").locator("svg")).toBeVisible({ timeout: 20_000 });
	await expect(preview.getByTestId("mermaid-svg")).toHaveCount(1);
	const error = preview.getByTestId("mermaid-error");
	await expect(error).toHaveCount(1);
	await expect(error).toContainText("broken");

	await expect(preview.locator("pre.shiki", { hasText: "plain-fence-stays-code" })).toBeVisible();

	await preview.getByTestId("mermaid-fullscreen").click();
	const dialog = page.getByTestId("mermaid-fullscreen-dialog");
	await expect(dialog).toBeVisible();
	const gestureClaimed = await dialog.getByTestId("mermaid-fullscreen-svg").evaluate((element) => {
		const dispatch = (type: string, scale: number) => {
			const event = new Event(type, { bubbles: true, cancelable: true });
			Object.defineProperty(event, "scale", { value: scale });
			return element.dispatchEvent(event);
		};
		return [
			dispatch("gesturestart", 1),
			dispatch("gesturechange", 1.5),
			dispatch("gestureend", 1.5),
		];
	});
	await expect(dialog.getByTestId("mermaid-zoom-level")).toHaveText("150%");
	expect(gestureClaimed).toEqual([false, false, false]);
	await page.keyboard.press("Escape");
	await expect(dialog).toHaveCount(0);

	await page.getByTestId("view-toggle-code").click();
	await expect(page.getByTestId("editor-pane")).toContainText("flowchart TD; Start --> Finish");
});

test("code and mermaid blocks are framed with hover actions", async ({ page, context }) => {
	await context.grantPermissions(["clipboard-read", "clipboard-write"]);
	await openFixtureProject(page);
	await createWorkspaceViaDialog(page);
	await revealWorkbenchTool(page, "files");
	await page.getByTestId("file-node").filter({ hasText: "DIAGRAM.md" }).dblclick();
	const preview = page.getByTestId("markdown-preview");

	await expect(preview.getByTestId("mermaid-svg").locator("svg")).toBeVisible({ timeout: 20_000 });
	const code = preview.getByTestId("code-block").filter({ hasText: "plain-fence-stays-code" });
	await expect(code).toBeVisible();
	await expect(code.getByTestId("block-toolbar")).toHaveCSS("opacity", "0");
	await code.hover();
	await expect(code.getByTestId("block-toolbar")).toHaveCSS("opacity", "1");
	await code.getByTestId("code-copy").click();
	await expect(code.getByTestId("code-copy")).toHaveAttribute("data-copied", "true");
	expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
		"plain-fence-stays-code",
	);

	const diagram = preview.getByTestId("mermaid-block");
	await expect(diagram.getByTestId("mermaid-svg").locator("svg")).toBeVisible({ timeout: 20_000 });
	await diagram.hover();
	await expect(diagram.getByTestId("block-toolbar")).toHaveCSS("opacity", "1");

	await diagram.getByTestId("mermaid-copy").click();
	expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
		"flowchart TD; Start --> Finish",
	);

	const download = page.waitForEvent("download");
	await diagram.getByTestId("mermaid-download").click();
	expect((await download).suggestedFilename()).toMatch(/^diagram\.(png|svg)$/);

	await diagram.getByTestId("mermaid-toggle-source").click();
	await expect(diagram.getByTestId("mermaid-svg")).toHaveCount(0);
	await expect(diagram).toContainText("flowchart TD; Start --> Finish");
	await expect(diagram.getByTestId("mermaid-download")).toBeDisabled();
	await diagram.getByTestId("mermaid-toggle-source").click();
	await expect(diagram.getByTestId("mermaid-svg").locator("svg")).toBeVisible();
});
