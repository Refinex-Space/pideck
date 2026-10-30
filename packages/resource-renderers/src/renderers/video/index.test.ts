import { expect, test } from "bun:test";
import { registerResourceRenderer, resolveRenderers } from "../../registry";
import { binaryRenderer } from "../binary";
import { videoRenderer } from ".";

test("recording artifacts open in a video player; file diffs retain the binary renderer", () => {
	const dispose = [binaryRenderer, videoRenderer].map(registerResourceRenderer);
	try {
		const resource = { workspaceId: "ws", path: ".thinkrail/browser/demo.webm", text: false };
		expect(
			resolveRenderers(resource, "view", { mobile: false }).map((renderer) => renderer.id),
		).toEqual(["thinkrail/video", "thinkrail/binary"]);
		expect(resolveRenderers(resource, "view", { mobile: true })[0]?.id).toBe("thinkrail/video");
		expect(
			resolveRenderers(resource, "diff", { mobile: false }).map((renderer) => renderer.id),
		).toEqual(["thinkrail/binary"]);
	} finally {
		for (const remove of dispose.reverse()) remove();
	}
});
