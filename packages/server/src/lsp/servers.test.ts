import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { languageIdFor } from "./languages";
import {
	catalogEntries,
	explainJdtlsExit,
	findBinary,
	findJdks,
	findLombok,
	findProjectRoot,
	jdtlsDataDir,
	SERVER_CATALOG,
	serverDefinition,
	which,
} from "./servers";

function tree(files: string[]): string {
	const dir = realpathSync(mkdtempSync(join(tmpdir(), "lsp-servers-")));
	for (const file of files) {
		mkdirSync(join(dir, file, ".."), { recursive: true });
		writeFileSync(join(dir, file), "");
	}
	return dir;
}

test("the catalog has unique ids and well-formed extensions", () => {
	expect(new Set(SERVER_CATALOG.map((definition) => definition.id)).size).toBe(
		SERVER_CATALOG.length,
	);
	for (const definition of SERVER_CATALOG) {
		expect(definition.extensions.length).toBeGreaterThan(0);
		for (const extension of definition.extensions) expect(extension).toMatch(/^\.[A-Za-z0-9+_-]+$/);
		expect(definition.binary).not.toBe("");
		expect(definition.install).not.toBe("");
		expect(serverDefinition(definition.id)).toBe(definition);
	}
	const entries = catalogEntries();
	expect(entries.map((entry) => entry.id)).toEqual(
		SERVER_CATALOG.map((definition) => definition.id),
	);
	expect(entries.every((entry) => typeof entry.available === "boolean")).toBe(true);
});

test("which finds an executable on PATH, by path, and nothing that is not", () => {
	expect(which("sh")).not.toBeNull();
	expect(which(process.execPath)).toBe(process.execPath);
	expect(which("definitely-not-a-real-binary-xyz")).toBeNull();
	expect(which("sh", { PATH: "" })).toBeNull();
});

