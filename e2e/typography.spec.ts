import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import {
	applyWorkbenchPreset,
	createWorkspaceViaDialog,
	openAppFresh,
	openAppSettings,
	openFixtureProject,
	openSettingsSection,
	openWorkspaceChat,
	openWorkspaceMenu,
	revealWorkbenchTool,
	visibleTerminalScreen,
	waitTerminalReady,
	worktreeRows,
} from "./fixtures/app";
import { BRAND_FACE, CODE_FACE, INTERFACE_FACE } from "./fixtures/typography";

type TypeInfo = {
	family: string;
	size: string;
	weight: string;
	lineHeight: string;
	spacing: string;
	transform: string;
};

async function typeOf(locator: import("@playwright/test").Locator): Promise<TypeInfo> {
	await expect(locator).toBeVisible();
	return locator.evaluate((el) => {
		const s = getComputedStyle(el);
		return {
			family: s.fontFamily,
			size: s.fontSize,
			weight: s.fontWeight,
			lineHeight: s.lineHeight,
			spacing: s.letterSpacing,
			transform: s.textTransform,
		};
	});
}

test("welcome hero renders the generated brand style", async ({ page }) => {
	await openAppFresh(page);
	await openFixtureProject(page);
	const welcomeTitle = await typeOf(page.getByTestId("welcome-title"));
	expect(welcomeTitle).toMatchObject({ size: "32px", weight: "400", lineHeight: "40px" });
	expect(welcomeTitle.family).toMatch(BRAND_FACE);
});

test("dialog title and card title share one typography", async ({ page }) => {
	await openFixtureProject(page);
	const workspace = await createWorkspaceViaDialog(page);
	writeFileSync(
		join(workspace.worktreePath, "typography-card.md"),
		"> [!NOTE]\n> A readable note.\n",
	);
	await revealWorkbenchTool(page, "files");
	await page.getByTestId("file-node").filter({ hasText: "typography-card.md" }).dblclick();
	await expect(page.getByTestId("markdown-preview")).toContainText("A readable note.");

	const card = await typeOf(page.getByTestId("markdown-preview").locator(".tr-title-card"));

	await openAppSettings(page);
	const dialog = await typeOf(
		page.getByTestId("settings-dialog").locator(".tr-title-dialog").first(),
	);
	expect(dialog).toMatchObject({ size: "16px", weight: "600", lineHeight: "20px" });

	expect(card.size).toBe(dialog.size);
	expect(card.weight).toBe(dialog.weight);
	expect(card.lineHeight).toBe(dialog.lineHeight);
	expect(card.family).toBe(dialog.family);
});

test("entity rows, branch metadata and eyebrows are proportional", async ({ page }) => {
	await openFixtureProject(page);
	await createWorkspaceViaDialog(page);
	// The branch line only shows once the display label differs from the branch.
	const row = worktreeRows(page).first();
	await openWorkspaceMenu(row);
	await page.getByTestId("workspace-rename").click();
	const input = row.getByRole("textbox", { name: "Workspace name" });
	await input.fill("Typography Probe");
	await input.press("Enter");
	await expect(row.getByTestId("workspace-branch")).toBeVisible();
	for (const testid of ["project-item", "workspace-item", "workspace-name", "workspace-branch"]) {
		const type = await typeOf(page.getByTestId(testid).first());
		expect(type.family, `${testid} must be proportional`).toMatch(INTERFACE_FACE);
		expect(type.family, `${testid} must not be mono`).not.toMatch(CODE_FACE);
	}
	await openSettingsSection(page, "skills");
	const groupLabel = await typeOf(
		page.getByTestId("skills-settings").locator(".tr-text-emphasis").first(),
	);
	expect(groupLabel.family).toMatch(INTERFACE_FACE);
	expect(groupLabel.transform).toBe("none");
});

test("Monaco and xterm render the generated code family and size", async ({ page }) => {
	await openFixtureProject(page);
	await createWorkspaceViaDialog(page);
	await applyWorkbenchPreset(page, "Balanced");
	await revealWorkbenchTool(page, "files");
	await page.getByTestId("file-node").filter({ hasText: "notes.txt" }).first().dblclick();
	const editor = page.locator(".monaco-editor .view-lines").first();
	await expect(editor).toBeVisible({ timeout: 30_000 });
	const editorType = await typeOf(editor);
	expect(editorType.family).toMatch(CODE_FACE);
	expect(editorType.size).toBe("13px");

	await waitTerminalReady(page);
	const termType = await typeOf(visibleTerminalScreen(page));
	expect(termType.family).toMatch(CODE_FACE);
	expect(termType.size).toBe("13px");
});

