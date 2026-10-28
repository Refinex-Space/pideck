import manifest from "./generated/manifest.json";

type Associations = Readonly<Record<string, string>>;
interface IconVariants {
	dark: string;
	light: string;
}

function lookup(map: Associations, key: string): string | undefined {
	return Object.hasOwn(map, key) ? map[key] : undefined;
}

function namedIcon(path: string, normal: Associations, light: Associations): IconVariants | null {
	for (let suffix = path; suffix; ) {
		const dark = lookup(normal, suffix);
		if (dark) return { dark, light: lookup(light, suffix) ?? dark };
		const slash = suffix.indexOf("/");
		if (slash < 0) break;
		suffix = suffix.slice(slash + 1);
	}
	return null;
}

function normalize(path: string): string {
	return path.replaceAll("\\", "/").replace(/\/+$/, "").toLowerCase();
}

export function resolveFileIcon(path: string): IconVariants | null {
	const normalized = normalize(path);
	const named = namedIcon(normalized, manifest.fileNames, manifest.light.fileNames);
	if (named) return named;
	const name = normalized.slice(normalized.lastIndexOf("/") + 1);
	for (let dot = name.indexOf("."); dot >= 0; dot = name.indexOf(".", dot + 1)) {
		const extension = name.slice(dot + 1);
		const dark = lookup(manifest.fileExtensions, extension);
		if (dark) return { dark, light: lookup(manifest.light.fileExtensions, extension) ?? dark };
	}
	return null;
}

export function resolveFolderIcon(path: string, expanded: boolean): IconVariants | null {
	const field = expanded ? "folderNamesExpanded" : "folderNames";
	return namedIcon(normalize(path), manifest[field], manifest.light[field]);
}
