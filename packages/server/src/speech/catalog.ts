import type { SpeechLanguage } from "@thinkrail/contracts";

export interface CatalogFile {
	name: string;
	size: number;
	sha256: string;
}

export interface CatalogModel {
	id: string;
	name: string;
	languages: SpeechLanguage[];
	/** Files are fetched from `${baseUrl}/${name}`; the revision in the URL pins the exact bytes. */
	baseUrl: string;
	files: CatalogFile[];
}

const SOURCE = "https://huggingface.co/csukuangfj";

/**
 * Closed list of streaming zipformer transducers (Apache-2.0) for the sherpa-onnx runtime. PiDeck never
 * bundles them: the user downloads one, and every file is checked against the size and SHA-256 below.
 */
export const SPEECH_CATALOG: readonly CatalogModel[] = [
	{
		id: "zipformer-en-20m",
		name: "Zipformer English (20M)",
		languages: ["en"],
		baseUrl: `${SOURCE}/sherpa-onnx-streaming-zipformer-en-20M-2023-02-17/resolve/d42f2d9f7ca24806fb667456a18a9f1b60f70d16`,
		files: [
			{
				name: "encoder-epoch-99-avg-1.int8.onnx",
				size: 42_845_182,
				sha256: "3810755ce7c3ab26b42a8bcf39d191308fa27fb0f53358823ba46141d03b7eb3",
			},
			{
				name: "decoder-epoch-99-avg-1.int8.onnx",
				size: 539_499,
				sha256: "21e2a2acd961b3ac72f55be2f10f1a285e1b0b0ba010d7c0b6eab141411b163c",
			},
			{
				name: "joiner-epoch-99-avg-1.int8.onnx",
				size: 259_572,
				sha256: "e085d73b593cf9b0707f370dbd656d58327d3fe36d80d849202ef81df02cb01e",
			},
			{
				name: "tokens.txt",
				size: 5_048,
				sha256: "49e3c2646595fd907228b3c6787069658f67b17377c60aeb8619c4551b2316fb",
			},
		],
	},
	{
		id: "zipformer-zh-en",
		name: "Zipformer Chinese + English",
		languages: ["zh", "en"],
		baseUrl: `${SOURCE}/sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20/resolve/98590b7ed6443e77b714204da2757d75e1a642f4`,
		files: [
			{
				name: "encoder-epoch-99-avg-1.int8.onnx",
				size: 181_895_032,
				sha256: "8fa764187a261844f859d7143ebaa563af5d10adfece4c18a8f414c88cba2a9b",
			},
			{
				name: "decoder-epoch-99-avg-1.int8.onnx",
				size: 13_091_040,
				sha256: "1a70c593d71e53f023f5f55b0b4cfff5055abb786ee3992e5f63dc2e273cc4fa",
			},
			{
				name: "joiner-epoch-99-avg-1.int8.onnx",
				size: 3_228_404,
				sha256: "1ed689c5ed19dbaa725d9d191bb4822b5f4855a39e1ffd28cbc1f340d25b2ee0",
			},
			{
				name: "tokens.txt",
				size: 56_317,
				sha256: "a8e0e4ec53810e433789b54a5c0134a7eaa2ffca595a6334d54c00da858841d3",
			},
		],
	},
];

export const modelBytes = (model: CatalogModel): number =>
	model.files.reduce((total, file) => total + file.size, 0);

export const modelSource = (model: CatalogModel): string => new URL(model.baseUrl).host;
