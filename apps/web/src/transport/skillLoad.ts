import type {
	WorkspaceFsChangedPayload,
	WorkspaceWatchReadyResult,
	WsParams,
	WsResult,
} from "@thinkrail/contracts";
import { selectWorkspaceTick, useAppStore } from "../store";
import { getTransport } from "./wireTransport";

export interface SkillLoadDependencies {
	readVersion?: (params: WsParams<"session.getMessages">) => string | number;
	watchReady: (workspaceId: string, prewarm: boolean) => Promise<WorkspaceWatchReadyResult>;
	noteFsChanged: (payload: WorkspaceFsChangedPayload) => void;
	workspaceTick: (workspaceId: string) => number;
	createSession: (params: WsParams<"session.create">) => Promise<WsResult<"session.create">>;
	getSessionMessages: (
		params: WsParams<"session.getMessages">,
	) => Promise<WsResult<"session.getMessages">>;
	reloadSessionResources: (
		params: WsParams<"session.reloadResources">,
	) => Promise<WsResult<"session.reloadResources">>;
}

export function createSkillLoadRequests(deps: SkillLoadDependencies) {
	const messageReads = new Map<
		string,
		{
			version: string;
			request: Promise<{ result: WsResult<"session.getMessages">; syncedTick: number }>;
		}
	>();
	const messageKey = (workspaceId: string, sessionId: string) =>
		JSON.stringify([workspaceId, sessionId]);
	const pending = new Map<string, { preparation: Promise<number>; prewarm: boolean }>();

	const prepare = (workspaceId: string, prewarm: boolean): Promise<number> => {
		const existing = pending.get(workspaceId);
		if (existing && (prewarm || !existing.prewarm)) return existing.preparation;

		const started = deps.watchReady(workspaceId, prewarm).then(({ startupNudge }) => {
			if (startupNudge) {
				deps.noteFsChanged({
					workspaceId,
					paths: [],
					truncated: true,
					skillChange: "unknown",
				});
			}
			return deps.workspaceTick(workspaceId);
		});
		const preparation = started.finally(() => {
			if (pending.get(workspaceId)?.preparation === preparation) pending.delete(workspaceId);
		});
		pending.set(workspaceId, { preparation, prewarm });
		return preparation;
	};

	return {
		async prewarmWorkspaceSkillLoad(workspaceId: string): Promise<void> {
			await prepare(workspaceId, true);
		},
		async createSession(params: WsParams<"session.create">) {
			const syncedTick = await prepare(params.workspaceId, false);
			const result = await deps.createSession(params);
			return { result, syncedTick };
		},
		getSessionMessages(params: WsParams<"session.getMessages">) {
			const syncedTick = deps.workspaceTick(params.workspaceId);
			const key = messageKey(params.workspaceId, params.sessionId);
			const version = JSON.stringify([deps.readVersion?.(params) ?? 0, syncedTick]);
			const existing = messageReads.get(key);
			if (existing?.version === version) return existing.request;
			const request = (async () => {
				prepare(params.workspaceId, false).catch(() => {});
				const result = await deps.getSessionMessages(params);
				if (
					result.summary.workspaceId !== params.workspaceId ||
					result.summary.sessionId !== params.sessionId
				) {
					throw new Error("Session response did not match the requested workspace and session");
				}
				return { result, syncedTick };
			})().finally(() => {
				if (messageReads.get(key)?.request === request) messageReads.delete(key);
			});
			messageReads.set(key, { version, request });
			return request;
		},
		async reloadSessionResources(workspaceId: string, params: WsParams<"session.reloadResources">) {
			messageReads.delete(messageKey(workspaceId, params.sessionId));
			const syncedTick = await prepare(workspaceId, false);
			const result = await deps.reloadSessionResources(params);
			return { result, syncedTick };
		},
	};
}

const skillLoadRequests = createSkillLoadRequests({
	readVersion: ({ sessionId }) => {
		const state = useAppStore.getState();
		return JSON.stringify([state.connectionGeneration, state.sessions[sessionId]?.eventRevision]);
	},
	watchReady: (workspaceId, prewarm) =>
		getTransport().request(
			"workspace.watchReady",
			prewarm ? { workspaceId, prewarm: true } : { workspaceId },
		),
	noteFsChanged: (payload) => useAppStore.getState().noteFsChanged(payload),
	workspaceTick: (workspaceId) => selectWorkspaceTick(useAppStore.getState(), workspaceId),
	createSession: (params) => getTransport().request("session.create", params),
	getSessionMessages: (params) => getTransport().request("session.getMessages", params),
	reloadSessionResources: (params) => getTransport().request("session.reloadResources", params),
});

export const prewarmWorkspaceSkillLoad = skillLoadRequests.prewarmWorkspaceSkillLoad;
export const createSessionWithSkillBaseline = skillLoadRequests.createSession;
export const getSessionMessagesWithSkillBaseline = skillLoadRequests.getSessionMessages;
export const reloadSessionResourcesWithSkillBaseline = skillLoadRequests.reloadSessionResources;
