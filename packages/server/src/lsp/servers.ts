import { createHash } from "node:crypto";
import {
	accessSync,
	constants,
	existsSync,
	readdirSync,
	readFileSync,
	realpathSync,
	statSync,
} from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { delimiter, dirname, join, relative, resolve, sep } from "node:path";
import type { LspCatalogEntry } from "@thinkrail/contracts";
import { dataDir } from "../persistence";

/** How to start one language server for one project root. */
export interface Launch {
	command: string;
	args: string[];
	/** Sent in `initialize` and answered to `workspace/configuration`. */
	initialization?: Record<string, unknown>;
	/** For servers that load a whole project before they answer `initialize`. */
	initializeTimeoutMs?: number;
	/** Added to the process environment; a server's own `env` setting wins over it. */
	env?: Record<string, string>;
	/** Turns what a server that died said on stderr into the reason, when it can. */
	explain?: (stderr: string) => string | undefined;
}

export interface ServerDefinition {
	id: string;
	name: string;
	extensions: readonly string[];
	/** The executable looked up; shown in Settings. */
	binary: string;
	install: string;
	/** Files whose directory is the project root, nearest to the opened file first. */
	roots: readonly string[];
	/** A file that makes this server the wrong one for a project (deno.json for TypeScript). */
	exclude?: readonly string[];
	/** Use the workspace itself when no root marker is found. */
	rootFallback: boolean;
	/** Take the outermost directory with a marker instead of the nearest (multi-module builds). */
	outermost?: boolean;
	launch(binary: string, root: string): Launch;
}

const WINDOWS = process.platform === "win32";

function isExecutable(path: string): boolean {
	try {
		if (!statSync(path).isFile()) return false;
		if (!WINDOWS) accessSync(path, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

/** The executable `name` on `PATH`, with the extensions Windows adds. */
export function which(name: string, env: NodeJS.ProcessEnv = process.env): string | null {
	if (name.includes("/") || name.includes("\\")) return isExecutable(name) ? name : null;
	const extensions = WINDOWS ? (env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";") : [""];
	for (const directory of (env.PATH ?? "").split(delimiter)) {
		if (!directory) continue;
		for (const extension of extensions) {
			const candidate = join(directory, name + extension);
			if (isExecutable(candidate)) return candidate;
		}
	}
	return null;
}

/** A project's own copy first (`node_modules/.bin`), then `PATH`. */
export function findBinary(name: string, directories: readonly string[]): string | null {
	for (const directory of directories) {
		const local = which(join(directory, "node_modules", ".bin", name));
		if (local) return local;
	}
	return which(name);
}

function nodePackage(root: string, specifier: string): string | null {
	try {
		return createRequire(join(root, "package.json")).resolve(specifier);
	} catch {
		return null;
	}
}

function pythonPath(root: string): string | undefined {
	for (const venv of [process.env.VIRTUAL_ENV, join(root, ".venv"), join(root, "venv")]) {
		if (!venv) continue;
		const python = WINDOWS ? join(venv, "Scripts", "python.exe") : join(venv, "bin", "python");
		if (existsSync(python)) return python;
	}
	return undefined;
}

function versionParts(name: string): number[] {
	return name.split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
}

function newerVersion(a: string, b: string): number {
	const left = versionParts(a);
	const right = versionParts(b);
	for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
		const delta = (left[index] ?? 0) - (right[index] ?? 0);
		if (delta !== 0) return delta;
	}
	return 0;
}

/**
 * The newest Lombok jar a Maven or Gradle build has already downloaded. Spring Boot projects lean on
 * Lombok, and without its agent the Java server reports errors for every generated getter.
 */
export function findLombok(home: string = homedir()): string | null {
	const found: { version: string; path: string }[] = [];
	const collect = (directory: string, jarIn: (version: string) => string[]) => {
		let versions: string[];
		try {
			versions = readdirSync(directory);
		} catch {
			return;
		}
		for (const version of versions)
			for (const candidate of jarIn(version))
				if (existsSync(candidate)) found.push({ version, path: candidate });
	};
	const maven = join(home, ".m2", "repository", "org", "projectlombok", "lombok");
	collect(maven, (version) => [join(maven, version, `lombok-${version}.jar`)]);
	const gradle = join(
		home,
		".gradle",
		"caches",
		"modules-2",
		"files-2.1",
		"org.projectlombok",
		"lombok",
	);
	collect(gradle, (version) => {
		try {
			return readdirSync(join(gradle, version)).map((hash) =>
				join(gradle, version, hash, `lombok-${version}.jar`),
			);
		} catch {
			return [];
		}
	});
	found.sort((a, b) => newerVersion(b.version, a.version));
	return found[0]?.path ?? null;
}

export interface Jdk {
	home: string;
	major: number;
}

function jdkMajor(home: string): number | null {
	try {
		const release = readFileSync(join(home, "release"), "utf8");
		const version = /^JAVA_VERSION="?([^"\n]+)"?/m.exec(release)?.[1];
		if (!version) return null;
		const parts = version.split(".");
		const major = Number.parseInt(parts[0] === "1" ? (parts[1] ?? "") : (parts[0] ?? ""), 10);
		return Number.isFinite(major) ? major : null;
	} catch {
		return null;
	}
}

