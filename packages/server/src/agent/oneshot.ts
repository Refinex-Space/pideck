import type { Api, Context, Model } from "@earendil-works/pi-ai";
import { usePiRuntime } from "./agentSessionManager";
import { preferredDefaultModel } from "./modelDefaults";
import { type AvailableModelsRuntime, settledAvailableModels } from "./piRuntime";

export type ModelTier = "cheap" | "default";

/** The chat's own model: a call made on its behalf must not leave its provider. */
export interface OneShotProvider {
	provider: string;
	modelId: string;
}

export interface OneShotRequest {
	system?: string;
	prompt: string;
	tier?: ModelTier;
	/** Confine the pick to this provider: its known small model, else this very model. Overrides `tier`. */
	within?: OneShotProvider;
	maxTokens?: number;
	temperature?: number;
	signal?: AbortSignal;
}

export interface OneShotResult {
	text: string;
	model: { provider: string; id: string };
}

const CHEAP_MODELS: ReadonlyArray<readonly [provider: string, idPrefix: string]> = [
	["anthropic", "claude-haiku"],
	["openai", "gpt-5-mini"],
	["openai", "gpt-4o-mini"],
	["openai", "gpt-4.1-mini"],
	["google", "gemini-2.5-flash"],
	["google", "gemini-flash"],
	["xai", "grok-build"],
];

function pickWithinProvider(
	available: readonly Model<Api>[],
	within: OneShotProvider,
): Model<Api> | null {
	const sameProvider = available.filter((model) => String(model.provider) === within.provider);
	for (const [provider, prefix] of CHEAP_MODELS) {
		if (provider !== within.provider) continue;
		const hit = sameProvider.find((model) => model.id.startsWith(prefix));
		if (hit) return hit;
	}
	return sameProvider.find((model) => model.id === within.modelId) ?? null;
}

function pickModelFromRuntime(
	runtime: AvailableModelsRuntime,
	tier: ModelTier,
	within?: OneShotProvider,
): Model<Api> | null {
	const available = settledAvailableModels(runtime);
	if (available.length === 0) return null;
	if (within) return pickWithinProvider(available, within);
	if (tier === "default") return preferredDefaultModel(available) ?? null;
	for (const [provider, prefix] of CHEAP_MODELS) {
		const hit = available.find(
			(model) => model.provider === provider && model.id.startsWith(prefix),
		);
		if (hit) return hit;
	}
	const priced = available.filter((model) => tokenCost(model) > 0);
	return (
		priced.sort(
			(left, right) => tokenCost(left) - tokenCost(right) || left.id.localeCompare(right.id),
		)[0] ??
		preferredDefaultModel(available) ??
		null
	);
}

function tokenCost(model: Model<Api>): number {
	return model.cost.input + model.cost.output;
}

export function pickModel(
	tier: ModelTier = "cheap",
	within?: OneShotProvider,
): Promise<Model<Api> | null> {
	return usePiRuntime((runtime) => pickModelFromRuntime(runtime, tier, within));
}

export function completeOnce(req: OneShotRequest): Promise<OneShotResult> {
	return usePiRuntime(async (runtime) => {
		const model = pickModelFromRuntime(runtime, req.tier ?? "cheap", req.within);
		if (!model) throw new Error("no-model");

		const context: Context = {
			...(req.system ? { systemPrompt: req.system } : {}),
			messages: [{ role: "user", content: req.prompt, timestamp: Date.now() }],
		};
		const message = await runtime.completeSimple(model, context, {
			maxTokens: req.maxTokens ?? 256,
			temperature: req.temperature ?? 0.2,
			...(req.signal ? { signal: req.signal } : {}),
		});

		const text = message.content
			.filter((content) => content.type === "text")
			.map((content) => content.text)
			.join("")
			.trim();
		return { text, model: { provider: String(model.provider), id: model.id } };
	});
}
