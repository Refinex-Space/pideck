import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { FileTypeIcon, FolderTypeIcon } from "./FileTypeIcon";
import { resolveFileIcon, resolveFolderIcon } from "./resolve";

describe("file icon associations", () => {
	it.each([
		["report.docx", "word"],
		["legacy.doc", "word"],
		["manual.pdf", "pdf"],
		["Main.java", "java"],
		["config.xml", "xml"],
		["pom.xml", "maven"],
		["App.tsx", "react_ts"],
		["App.jsx", "react"],
		["App.vue", "vue"],
		["main.py", "python"],
		["main.rs", "rust"],
		["main.go", "go"],
		["index.ts", "typescript"],
		["types.d.ts", "typescript-def"],
		["package.json", "nodejs"],
		["README.md", "readme"],
		["notes.md", "markdown"],
		[".gitignore", "git"],
		["Dockerfile", "docker"],
		[".env.local", "tune"],
		["C:\\work\\APP.TSX", "react_ts"],
		["repo/.config/graphqlrc", "graphql"],
	])("resolves %s as %s", (path, icon) => expect(resolveFileIcon(path)?.dark).toBe(icon));

	it("preserves upstream theme variants", () => {
		expect(resolveFileIcon("bun.lock")).toEqual({ dark: "bun", light: "bun_light" });
	});
	it.each([
		"",
		"unknown.custom-format",
		"constructor",
		"__proto__",
		"toString",
	])("falls back for %s without reading inherited properties", (path) =>
		expect(resolveFileIcon(path)).toBeNull());
});

describe("directory icon associations", () => {
	it.each([
		["src", "folder-src"],
		["docs", "folder-docs"],
		["tests", "folder-test"],
		["node_modules", "folder-node"],
		[".github", "folder-github"],
		["C:\\project\\.github\\workflows\\", "folder-gh-workflows"],
		["nested/java", "folder-java"],
		["nested/COMPONENTS", "folder-components"],
	])("pairs closed and open icons for %s", (path, icon) => {
		expect(resolveFolderIcon(path, false)?.dark).toBe(icon);
		expect(resolveFolderIcon(path, true)?.dark).toBe(`${icon}-open`);
	});
	it("uses neutral Lucide folders for unmatched directories", () => {
		for (const expanded of [false, true]) {
			expect(resolveFolderIcon("my-unmatched-folder", expanded)).toBeNull();
			const html = renderToStaticMarkup(FolderTypeIcon({ path: "my-unmatched-folder", expanded }));
			expect(html).toContain(`data-file-icon="${expanded ? "folder-open" : "folder"}"`);
			expect(html).toContain('aria-hidden="true"');
		}
	});
	it("keeps file imagery decorative and non-draggable", () => {
		const html = renderToStaticMarkup(FileTypeIcon({ path: "App.vue" }));
		expect(html).toContain('data-file-icon="vue"');
		expect(html).toContain('alt=""');
		expect(html).toContain('draggable="false"');
		expect(html).not.toContain("https://");
	});
});