test("the chat and document markdown surfaces each wear their own prose system", async ({
	page,
}) => {
	await openWorkspaceChat(page);
	await revealWorkbenchTool(page, "files");
	await page.getByTestId("file-node").filter({ hasText: "README.md" }).first().dblclick();
	await expect(page.getByTestId("markdown-preview")).toContainText("sample-project");

	const doc = page.locator(".tr-prose-doc").first();
	expect(await typeOf(doc)).toMatchObject({ size: "16px", weight: "400", lineHeight: "24px" });
	expect(await typeOf(doc.locator("h1").first())).toMatchObject({ size: "24px", weight: "600" });

	expect(await doc.evaluate((el) => el.classList.contains("tr-prose-chat"))).toBe(false);
	expect(await page.locator(".tr-prose-doc.tr-prose-chat").count()).toBe(0);
});

test("document headings are larger than document body text", async ({ page }) => {
	await openFixtureProject(page);
	await expect(page.getByTestId("welcome")).toBeVisible();

	const measured = await page.evaluate(() => {
		const host = document.createElement("div");
		host.className = "tr-prose-doc";
		host.innerHTML =
			"<h1>h1</h1><h2>h2</h2><h3>h3</h3><h4>h4</h4><h5>h5</h5><h6>h6</h6>" +
			"<p>body</p><pre><code>code</code></pre><p><code>inline</code></p>";
		document.body.appendChild(host);
		const size = (sel: string) =>
			Number.parseFloat(getComputedStyle(host.querySelector(sel) as Element).fontSize);
		const weight = (sel: string) => getComputedStyle(host.querySelector(sel) as Element).fontWeight;
		const out = {
			body: size("p"),
			h: [1, 2, 3, 4, 5, 6].map((n) => size(`h${n}`)),
			hWeight: [1, 2, 3, 4, 5, 6].map((n) => weight(`h${n}`)),
			pre: size("pre"),
			inline: size(":not(pre) > code"),
		};
		host.remove();
		return out;
	});

	expect(measured.body).toBe(16);
	expect(measured.h).toEqual([24, 22, 20, 18, 16, 12]);
	for (const [i, size] of measured.h.slice(0, 4).entries())
		expect(size, `h${i + 1} > body`).toBeGreaterThan(measured.body);
	for (let i = 1; i < measured.h.length; i++)
		expect(measured.h[i], `h${i + 1} <= h${i}`).toBeLessThanOrEqual(measured.h[i - 1] as number);
	for (const [i, w] of measured.hWeight.entries())
		expect(Number(w), `h${i + 1} weight`).toBeGreaterThanOrEqual(600);
	expect(measured.pre).toBe(13);
	expect(measured.inline).toBe(13);
});

test("the chat prose system uses the shared comfortable reading rhythm", async ({ page }) => {
	await openFixtureProject(page);
	await expect(page.getByTestId("welcome")).toBeVisible();

	const measured = await page.evaluate(() => {
		const host = document.createElement("div");
		host.className = "tr-prose-chat";
		host.innerHTML = "<h1>h1</h1><h2>h2</h2><h3>h3</h3><p>body</p><pre><code>code</code></pre>";
		document.body.appendChild(host);
		const size = (sel: string) =>
			Number.parseFloat(getComputedStyle(host.querySelector(sel) as Element).fontSize);
		const out = {
			body: size("p"),
			h1: size("h1"),
			h2: size("h2"),
			h3: size("h3"),
			pre: size("pre"),
		};
		host.remove();
		return out;
	});

	expect(measured).toEqual({ body: 16, h1: 20, h2: 16, h3: 14, pre: 13 });
});

test("typography survives a narrow mobile viewport without clipping or overflow", async ({
	page,
}) => {
	await page.setViewportSize({ width: 390, height: 780 });
	await openFixtureProject(page);
	await createWorkspaceViaDialog(page);
	await expect(page.getByTestId("center-tabs")).toBeVisible();
	const problems = await page.evaluate(() => {
		const out: string[] = [];
		for (const el of Array.from(document.querySelectorAll("*"))) {
			const style = getComputedStyle(el);
			const screenReaderOnly =
				el.classList.contains("sr-only") &&
				style.position === "absolute" &&
				el.clientWidth === 1 &&
				el.clientHeight === 1 &&
				style.clipPath === "inset(50%)";
			if (screenReaderOnly) continue;
			if (!/hidden|clip/.test(style.overflowY)) continue;
			const over = el.scrollHeight - el.clientHeight;
			if (over > 1 && el.clientHeight > 0)
				out.push(
					`${el.tagName}[${el.getAttribute("data-testid") ?? ""}] class=${el.getAttribute("class") ?? ""} box=${el.clientWidth}x${el.clientHeight} +${over}px`,
				);
		}
		if (document.documentElement.scrollWidth > window.innerWidth + 1)
			out.push(
				`document overflows: ${document.documentElement.scrollWidth} > ${window.innerWidth}`,
			);
		return out;
	});
	expect(problems).toEqual([]);
});