function subdirectories(directory: string): string[] {
	try {
		return readdirSync(directory).map((name) => join(directory, name));
	} catch {
		return [];
	}
}

/** The JDKs found in the places they are usually installed, newest first. */
export function findJdks(home: string = homedir(), env: NodeJS.ProcessEnv = process.env): Jdk[] {
	const candidates = [
		...(env.JAVA_HOME ? [env.JAVA_HOME] : []),
		...subdirectories("/Library/Java/JavaVirtualMachines").map((jvm) =>
			join(jvm, "Contents", "Home"),
		),
		...["/opt/homebrew/opt", "/usr/local/opt"].flatMap((prefix) =>
			subdirectories(prefix)
				.filter((path) => /\/openjdk(@\d+)?$/.test(path))
				.map((path) => join(path, "libexec", "openjdk.jdk", "Contents", "Home")),
		),
		...subdirectories("/usr/lib/jvm"),
		...subdirectories(join(home, ".sdkman", "candidates", "java")),
		...subdirectories(join(home, ".asdf", "installs", "java")),
		...subdirectories(join(home, ".jdks")),
	];
	const seen = new Set<string>();
	const found: Jdk[] = [];
	for (const candidate of candidates) {
		let real: string;
		try {
			real = realpathSync(candidate);
		} catch {
			continue;
		}
		if (seen.has(real)) continue;
		seen.add(real);
		const major = jdkMajor(real);
		if (major !== null) found.push({ home: real, major });
	}
	return found.sort((a, b) => b.major - a.major);
}

/**
 * jdtls runs on its own JVM, separate from the JDK a project builds with, and recent versions need a
 * recent one. `JAVA_HOME` usually names the project's (often older) JDK, so the newest JDK found is
 * used to run the server; it can still analyse code written for an older language level.
 */
export function explainJdtlsExit(stderr: string, jdk: Jdk | undefined): string | undefined {
	const logPath = /log file\s+(\S+?\.log)/.exec(stderr)?.[1];
	if (!logPath) return undefined;
	let log: string;
	try {
		log = readFileSync(logPath, "utf8").slice(0, 65_536);
	} catch {
		return undefined;
	}
	const needed = [...log.matchAll(/osgi\.ee=JavaSE\)\(version=(\d+)/g)].map((match) =>
		Number.parseInt(match[1] ?? "", 10),
	);
	if (needed.length === 0) return undefined;
	const required = Math.max(...needed);
	return jdk
		? `Eclipse JDT LS needs JDK ${required} or newer to run; the newest JDK found is ${jdk.major} (${jdk.home})`
		: `Eclipse JDT LS needs JDK ${required} or newer to run, and no JDK was found`;
}

/** jdtls keeps its index and metadata per project, outside the project, under the host's data folder. */
export function jdtlsDataDir(root: string): string {
	return join(
		dataDir(),
		"lsp",
		"jdtls",
		createHash("sha1").update(root).digest("hex").slice(0, 16),
	);
}

