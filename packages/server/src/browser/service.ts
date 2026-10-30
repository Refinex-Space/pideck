import { resolve } from "node:path";
import type {
	BrowserCommand,
	BrowserEngine,
	BrowserEngineResult,
	BrowserResult,
	BrowserScope,
	BrowserTabInfo,
} from "@thinkrail/contracts";
import { materializeBrowserArtifact, resolveBrowserUpload } from "./artifacts";

interface Claim {
	scope: BrowserScope;
	created: boolean;
}

export class BrowserService {
	private readonly claims = new Map<string, Claim>();
	private readonly active = new Map<string, Set<AbortController>>();
	private readonly catalogs = new Map<string, Promise<void>>();
	private readonly artifacts = new Map<string, Promise<NonNullable<BrowserResult["artifact"]>>>();
	private readonly unsubscribe: (() => void) | undefined;
	constructor(
		private readonly engine: BrowserEngine,
		private readonly resolveSession: (id: string) => BrowserScope | undefined,
		private readonly resolveWorkspace: (id: string) => string,
	) {
		this.unsubscribe = engine.onRecordingFinished?.((scope, command, result, signal) =>
			this.materialize(scope, command, result, signal),
		);
	}

	async executeSession(
		sessionId: string,
		command: BrowserCommand,
		signal?: AbortSignal,
	): Promise<BrowserResult> {
		const scope = this.resolveSession(sessionId);
		if (!scope) throw new Error("Browser control is only available in a top-level chat");
		return this.execute(scope, command, signal);
	}
	async executeUser(workspaceId: string, command: BrowserCommand): Promise<BrowserResult> {
		return this.execute(
			{ workspaceId, sessionId: "", workspacePath: this.resolveWorkspace(workspaceId) },
			command,
		);
	}
	private key(scope: BrowserScope, tabId: string) {
		return `${scope.workspaceId}/${tabId}`;
	}
	private async tabs(scope: BrowserScope): Promise<BrowserTabInfo[]> {
		const result = await this.engine.workbench({ action: "list", workspaceId: scope.workspaceId });
		for (const tab of result.tabs) {
			const parent = tab.openerId ? this.claims.get(this.key(scope, tab.openerId)) : undefined;
			if (parent && !this.claims.has(this.key(scope, tab.id)))
				await this.claim(parent.scope, tab.id, true);
		}
		const ids = new Set(result.tabs.map((tab) => this.key(scope, tab.id)));
		for (const [key, claim] of this.claims) {
			if (claim.scope.workspaceId === scope.workspaceId && !ids.has(key)) this.claims.delete(key);
		}
		return result.tabs.map(({ ownerSessionId: _ownerSessionId, ...tab }) => {
			const ownerSessionId = this.claims.get(this.key(scope, tab.id))?.scope.sessionId;
			return { ...tab, ...(ownerSessionId ? { ownerSessionId } : {}) };
		});
	}
	private async claim(scope: BrowserScope, tabId: string, created: boolean) {
		const key = this.key(scope, tabId);
		const existing = this.claims.get(key);
		if (existing && existing.scope.sessionId !== scope.sessionId)
			throw new Error("Tab is claimed by another chat");
		this.claims.set(key, { scope, created: created || existing?.created === true });
		await this.engine.workbench({
			action: "owner",
			workspaceId: scope.workspaceId,
			tabId,
			sessionId: scope.sessionId,
		});
	}
	private async prepare(
		scope: BrowserScope,
		command: BrowserCommand,
		signal?: AbortSignal,
	): Promise<{ result: BrowserResult } | { tabId: string; viewId: number }> {
		const previous = this.catalogs.get(scope.workspaceId) ?? Promise.resolve();
		let unlock: () => void = () => {};
		const pending = new Promise<void>((resolve) => {
			unlock = resolve;
		});
		this.catalogs.set(scope.workspaceId, pending);
		await previous;
		try {
			signal?.throwIfAborted();
			if (scope.sessionId && !this.resolveSession(scope.sessionId))
				throw new Error("Browser chat has closed");
			const tabs = await this.tabs(scope);
			const accessible = tabs.filter(
				(tab) => !tab.ownerSessionId || tab.ownerSessionId === scope.sessionId,
			);
			if (command.action === "list") return { result: { data: accessible } };
			if (command.action === "finalize") {
				for (const [key, claim] of this.claims) {
					if (
						claim.scope.sessionId !== scope.sessionId ||
						claim.scope.workspaceId !== scope.workspaceId
					)
						continue;
					const id = key.slice(scope.workspaceId.length + 1);
					if (claim.created && !command.keep?.includes(id))
						await this.engine.workbench({
							action: "close",
							workspaceId: scope.workspaceId,
							tabId: id,
						});
				}
				await this.releaseSession(scope.sessionId);
				return {
					result: {
						data: "Browser claims released; requested deliverables and human tabs retained.",
					},
				};
			}
			let tabId = command.tabId;
			if (command.action === "newTab") {
				const created = await this.engine.workbench({
					action: "new",
					workspaceId: scope.workspaceId,
					visible: command.visible ?? true,
				});
				signal?.throwIfAborted();
				tabId = created.tabId;
				if (!tabId) throw new Error("Browser tab limit reached");
				if (scope.sessionId) await this.claim(scope, tabId, true);
			} else {
				if (!tabId || !tabs.some((tab) => tab.id === tabId))
					throw new Error("Choose an existing tabId from browser list");
				if (command.action === "claimTab") {
					await this.claim(scope, tabId, false);
					return { result: { data: { tabId } } };
				}
				if (
					scope.sessionId &&
					this.claims.get(this.key(scope, tabId))?.scope.sessionId !== scope.sessionId
				)
					throw new Error("Explicitly claim this tab before operating it");
			}
			const tab = await this.engine.workbench({
				action: "get",
				workspaceId: scope.workspaceId,
				tabId,
			});
			if (tab.viewId === undefined) throw new Error("Browser page is unavailable");
			return { tabId, viewId: tab.viewId };
		} finally {
			unlock();
			if (this.catalogs.get(scope.workspaceId) === pending) this.catalogs.delete(scope.workspaceId);
		}
	}
	private async execute(
		scope: BrowserScope,
		command: BrowserCommand,
		outerSignal?: AbortSignal,
	): Promise<BrowserResult> {
		outerSignal?.throwIfAborted();
		const controller = new AbortController();
		const signal = outerSignal
			? AbortSignal.any([outerSignal, controller.signal])
			: controller.signal;
		const running = this.active.get(scope.sessionId) ?? new Set<AbortController>();
		running.add(controller);
		this.active.set(scope.sessionId, running);
		let cleanupTabId: string | undefined;
		try {
			const prepared = await this.prepare(scope, command, signal);
			if ("result" in prepared) return prepared.result;
			const { tabId, viewId } = prepared;
			cleanupTabId = tabId;
			signal.throwIfAborted();
			if (command.action === "close") {
				await this.engine.workbench({ action: "close", workspaceId: scope.workspaceId, tabId });
				this.claims.delete(this.key(scope, tabId));
				return { data: { closed: tabId } };
			}
			if (command.action === "activateTab" || command.action === "visibility") {
				if (command.action === "visibility" && command.visible === undefined)
					return {
						data: {
							visible: (await this.tabs(scope)).find((tab) => tab.id === tabId)?.visible ?? false,
						},
					};
				const state = await this.engine.workbench({
					action: "activate",
					workspaceId: scope.workspaceId,
					tabId,
					visible: command.visible ?? true,
				});
				return {
					data: {
						tabId,
						requested: command.visible ?? true,
						visible: state.tabs.find((tab) => tab.id === tabId)?.visible ?? false,
					},
				};
			}
			if (command.action === "newTab" && !command.url) return { data: { tabId } };
			const input = {
				...command,
				tabId,
				...(command.action === "newTab" ? { action: "navigate" as const } : {}),
			};
			if (input.files)
				input.files = await Promise.all(
					input.files.map((file) => resolveBrowserUpload(scope.workspacePath, file)),
				);
			await this.engine.workbench({
				action: "activity",
				sessionId: scope.sessionId,
				workspaceId: scope.workspaceId,
				tabId,
				active: true,
				method: input.action,
			});
			const result = await this.engine.execute(scope, input, viewId, signal);
			signal.throwIfAborted();
			const final = await this.materialize(scope, input, result);
			return command.action === "newTab"
				? { ...final, data: { tabId, result: final.data } }
				: final;
		} finally {
			running.delete(controller);
			if (!running.size) this.active.delete(scope.sessionId);
			if (cleanupTabId)
				await this.engine
					.workbench({
						action: "activity",
						workspaceId: scope.workspaceId,
						tabId: cleanupTabId,
						active: false,
					})
					.catch(() => {});
		}
	}
	private async materialize(
		scope: BrowserScope,
		command: BrowserCommand,
		result: BrowserEngineResult,
		signal?: AbortSignal,
	): Promise<BrowserResult> {
		const { temporaryArtifact, ...publicResult } = result;
		const key = result.recording ? `${scope.workspaceId}/${result.recording.id}` : undefined;
		const previous = key ? this.artifacts.get(key) : undefined;
		const reported = result.artifact ?? result.recording?.artifact;
		if (!temporaryArtifact && !reported && !previous) return publicResult;
		const pending = (async () => {
			const current = (await previous) ?? reported;
			if (
				current &&
				(!command.outputPath ||
					resolve(scope.workspacePath, current.path) ===
						resolve(scope.workspacePath, command.outputPath))
			)
				return current;
			const source =
				temporaryArtifact ??
				(current
					? {
							...current,
							temporaryPath: await resolveBrowserUpload(scope.workspacePath, current.path),
						}
					: undefined);
			if (!source) throw new Error("Browser artifact is unavailable");
			const id = result.recording?.id ?? crypto.randomUUID();
			const extension =
				source.mimeType === "video/webm" ? "webm" : source.mimeType === "image/png" ? "png" : "bin";
			const filename = source.filename
				?.split("")
				.map((character) =>
					character.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(character) ? "_" : character,
				)
				.join("")
				.slice(0, 180);
			const path =
				command.outputPath ??
				`.thinkrail/browser/${filename ? `${id}-${filename}` : `${id}.${extension}`}`;
			return materializeBrowserArtifact(scope.workspacePath, source, path, signal);
		})();
		if (key) {
			this.artifacts.set(key, pending);
			pending.catch(() => {
				if (this.artifacts.get(key) === pending) {
					if (previous) this.artifacts.set(key, previous);
					else this.artifacts.delete(key);
				}
			});
			if (!previous) setTimeout(() => this.artifacts.delete(key), 11 * 60 * 1000).unref();
		}
		const artifact = await pending;
		if (temporaryArtifact) await this.engine.releaseArtifact?.(temporaryArtifact.temporaryPath);
		let recording = result.recording;
		if (recording) {
			const { error: _error, ...state } = recording;
			recording = { ...state, phase: "completed", artifact };
			await this.engine
				.workbench({
					action: "recording",
					workspaceId: scope.workspaceId,
					...(command.tabId ? { tabId: command.tabId } : {}),
					recording,
				})
				.catch(() => {});
		}
		return { ...publicResult, artifact, ...(recording ? { recording } : {}) };
	}
	async settled(sessionId: string): Promise<void> {
		for (const controller of this.active.get(sessionId) ?? []) controller.abort();
		const scope =
			this.resolveSession(sessionId) ??
			[...this.claims.values()].find((claim) => claim.scope.sessionId === sessionId)?.scope;
		if (scope) await this.engine.release(scope);
	}
	async releaseSession(sessionId: string): Promise<void> {
		const scope =
			this.resolveSession(sessionId) ??
			[...this.claims.values()].find((claim) => claim.scope.sessionId === sessionId)?.scope;
		await this.settled(sessionId);
		if (scope) await this.engine.release(scope, true);
		for (const [key, claim] of this.claims) {
			if (claim.scope.sessionId !== sessionId) continue;
			this.claims.delete(key);
			await this.engine
				.workbench({
					action: "owner",
					workspaceId: claim.scope.workspaceId,
					tabId: key.slice(claim.scope.workspaceId.length + 1),
				})
				.catch(() => {});
		}
	}
	async dispose(): Promise<void> {
		await Promise.all(
			[
				...new Set([...this.claims.values()].map((claim) => claim.scope.sessionId)),
				...this.active.keys(),
			].map((id) => this.releaseSession(id)),
		);
		this.artifacts.clear();
		this.unsubscribe?.();
	}
}
