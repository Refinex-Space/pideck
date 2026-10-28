#!/usr/bin/env bun
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, join } from "node:path";
import { generateManifest, type Manifest } from "material-icon-theme";
import { writeOrCheck } from "./generatedFiles";

const require = createRequire(import.meta.url);
const packageRoot = dirname(require.resolve("material-icon-theme/package.json"));
const version: string = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")).version;
const manifest = generateManifest();
const fields = ["fileNames", "fileExtensions", "folderNames", "folderNamesExpanded"] as const;
const associations = (source: Manifest) =>
	Object.fromEntries(
		fields.map((field) => [
			field,
			Object.fromEntries(
				Object.entries(source[field] ?? {})
					.map(([key, value]) => [key.toLowerCase(), value])
					.sort(([a = ""], [b = ""]) => (a < b ? -1 : a > b ? 1 : 0)),
			),
		]),
	);
const normal = associations(manifest);
const light = associations(manifest.light ?? {});
const ids = [
	...new Set([...Object.values(normal), ...Object.values(light)].flatMap(Object.values)),
].sort();
const imports = ids.map((id, index) => {
	const path = manifest.iconDefinitions?.[id]?.iconPath;
	if (!path) throw new Error(`Missing icon definition: ${id}`);
	const file = basename(path);
	if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*\.svg$/.test(file))
		throw new Error(`Unexpected icon path: ${path}`);
	readFileSync(join(packageRoot, "icons", file));
	return `import icon${index} from "material-icon-theme/icons/${file}?url&no-inline";`;
});
const output = join(import.meta.dir, "../src/fileIcons/generated");
writeOrCheck({
	label: "file-icons",
	version,
	check: process.argv.includes("--check"),
	outputs: [
		{ path: join(output, "manifest.json"), content: `${JSON.stringify({ ...normal, light })}\n` },
		{
			path: join(output, "assets.ts"),
			content: `// Generated from material-icon-theme ${version}; run file-icons:generate.\n${imports.join("\n")}\n\nexport const iconAssets: Readonly<Record<string, string>> = {\n${ids.map((id, index) => `\t${JSON.stringify(id)}: icon${index},`).join("\n")}\n};\n`,
		},
		{
			path: join(import.meta.dir, "../public/file-icons.LICENSE.txt"),
			content: readFileSync(join(packageRoot, "LICENSE"), "utf8"),
		},
	],
});