const plain =
	(args: string[] = []) =>
	(binary: string): Launch => ({ command: binary, args });

export const SERVER_CATALOG: readonly ServerDefinition[] = [
	{
		id: "typescript",
		name: "TypeScript / JavaScript",
		extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"],
		binary: "typescript-language-server",
		install: "npm install -g typescript-language-server typescript",
		roots: ["package-lock.json", "bun.lockb", "bun.lock", "pnpm-lock.yaml", "yarn.lock"],
		exclude: ["deno.json", "deno.jsonc"],
		rootFallback: true,
		launch(binary, root) {
			const tsserver = nodePackage(root, "typescript/lib/tsserver.js");
			return {
				command: binary,
				args: ["--stdio"],
				...(tsserver ? { initialization: { tsserver: { path: tsserver } } } : {}),
			};
		},
	},
	{
		id: "java",
		name: "Java (Eclipse JDT LS)",
		extensions: [".java"],
		binary: "jdtls",
		install:
			"brew install jdtls (it needs a recent JDK; PiDeck runs it on the newest one it finds), or put the jdtls script of Eclipse JDT LS on your PATH",
		roots: [
			"pom.xml",
			"settings.gradle",
			"settings.gradle.kts",
			"build.gradle",
			"build.gradle.kts",
			".project",
		],
		outermost: true,
		rootFallback: false,
		launch(binary, root) {
			const lombok = findLombok();
			const jdk = findJdks()[0];
			return {
				command: binary,
				args: [...(lombok ? [`--jvm-arg=-javaagent:${lombok}`] : []), "-data", jdtlsDataDir(root)],
				initializeTimeoutMs: 120_000,
				...(jdk ? { env: { JAVA_HOME: jdk.home } } : {}),
				explain: (stderr) => explainJdtlsExit(stderr, jdk),
			};
		},
	},
	{
		id: "python",
		name: "Python (Pyright)",
		extensions: [".py", ".pyi"],
		binary: "pyright-langserver",
		install: "npm install -g pyright",
		roots: [
			"pyproject.toml",
			"setup.py",
			"setup.cfg",
			"requirements.txt",
			"Pipfile",
			"pyrightconfig.json",
		],
		rootFallback: true,
		launch(binary, root) {
			const python = pythonPath(root);
			return {
				command: binary,
				args: ["--stdio"],
				...(python ? { initialization: { pythonPath: python } } : {}),
			};
		},
	},
	{
		id: "go",
		name: "Go (gopls)",
		extensions: [".go"],
		binary: "gopls",
		install: "go install golang.org/x/tools/gopls@latest",
		roots: ["go.work", "go.mod", "go.sum"],
		rootFallback: false,
		launch: plain(),
	},
	{
		id: "rust",
		name: "Rust (rust-analyzer)",
		extensions: [".rs"],
		binary: "rust-analyzer",
		install: "rustup component add rust-analyzer",
		roots: ["Cargo.toml", "Cargo.lock"],
		rootFallback: false,
		launch: plain(),
	},
	{
		id: "clangd",
		name: "C / C++ (clangd)",
		extensions: [".c", ".cc", ".cpp", ".cxx", ".h", ".hh", ".hpp", ".hxx", ".m", ".mm"],
		binary: "clangd",
		install: "Install clangd with your package manager (for example `brew install llvm`)",
		roots: ["compile_commands.json", "compile_flags.txt", ".clangd", "CMakeLists.txt", "Makefile"],
		rootFallback: true,
		launch: plain(["--background-index"]),
	},
	{
		id: "json",
		name: "JSON",
		extensions: [".json", ".jsonc"],
		binary: "vscode-json-language-server",
		install: "npm install -g vscode-langservers-extracted",
		roots: ["package.json"],
		rootFallback: true,
		launch: plain(["--stdio"]),
	},
	{
		id: "css",
		name: "CSS / SCSS / Less",
		extensions: [".css", ".scss", ".less"],
		binary: "vscode-css-language-server",
		install: "npm install -g vscode-langservers-extracted",
		roots: ["package.json"],
		rootFallback: true,
		launch: plain(["--stdio"]),
	},
	{
		id: "html",
		name: "HTML",
		extensions: [".html", ".htm"],
		binary: "vscode-html-language-server",
		install: "npm install -g vscode-langservers-extracted",
		roots: ["package.json"],
		rootFallback: true,
		launch: plain(["--stdio"]),
	},
	{
		id: "yaml",
		name: "YAML",
		extensions: [".yaml", ".yml"],
		binary: "yaml-language-server",
		install: "npm install -g yaml-language-server",
		roots: [],
		rootFallback: true,
		launch: plain(["--stdio"]),
	},
	{
		id: "bash",
		name: "Bash",
		extensions: [".sh", ".bash", ".zsh"],
		binary: "bash-language-server",
		install: "npm install -g bash-language-server",
		roots: [],
		rootFallback: true,
		launch: plain(["start"]),
	},
	{
		id: "lua",
		name: "Lua",
		extensions: [".lua"],
		binary: "lua-language-server",
		install:
			"Install lua-language-server with your package manager (for example `brew install lua-language-server`)",
		roots: [".luarc.json", ".luarc.jsonc", ".stylua.toml", "stylua.toml"],
		rootFallback: true,
		launch: plain(),
	},
	{
		id: "zig",
		name: "Zig (zls)",
		extensions: [".zig", ".zon"],
		binary: "zls",
		install: "Install zls with your package manager (for example `brew install zls`)",
		roots: ["build.zig"],
		rootFallback: true,
		launch: plain(),
	},
	{
		id: "swift",
		name: "Swift (sourcekit-lsp)",
		extensions: [".swift"],
		binary: "sourcekit-lsp",
		install: "Install the Swift toolchain (sourcekit-lsp ships with it)",
		roots: ["Package.swift"],
		rootFallback: true,
		launch: plain(),
	},
	{
		id: "ruby",
		name: "Ruby (ruby-lsp)",
		extensions: [".rb", ".rake", ".gemspec"],
		binary: "ruby-lsp",
		install: "gem install ruby-lsp",
		roots: ["Gemfile"],
		rootFallback: true,
		launch: plain(),
	},
	{
		id: "php",
		name: "PHP (Intelephense)",
		extensions: [".php"],
		binary: "intelephense",
		install: "npm install -g intelephense",
		roots: ["composer.json", "composer.lock"],
		rootFallback: true,
		launch: plain(["--stdio"]),
	},
];

