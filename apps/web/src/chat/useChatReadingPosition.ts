import { useInsertionEffect, useLayoutEffect, useRef } from "react";
import { useAppStore } from "../store";
import type { ChatMessageOrder } from "./chatPreferences";
import type { useChatScroll } from "./useChatScroll";

type Scroll = ReturnType<typeof useChatScroll>;
interface ReadingPosition {
	rowId: string;
	top: number;
	order: ChatMessageOrder;
}
const positions = new Map<string, ReadingPosition>();
const POSITION_LIMIT = 50;

export function useChatReadingPosition({
	workspaceId,
	sessionId,
	rows,
	order,
	scroller,
	followState,
	revealRow,
}: {
	workspaceId: string;
	sessionId: string;
	rows: readonly { id: string }[];
	order: ChatMessageOrder;
	scroller: HTMLElement | null;
	followState: Scroll["followState"];
	revealRow: Scroll["revealRow"];
}) {
	const key = JSON.stringify([workspaceId, sessionId]);
	const latest = useRef({ rows, followState });
	useInsertionEffect(() => {
		latest.current = { rows, followState };
	});
	useLayoutEffect(() => {
		if (!scroller) return;
		const saved = positions.get(key);
		positions.delete(key);
		const requested = useAppStore.getState().chatLocationRequest;
		const explicitJump =
			requested?.workspaceId === workspaceId && requested.sessionId === sessionId;
		const index = saved ? latest.current.rows.findIndex((row) => row.id === saved.rowId) : -1;
		const cancel =
			saved && saved.order === order && index >= 0 && !explicitJump
				? revealRow(
						saved.rowId,
						() => latest.current.rows.findIndex((row) => row.id === saved.rowId),
						"start",
						() => {},
						saved.top,
					)
				: undefined;
		return () => {
			cancel?.();
			const state = useAppStore.getState();
			if (
				latest.current.followState !== "detached" ||
				state.removedWorkspaceIds[workspaceId] ||
				state.deletedSessionsByWorkspace[workspaceId]?.[sessionId]
			)
				return;
			const viewport = scroller.getBoundingClientRect();
			if (viewport.height <= 0) return;
			const row = [...scroller.querySelectorAll<HTMLElement>("[data-chat-row-id]")].find(
				(candidate) => candidate.getBoundingClientRect().bottom > viewport.top + 1,
			);
			if (!row?.dataset.chatRowId) return;
			positions.set(key, {
				rowId: row.dataset.chatRowId,
				top: row.getBoundingClientRect().top - viewport.top,
				order,
			});
			while (positions.size > POSITION_LIMIT) {
				const oldest = positions.keys().next().value;
				if (oldest === undefined) break;
				positions.delete(oldest);
			}
		};
	}, [key, order, revealRow, scroller, sessionId, workspaceId]);
}
