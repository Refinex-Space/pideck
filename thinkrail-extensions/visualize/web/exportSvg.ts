const MAX_SIDE = 8192;

export interface SvgSize {
	width: number;
	height: number;
}

/** The drawing's natural size, from the root `viewBox` (Mermaid sizes its SVG `width="100%"`). */
export function svgSize(svg: string): SvgSize | null {
	const root = /<svg\b[^>]*>/.exec(svg)?.[0];
	const box = root && /\bviewBox\s*=\s*"([^"]+)"/.exec(root)?.[1];
	if (!box) return null;
	const [, , width, height] = box
		.trim()
		.split(/[\s,]+/)
		.map(Number);
	return width && height && width > 0 && height > 0 ? { width, height } : null;
}

/** Pins the root element to pixel dimensions so an `<img>` rasterises it at its natural size. */
export function withPixelSize(svg: string, { width, height }: SvgSize): string {
	return svg.replace(/<svg\b[^>]*>/, (root) => {
		const bare = root
			.replace(/\s(?:width|height)\s*=\s*"[^"]*"/g, "")
			.replace(/\sstyle\s*=\s*"[^"]*"/, "");
		return `${bare.slice(0, -1)} width="${width}" height="${height}">`;
	});
}

export function exportName(title: string | undefined): string {
	const base = (title ?? "").replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "");
	return base || "diagram";
}

function loadImage(url: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error("svg image failed to load"));
		image.src = url;
	});
}

/** A PNG of the diagram on `background` (transparent when empty), at up to 2x. Rejects where the browser taints the canvas. */
export async function svgToPng(svg: string, background: string): Promise<Blob> {
	const size = svgSize(svg);
	if (!size) throw new Error("svg has no viewBox");
	const scale = Math.min(2, MAX_SIDE / size.width, MAX_SIDE / size.height);
	const markup = withPixelSize(svg, size);
	const image = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`);
	const canvas = document.createElement("canvas");
	canvas.width = Math.round(size.width * scale);
	canvas.height = Math.round(size.height * scale);
	const context = canvas.getContext("2d");
	if (!context) throw new Error("no 2d context");
	if (background) {
		context.fillStyle = background;
		context.fillRect(0, 0, canvas.width, canvas.height);
	}
	context.drawImage(image, 0, 0, canvas.width, canvas.height);
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => (blob ? resolve(blob) : reject(new Error("png encode failed"))),
			"image/png",
		);
	});
}

export function saveBlob(blob: Blob, fileName: string): void {
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = fileName;
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Saves the diagram as PNG; where rasterising is blocked it saves the SVG itself instead. */
export async function downloadDiagram(svg: string, title: string | undefined): Promise<void> {
	const name = exportName(title);
	const background = getComputedStyle(document.documentElement)
		.getPropertyValue("--container-workspace-bg")
		.trim();
	try {
		saveBlob(await svgToPng(svg, background), `${name}.png`);
	} catch {
		saveBlob(new Blob([svg], { type: "image/svg+xml" }), `${name}.svg`);
	}
}
