import { expect, test } from "bun:test";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { E2E_DATA_DIR, E2E_FIXTURE_REPO } from "../e2e/fixtures/paths";
import { defaultSessionDirFor } from "../packages/server/src/history/testFixtures";

test("fixture paths use the same Windows long-name spelling as Git and Pi history", () => {
	const canonicalTemp = realpathSync.native(tmpdir());
	expect(dirname(E2E_DATA_DIR)).toBe(canonicalTemp);
	const expectedRepo = join(
		canonicalTemp,
		E2E_DATA_DIR.split(/[\\/]/).at(-1) || "",
		"sample-project",
	);
	expect(defaultSessionDirFor("fixture-agent", E2E_FIXTURE_REPO)).toBe(
		defaultSessionDirFor("fixture-agent", expectedRepo),
	);
});