export function serverDefinition(id: string): ServerDefinition | undefined {
	return SERVER_CATALOG.find((definition) => definition.id === id);
}

export function catalogEntries(): LspCatalogEntry[] {
	return SERVER_CATALOG.map((definition) => ({
		id: definition.id,
		name: definition.name,
		extensions: [...definition.extensions],
		binary: definition.binary,
		available: which(definition.binary) !== null,
		install: definition.install,
	}));
}

/**
 * The project root a language server should run in for `file`: the nearest directory, walking up to
 * the workspace, that holds one of the server's root markers. `null` when the server does not apply.
 */
export function findProjectRoot(
	definition: Pick<ServerDefinition, "roots" | "exclude" | "rootFallback" | "outermost">,
	file: string,
	directory: string,
): string | null {
	const top = resolve(directory);
	const inside = (path: string) => {
		const rel = relative(top, path);
		return rel === "" || (!rel.startsWith("..") && !rel.includes(`${sep}..`));
	};
	let current = dirname(resolve(file));
	const walk: string[] = [];
	while (inside(current)) {
		walk.push(current);
		const parent = dirname(current);
		if (parent === current) break;
		current = parent;
	}
	if (definition.exclude?.some((marker) => walk.some((dir) => existsSync(join(dir, marker)))))
		return null;
	const marked = walk.filter((dir) =>
		definition.roots.some((marker) => existsSync(join(dir, marker))),
	);
	const root = definition.outermost ? marked.at(-1) : marked[0];
	if (root) return root;
	return definition.rootFallback ? top : null;
}
