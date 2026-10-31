import { createHash } from "node:crypto";
import { once } from "node:events";
import { createWriteStream } from "node:fs";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { finished } from "node:stream/promises";
import type { SpeechFailure } from "@thinkrail/contracts";
import type { CatalogModel } from "./catalog";

export const READY_MARKER = "ready.json";

export class DownloadFailure extends Error {
	readonly failure: SpeechFailure;

	constructor(failure: SpeechFailure, message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "DownloadFailure";
		this.failure = failure;
	}
}

export interface DownloadModelInput {
	model: CatalogModel;
	/** Final directory; bytes are staged in a sibling `.partial` directory and renamed on success. */
	dir: string;
	fetch: typeof fetch;
	signal: AbortSignal;
	onProgress: (downloadedBytes: number) => void;
}

/** Fetch every catalog file, verify size and SHA-256, then publish the directory atomically. */
export async function downloadModel(input: DownloadModelInput): Promise<void> {
	const { model, dir, signal } = input;
	const staging = `${dir}.partial`;
	let done = 0;
	try {
		await rm(staging, { recursive: true, force: true });
		await mkdir(staging, { recursive: true });
		for (const file of model.files) {
			const response = await input
				.fetch(`${model.baseUrl}/${file.name}`, { signal })
				.catch((error) => {
					throw networkFailure(error, signal);
				});
			if (!response.ok || !response.body)
				throw new DownloadFailure("network", `${file.name}: HTTP ${response.status}`);
			const hash = createHash("sha256");
			let received = 0;
			try {
				await saveStream(response.body, join(staging, file.name), (chunk) => {
					hash.update(chunk);
					received += chunk.length;
					input.onProgress(done + received);
				});
			} catch (error) {
				throw signal.aborted ? error : classifyStreamError(error);
			}
			if (received !== file.size || hash.digest("hex") !== file.sha256)
				throw new DownloadFailure("integrity", `${file.name}: size or checksum mismatch`);
			done += file.size;
		}
		await writeFile(join(staging, READY_MARKER), `${JSON.stringify({ id: model.id })}\n`);
		await rm(dir, { recursive: true, force: true });
		await rename(staging, dir);
	} catch (error) {
		await rm(staging, { recursive: true, force: true });
		if (error instanceof DownloadFailure || signal.aborted) throw error;
		throw new DownloadFailure("disk", errorMessage(error), { cause: error });
	}
}

function networkFailure(error: unknown, signal: AbortSignal): unknown {
	return signal.aborted
		? error
		: new DownloadFailure("network", errorMessage(error), { cause: error });
}

function classifyStreamError(error: unknown): DownloadFailure {
	const code = (error as NodeJS.ErrnoException | undefined)?.code;
	const disk = typeof code === "string" && /^E(NOSPC|ACCES|PERM|ROFS|DQUOT|IO)$/.test(code);
	return new DownloadFailure(disk ? "disk" : "network", errorMessage(error), { cause: error });
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

async function saveStream(
	body: ReadableStream<Uint8Array>,
	path: string,
	onChunk: (chunk: Uint8Array) => void,
): Promise<void> {
	const out = createWriteStream(path);
	const failed = new Promise<never>((_resolve, reject) => out.once("error", reject));
	failed.catch(() => {});
	const reader = body.getReader();
	try {
		for (;;) {
			const { done, value } = await Promise.race([reader.read(), failed]);
			if (done) break;
			onChunk(value);
			if (!out.write(value)) await Promise.race([once(out, "drain"), failed]);
		}
		out.end();
		await Promise.race([finished(out), failed]);
	} catch (error) {
		out.destroy();
		await reader.cancel().catch(() => {});
		throw error;
	}
}
