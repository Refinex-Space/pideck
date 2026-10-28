import { expect, test } from "@playwright/test";
import { CODE_FACE, INTERFACE_FACE } from "./fixtures/typography";

const FONT_CDNS = /fonts\.(googleapis|gstatic)\.com|api\.fontshare\.com|use\.typekit\.net/;

test("loads no fonts from a CDN", async ({ page }) => {
	const external: string[] = [];
	page.on("request", (r) => {
		if (FONT_CDNS.test(r.url())) external.push(r.url());
	});

	await page.goto("/");
	await expect(page.getByTestId("connection-status")).toHaveAttribute("data-status", "connected");
	await page.evaluate(() => document.fonts.ready);

	expect(external).toEqual([]);
});

test("uses system UI fonts and serves self-hosted variable code with real italics", async ({
	page,
}) => {
	await page.goto("/");
	await expect(page.getByTestId("connection-status")).toHaveAttribute("data-status", "connected");

	const fonts = await page.evaluate(async () => {
		await document.fonts.ready;
		return {
			faces: Array.from(document.fonts).map((f) => ({
				family: f.family,
				weight: f.weight,
				style: f.style,
			})),
			bodyFamily: getComputedStyle(document.body).fontFamily,
		};
	});

	for (const family of [CODE_FACE]) {
		const faces = fonts.faces.filter((f) => f.family === family);
		expect(faces.length, `${family} is declared`).toBeGreaterThan(0);
		expect(
			faces.some(
				(f) => f.style === "normal" && /^\d+ \d+$/.test(f.weight) && weightCovers(f.weight, 800),
			),
			`${family} covers weight 800 as a variable range`,
		).toBe(true);
		expect(
			faces.some((f) => f.style === "italic"),
			`${family} ships an italic face`,
		).toBe(true);
	}

	expect(fonts.bodyFamily).toContain(INTERFACE_FACE);
	expect(INTERFACE_FACE).toBe("system-ui");
	expect(fonts.faces.some((face) => face.family === INTERFACE_FACE)).toBe(false);
	expect(fonts.faces.some((face) => /Geist|Orbitron/.test(face.family))).toBe(false);
});

function weightCovers(range: string, target: number): boolean {
	const [min, max] = range.split(" ").map(Number);
	return min !== undefined && max !== undefined && min <= target && target <= max;
}