test("a project's own node_modules/.bin wins over PATH", () => {
	const dir = tree(["node_modules/.bin/mytool"]);
	try {
		expect(findBinary("mytool", [dir])).toBeNull();
		const bin = join(dir, "node_modules", ".bin", "mytool");
		require("node:fs").chmodSync(bin, 0o755);
		expect(findBinary("mytool", [dir])).toBe(bin);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("the project root is the nearest marker up to the workspace, with the right fallbacks", () => {
	const dir = tree([
		"go.mod",
		"svc/go.mod",
		"svc/cmd/main.go",
		"top.go",
		"web/deno.json",
		"web/a.ts",
	]);
	try {
		const go = serverDefinition("go");
		const typescript = serverDefinition("typescript");
		if (!go || !typescript) throw new Error("catalog");
		expect(findProjectRoot(go, join(dir, "svc/cmd/main.go"), dir)).toBe(join(dir, "svc"));
		expect(findProjectRoot(go, join(dir, "top.go"), dir)).toBe(dir);
		expect(findProjectRoot(go, join(tmpdir(), "elsewhere.go"), dir)).toBeNull();
		expect(
			findProjectRoot({ roots: ["nothing"], rootFallback: false }, join(dir, "top.go"), dir),
		).toBeNull();
		expect(
			findProjectRoot({ roots: ["nothing"], rootFallback: true }, join(dir, "top.go"), dir),
		).toBe(dir);
		expect(findProjectRoot(typescript, join(dir, "web/a.ts"), dir)).toBeNull();
		expect(findProjectRoot(typescript, join(dir, "top.go"), dir)).toBe(dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("a file's language id follows its extension", () => {
	expect(languageIdFor("/a/b.tsx")).toBe("typescriptreact");
	expect(languageIdFor("x.PY")).toBe("python");
	expect(languageIdFor("Dockerfile")).toBe("dockerfile");
	expect(languageIdFor("README")).toBe("plaintext");
	expect(languageIdFor("unknown.xyz")).toBe("xyz");
});

test("Java is built in and takes the outermost build file, so a multi-module build is one project", () => {
	const java = serverDefinition("java");
	if (!java) throw new Error("catalog");
	expect(java.extensions).toEqual([".java"]);
	expect(catalogEntries().find((entry) => entry.id === "java")).toMatchObject({
		name: "Java (Eclipse JDT LS)",
		binary: "jdtls",
	});
	const reactor = tree(["pom.xml", "api/pom.xml", "api/src/main/java/A.java"]);
	const single = tree(["app/build.gradle.kts", "app/src/B.java", "loose/C.java"]);
	try {
		expect(findProjectRoot(java, join(reactor, "api/src/main/java/A.java"), reactor)).toBe(reactor);
		expect(findProjectRoot(java, join(single, "app/src/B.java"), single)).toBe(join(single, "app"));
		expect(findProjectRoot(java, join(single, "loose/C.java"), single)).toBeNull();
	} finally {
		rmSync(reactor, { recursive: true, force: true });
		rmSync(single, { recursive: true, force: true });
	}
});

test("jdtls starts with a data folder of its own per project, under the host's data folder", () => {
	const java = serverDefinition("java");
	if (!java) throw new Error("catalog");
	const saved = process.env.THINKRAIL_DATA_DIR;
	const data = realpathSync(mkdtempSync(join(tmpdir(), "lsp-jdtls-")));
	process.env.THINKRAIL_DATA_DIR = data;
	try {
		const launch = java.launch("/opt/bin/jdtls", "/work/shop");
		expect(launch.command).toBe("/opt/bin/jdtls");
		expect(launch.args.slice(-2)).toEqual(["-data", jdtlsDataDir("/work/shop")]);
		expect(jdtlsDataDir("/work/shop").startsWith(join(data, "lsp", "jdtls"))).toBe(true);
		expect(jdtlsDataDir("/work/shop")).toBe(jdtlsDataDir("/work/shop"));
		expect(jdtlsDataDir("/work/other")).not.toBe(jdtlsDataDir("/work/shop"));
		for (const arg of launch.args.slice(0, -2))
			expect(arg).toMatch(/^--jvm-arg=-javaagent:.*lombok.*\.jar$/);
		expect(launch.initializeTimeoutMs).toBeGreaterThan(30_000);
		expect(launch.env?.JAVA_HOME).toBe(findJdks()[0]?.home);
		expect(launch.explain?.("nothing to explain")).toBeUndefined();
	} finally {
		if (saved === undefined) delete process.env.THINKRAIL_DATA_DIR;
		else process.env.THINKRAIL_DATA_DIR = saved;
		rmSync(data, { recursive: true, force: true });
	}
});

test("the newest Lombok a Maven or Gradle build already downloaded is the one found", () => {
	const empty = tree([]);
	const home = tree([
		".m2/repository/org/projectlombok/lombok/1.18.4/lombok-1.18.4.jar",
		".m2/repository/org/projectlombok/lombok/1.18.30/lombok-1.18.30.jar",
		".gradle/caches/modules-2/files-2.1/org.projectlombok/lombok/1.18.36/abc123/lombok-1.18.36.jar",
		".m2/repository/org/projectlombok/lombok/1.99.0/pom-only.txt",
	]);
	try {
		expect(findLombok(empty)).toBeNull();
		expect(findLombok(home)).toBe(
			join(
				home,
				".gradle/caches/modules-2/files-2.1/org.projectlombok/lombok/1.18.36/abc123/lombok-1.18.36.jar",
			),
		);
		rmSync(join(home, ".gradle"), { recursive: true, force: true });
		expect(findLombok(home)).toBe(
			join(home, ".m2/repository/org/projectlombok/lombok/1.18.30/lombok-1.18.30.jar"),
		);
	} finally {
		rmSync(empty, { recursive: true, force: true });
		rmSync(home, { recursive: true, force: true });
	}
});

function jdk(home: string, relativeDir: string, version: string): string {
	const dir = join(home, relativeDir);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "release"), `IMPLEMENTOR="Test"\nJAVA_VERSION="${version}"\n`);
	return realpathSync(dir);
}

test("JDKs are found in the usual places, read from their release file, newest first", () => {
	const home = realpathSync(mkdtempSync(join(tmpdir(), "lsp-jdks-")));
	try {
		const huge = jdk(home, ".sdkman/candidates/java/99.0.1", "99.0.1");
		const old = jdk(home, ".jdks/jdk8", "1.8.0_292");
		mkdirSync(join(home, ".jdks", "not-a-jdk"), { recursive: true });
		const viaEnv = jdk(home, "elsewhere/jdk98", "98");
		const found = findJdks(home, { JAVA_HOME: viaEnv });
		expect(found[0]).toEqual({ home: huge, major: 99 });
		expect(found[1]).toEqual({ home: viaEnv, major: 98 });
		expect(found.find((candidate) => candidate.home === old)?.major).toBe(8);
		expect(found.map((candidate) => candidate.major)).toEqual(
			[...found.map((candidate) => candidate.major)].sort((a, b) => b - a),
		);
		expect(found.some((candidate) => candidate.home.endsWith("not-a-jdk"))).toBe(false);
		expect(new Set(found.map((candidate) => candidate.home)).size).toBe(found.length);
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
});

test("a jdtls that died because its JDK is too old says which JDK it needs", () => {
	const dir = tree([]);
	try {
		const log = join(dir, "1.log");
		writeFileSync(
			log,
			'!MESSAGE x\n  Unresolved requirement: Require-Capability: osgi.ee; filter:="(&(osgi.ee=JavaSE)(version=25))"\n  osgi.ee=JavaSE)(version=21)\n',
		);
		const stderr = `An error has occurred. See the log file\n${log}.`;
		expect(explainJdtlsExit(stderr, { home: "/jdks/21", major: 21 })).toBe(
			"Eclipse JDT LS needs JDK 25 or newer to run; the newest JDK found is 21 (/jdks/21)",
		);
		expect(explainJdtlsExit(stderr, undefined)).toBe(
			"Eclipse JDT LS needs JDK 25 or newer to run, and no JDK was found",
		);
		writeFileSync(log, "something else went wrong\n");
		expect(explainJdtlsExit(stderr, undefined)).toBeUndefined();
		expect(explainJdtlsExit("no log mentioned", undefined)).toBeUndefined();
		expect(
			explainJdtlsExit(`See the log file ${join(dir, "missing.log")}`, undefined),
		).toBeUndefined();
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
