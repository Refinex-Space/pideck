import { open } from "node:fs/promises";

function element(buffer: Buffer, offset: number) {
	const idByte = buffer[offset];
	if (!idByte) throw new Error("Invalid WebM element");
	let idLength = 1;
	while (idLength <= 4 && !(idByte & (1 << (8 - idLength)))) idLength++;
	if (idLength > 4) throw new Error("Invalid WebM element id");
	const id = buffer.readUIntBE(offset, idLength);
	const sizeOffset = offset + idLength;
	const first = buffer[sizeOffset];
	if (!first) throw new Error("Invalid WebM element size");
	let sizeLength = 1;
	while (sizeLength <= 8 && !(first & (1 << (8 - sizeLength)))) sizeLength++;
	if (sizeLength > 8 || sizeOffset + sizeLength > buffer.length)
		throw new Error("Truncated WebM header");
	let value = BigInt(first & ((1 << (8 - sizeLength)) - 1));
	for (let i = 1; i < sizeLength; i++) value = (value << 8n) | BigInt(buffer[sizeOffset + i] ?? 0);
	const size = value === (1n << BigInt(7 * sizeLength)) - 1n ? null : Number(value);
	return { id, offset, data: sizeOffset + sizeLength, size };
}

export function webmDurationPatch(
	header: Buffer,
	durationMs: number,
): { offset: number; bytes: Buffer } {
	if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > 100000)
		throw new Error("Invalid recording duration");
	const ebml = element(header, 0);
	if (ebml.id !== 0x1a45dfa3 || ebml.size === null) throw new Error("Invalid WebM header");
	const segment = element(header, ebml.data + ebml.size);
	if (segment.id !== 0x18538067) throw new Error("Missing WebM segment");
	let info = element(header, segment.data);
	while (info.id !== 0x1549a966) {
		if (info.size === null || info.id === 0xbf) throw new Error("Unsupported WebM metadata");
		info = element(header, info.data + info.size);
	}
	if (info.size === null || info.data + info.size > header.length)
		throw new Error("Truncated WebM info");
	let scale: ReturnType<typeof element> | undefined;
	let duration: ReturnType<typeof element> | undefined;
	for (let offset = info.data; offset < info.data + info.size; ) {
		const field = element(header, offset);
		if (field.size === null || field.id === 0xbf) throw new Error("Unsupported WebM info");
		if (field.id === 0x2ad7b1) scale = field;
		if (field.id === 0x4489) duration = field;
		offset = field.data + field.size;
	}
	const timeScale = scale?.size ? header.readUIntBE(scale.data, scale.size) : 1000000;
	if (duration && (duration.size === 4 || duration.size === 8)) {
		const bytes = Buffer.alloc(duration.size);
		if (duration.size === 4) bytes.writeFloatBE((durationMs * 1000000) / timeScale);
		else bytes.writeDoubleBE((durationMs * 1000000) / timeScale);
		return { offset: duration.data, bytes };
	}
	if (!scale || timeScale !== 1000000 || scale.data + (scale.size ?? 0) - scale.offset !== 7)
		throw new Error("Unsupported Chromium WebM timestamp layout");
	// TimestampScale's default is 1 ms; replacing its 7 bytes keeps every cluster/seek offset intact.
	const bytes = Buffer.from([0x44, 0x89, 0x84, 0, 0, 0, 0]);
	bytes.writeFloatBE(durationMs, 3);
	return { offset: scale.offset, bytes };
}

export async function sealWebmDuration(path: string, durationMs: number): Promise<void> {
	const file = await open(path, "r+");
	try {
		const header = Buffer.alloc(64 * 1024);
		const { bytesRead } = await file.read(header, 0, header.length, 0);
		const patch = webmDurationPatch(header.subarray(0, bytesRead), durationMs);
		await file.write(patch.bytes, 0, patch.bytes.length, patch.offset);
	} finally {
		await file.close();
	}
}
