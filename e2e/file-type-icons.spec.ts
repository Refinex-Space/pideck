import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Locator, test } from "@playwright/test";
import {
	createWorkspaceViaDialog,
	openAppSettings,
	openFixtureProject,
	revealWorkbenchTool,
} from "./fixtures/app";

async function expectLoadedIcon(row: Locator, id: string) {
	const icon = row.locator("[data-file-icon]");
	await expect(icon).toHaveAttribute("data-file-icon", id);
	const image = icon.locator("img:visible");
	await expect(image).toHaveCount(1);
	await expect
		.poll(() =>
			image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0),
		)
		.toBe(true);
	const url = await image.getAttribute("src");
	expect(url).toMatch(/\/assets\/.*\.svg$/);
}

test("file and semantic folder icons load locally and follow expansion and app appearance", async ({
	page,
}, testInfo) => {
	await openFixtureProject(page);
	const workspace = await createWorkspaceViaDialog(page);
	const directory = join(workspace.worktreePath, "icon-probe");
	mkdirSync(directory);
	for (const folder of ["src", "docs", "java", ".github", "unmatched-folder"])
		mkdirSync(join(directory, folder));
	writeFileSync(join(directory, "src", "index.ts"), "export const value = 1;\n");
	const files = {
		"Main.java": "java",
		"App.tsx": "react_ts",
		"App.vue": "vue",
		"config.xml": "xml",
		"report.docx": "word",
		"manual.pdf": "pdf",
		"package.json": "nodejs",
		"bun.lock": "bun",
		"README.md": "readme",
	};
	for (const name of [...Object.keys(files), "unknown.custom-format"])
		writeFileSync(join(directory, name), name === "package.json" ? "{}\n" : "fixture\n");

	await revealWorkbenchTool(page, "files");
	const probe = page
		.getByTestId("file-node")
		.filter({ has: page.getByText("icon-probe", { exact: true }) });
	const row = (name: string) =>
		probe
			.locator("..")
			.getByTestId("file-node")
			.filter({ has: page.getByText(name, { exact: true }) });
	await expect(probe.locator("[data-file-icon]")).toHaveAttribute("data-file-icon", "folder");
	await probe.click();
	await expect(probe).toHaveAttribute("aria-expanded", "true");
	await expect(probe.locator("[data-file-icon]")).toHaveAttribute("data-file-icon", "folder-open");
	for (const [name, icon] of Object.entries(files)) await expectLoadedIcon(row(name), icon);
	await expect(row("unknown.custom-format").locator("[data-file-icon]")).toHaveAttribute(
		"data-file-icon",
		"file",
	);
	await expectLoadedIcon(row("src"), "folder-src");
	await row("src").click();
	await expectLoadedIcon(row("src"), "folder-src-open");
	await expectLoadedIcon(row("index.ts"), "typescript");
	await row("src").click();
	await expectLoadedIcon(row("src"), "folder-src");
	await expect(row("index.ts")).toBeHidden();
	await expectLoadedIcon(row(".github"), "folder-github");
	await expectLoadedIcon(row("docs"), "folder-docs");
	await expectLoadedIcon(row("java"), "folder-java");

	for (const theme of ["light", "dark"] as const) {
		await openAppSettings(page);
		await page.getByTestId("settings-nav-appearance").click();
		await page.getByTestId(`theme-mode-${theme}`).click();
		await page.keyboard.press("Escape");
		const image = row("bun.lock").locator("img:visible");
		await expect(image).toHaveAttribute(
			"src",
			new RegExp(`/bun${theme === "light" ? "_light" : ""}-[^/]+\\.svg$`),
		);
		await expectLoadedIcon(row("bun.lock"), "bun");
		await page.screenshot({
			path: testInfo.outputPath(`file-icons-${theme}.png`),
			animations: "disabled",
		});
	}
	await row("Main.java").click();
	await expect(page.getByTestId("editor-tab").filter({ hasText: "Main.java" })).toBeVisible();
	await row("Main.java").dblclick();
	await expect(page.getByTestId("editor-tab").filter({ hasText: "Main.java" })).not.toHaveAttribute(
		"data-preview",
		"true",
	);

	await revealWorkbenchTool(page, "changes");
	const changed = page.getByTestId("change-item").filter({ hasText: "Main.java" });
	await expectLoadedIcon(changed, "java");
	await page.getByTestId("changes-view-toggle").click();
	await expectLoadedIcon(changed, "java");
});