test("bold inside prose changes weight only — in both prose systems", async ({ page }) => {
	await openFixtureProject(page);
	await expect(page.getByTestId("welcome")).toBeVisible();

	const measured = await page.evaluate(() => {
		const read = (el: Element | null) => {
			if (!el) return null;
			const s = getComputedStyle(el);
			return {
				family: s.fontFamily,
				size: s.fontSize,
				weight: s.fontWeight,
				lineHeight: s.lineHeight,
				spacing: s.letterSpacing,
				transform: s.textTransform,
				color: s.color,
			};
		};
		const probe = (root: string) => {
			const host = document.createElement("div");
			host.className = root;
			host.innerHTML =
				"<h1>A <strong>bold</strong> title</h1>" +
				"<table><tbody><tr><td>cell <strong>bold</strong></td></tr></tbody></table>" +
				"<p>body <strong>bold</strong> text</p>" +
				"<p><em><strong>nested</strong></em></p>";
			document.body.appendChild(host);
			const out = {
				h1: read(host.querySelector("h1")),
				h1Strong: read(host.querySelector("h1 strong")),
				cell: read(host.querySelector("td")),
				cellStrong: read(host.querySelector("td strong")),
				body: read(host.querySelector("p")),
				bodyStrong: read(host.querySelector("p strong")),
				nestedStrong: read(host.querySelector("em strong")),
			};
			host.remove();
			return out;
		};
		return { chat: probe("tr-prose-chat"), doc: probe("tr-prose-doc") };
	});

	for (const [system, m] of Object.entries(measured)) {
		expect(m.h1Strong?.size, `${system} h1 strong size`).toBe(m.h1?.size);
		expect(m.h1Strong?.lineHeight, `${system} h1 strong leading`).toBe(m.h1?.lineHeight);
		expect(m.h1Strong?.weight, `${system} h1 strong weight`).toBe("600");
		expect(m.h1?.weight, `${system} h1 weight`).toBe("600");

		expect(m.cellStrong?.size, `${system} cell strong size`).toBe(m.cell?.size);
		expect(m.cellStrong?.lineHeight, `${system} cell strong leading`).toBe(m.cell?.lineHeight);
		expect(m.cellStrong?.weight, `${system} cell strong weight`).toBe("600");

		expect(m.bodyStrong?.size, `${system} body strong size`).toBe(m.body?.size);
		expect(m.bodyStrong?.lineHeight, `${system} body strong leading`).toBe(m.body?.lineHeight);
		expect(m.bodyStrong?.weight, `${system} body strong weight`).toBe("600");

		for (const key of ["family", "spacing", "transform", "color"] as const) {
			expect(m.h1Strong?.[key], `${system} h1 strong ${key}`).toBe(m.h1?.[key]);
			expect(m.cellStrong?.[key], `${system} cell strong ${key}`).toBe(m.cell?.[key]);
			expect(m.nestedStrong?.[key], `${system} nested strong ${key}`).toBe(m.body?.[key]);
		}
	}
});

test("a Tailwind utility at a call site overrides the semantic default it names", async ({
	page,
}) => {
	await openAppFresh(page);

	const measured = await page.evaluate(() => {
		const probe = (className: string) => {
			const el = document.createElement("span");
			el.className = className;
			el.textContent = "probe";
			document.body.appendChild(el);
			const s = getComputedStyle(el);
			const out = { fontStyle: s.fontStyle, fontSize: s.fontSize, lineHeight: s.lineHeight };
			el.remove();
			return out;
		};
		return {
			metadata: probe("tr-text-metadata"),
			metadataItalic: probe("tr-text-metadata italic"),
			metadataSnug: probe("tr-text-metadata leading-snug"),
			ui: probe("tr-text-ui"),
			uiTight: probe("tr-text-ui leading-tight"),
			bare: probe(""),
		};
	});

	expect(measured.metadataItalic.fontStyle).toBe("italic");
	expect(measured.metadata.fontStyle).toBe("normal");
	expect(measured.metadataItalic.fontSize).toBe(measured.metadata.fontSize);
	expect(measured.metadataItalic.lineHeight).toBe(measured.metadata.lineHeight);

	expect(measured.uiTight.lineHeight).toBe("17.5px");
	expect(measured.ui.lineHeight).toBe("20px");
	expect(measured.uiTight.fontSize).toBe(measured.ui.fontSize);

	expect(measured.metadataSnug.lineHeight).toBe("16.5px");
	expect(measured.metadataSnug.fontSize).toBe(measured.metadata.fontSize);

	expect(measured.bare.fontSize).toBe("14px");
	expect(measured.metadata.fontSize).toBe("12px");
});
