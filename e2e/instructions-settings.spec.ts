import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { createWorkspaceViaDialog, openFixtureProject, openSettingsSection } from "./fixtures/app";
import { E2E_PI_AGENT_DIR } from "./fixtures/paths";

const AGENTS = join(E2E_PI_AGENT_DIR, "AGENTS.md");
const APPEND = join(E2E_PI_AGENT_DIR, "APPEND_SYSTEM.md");

test.beforeEach(() => {
	for (const file of [AGENTS, APPEND]) rmSync(file, { force: true });
});
test.afterEach(() => {
	for (const file of [AGENTS, APPEND]) rmSync(file, { force: true });
});

test("global rules are written to Pi's AGENTS.md and listed as loaded for the workspace", async ({
	page,
}) => {
	await openFixtureProject(page);
	await createWorkspaceViaDialog(page);
	await openSettingsSection(page, "instructions");

	const text = page.getByTestId("instructions-agents-text");
	await expect(page.getByTestId("instructions-agents-path")).toContainText(AGENTS);
	await expect(page.getByTestId("instructions-agents-save")).toBeDisabled();
	await expect(page.getByTestId("instructions-loaded")).toHaveCount(0);

	await text.fill("- Answer in the user's language.");
	await page.getByTestId("instructions-agents-save").click();
	await expect(page.getByTestId("instructions-agents-save")).toBeDisabled();
	expect(readFileSync(AGENTS, "utf8")).toBe("- Answer in the user's language.\n");

	const loaded = page.getByTestId("instructions-loaded");
	await expect(loaded).toContainText(AGENTS);
	await expect(loaded).toContainText("Global");

	await text.fill("");
	await page.getByTestId("instructions-agents-save").click();
	await expect(page.getByTestId("instructions-loaded")).toHaveCount(0);
	expect(existsSync(AGENTS)).toBe(false);
});

test("a file changed on disk is not overwritten silently", async ({ page }) => {
	mkdirSync(E2E_PI_AGENT_DIR, { recursive: true });
	writeFileSync(AGENTS, "original\n");
	await openFixtureProject(page);
	await openSettingsSection(page, "instructions");

	const text = page.getByTestId("instructions-agents-text");
	await expect(text).toHaveValue("original\n");
	await text.fill("mine");
	writeFileSync(AGENTS, "edited elsewhere\n");
	await page.getByTestId("instructions-agents-save").click();

	await expect(page.getByTestId("instructions-agents-conflict")).toBeVisible();
	expect(readFileSync(AGENTS, "utf8")).toBe("edited elsewhere\n");

	await page.getByTestId("instructions-agents-conflict-overwrite").click();
	await expect(page.getByTestId("instructions-agents-conflict")).toHaveCount(0);
	expect(readFileSync(AGENTS, "utf8")).toBe("mine\n");
});

test("another candidate file is edited in place and the ignored one is named", async ({ page }) => {
	mkdirSync(E2E_PI_AGENT_DIR, { recursive: true });
	writeFileSync(AGENTS, "agents\n");
	const claude = join(E2E_PI_AGENT_DIR, "CLAUDE.md");
	writeFileSync(claude, "claude\n");
	try {
		await openFixtureProject(page);
		await openSettingsSection(page, "instructions");
		await expect(page.getByTestId("instructions-agents-text")).toHaveValue("agents\n");
		await expect(page.getByTestId("instructions-agents-ignored")).toContainText("CLAUDE.md");
	} finally {
		rmSync(claude, { force: true });
	}
});

test("the extra system prompt is edited separately and a project file that replaces it is flagged", async ({
	page,
}) => {
	await openFixtureProject(page);
	const workspace = await createWorkspaceViaDialog(page);
	mkdirSync(join(workspace.worktreePath, ".pi"), { recursive: true });
	writeFileSync(join(workspace.worktreePath, ".pi", "APPEND_SYSTEM.md"), "project append\n");
	await openSettingsSection(page, "instructions");

	await expect(page.getByTestId("instructions-append-text")).toHaveCount(0);
	await page.getByTestId("instructions-append-toggle").click();
	await page.getByTestId("instructions-append-text").fill("Keep answers short.");
	await page.getByTestId("instructions-append-save").click();
	await expect(page.getByTestId("instructions-append-save")).toBeDisabled();
	expect(readFileSync(APPEND, "utf8")).toBe("Keep answers short.\n");
	await expect(page.getByTestId("instructions-project-append")).toBeVisible();
});

test("applying to open chats reports the result", async ({ page }) => {
	await openFixtureProject(page);
	await createWorkspaceViaDialog(page);
	await openSettingsSection(page, "instructions");
	await page.getByTestId("instructions-apply-button").click();
	await expect(page.getByTestId("toast").getByText("Applied to open chats")).toBeVisible();
});

test("the editor previews its Markdown and keeps the draft across modes", async ({ page }) => {
	await openFixtureProject(page);
	await openSettingsSection(page, "instructions");

	await page.getByTestId("instructions-agents-text").fill("# Team rules\n\n- Be kind");
	await page.getByTestId("instructions-agents-mode-preview").click();
	const preview = page.getByTestId("instructions-agents-preview");
	await expect(preview.getByRole("heading", { name: "Team rules" })).toBeVisible();
	await expect(preview.getByRole("listitem")).toHaveText("Be kind");
	await expect(page.getByTestId("instructions-agents-text")).toHaveCount(0);
	await expect(page.getByTestId("instructions-agents-mode-preview")).toHaveAttribute(
		"aria-pressed",
		"true",
	);

	await page.getByTestId("instructions-agents-mode-source").click();
	await expect(page.getByTestId("instructions-agents-text")).toHaveValue(
		"# Team rules\n\n- Be kind",
	);
	await expect(page.getByTestId("instructions-agents-save")).toBeEnabled();
});

test("explanations live behind an info icon that opens on hover and pins on click", async ({
	page,
}) => {
	await openFixtureProject(page);
	await openSettingsSection(page, "instructions");

	const hint = page.getByTestId("instructions-agents-hint");
	const content = page.getByTestId("instructions-agents-hint-content");
	await expect(content).toHaveCount(0);
	await hint.hover();
	await expect(content).toContainText("AGENTS.md");
	await page.getByTestId("instructions-agents-text").hover();
	await expect(content).toHaveCount(0);

	await hint.click();
	await page.getByTestId("instructions-agents-text").hover();
	await expect(content).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(content).toHaveCount(0);
	await expect(page.getByTestId("instructions-agents-path")).toHaveAccessibleName(AGENTS);
});
