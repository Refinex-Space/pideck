import { type NativeBrowserPage, normalizeBrowserUrl } from "@thinkrail/contracts";
import { useT } from "@thinkrail/locales/react";
import { Button, IconButton } from "@thinkrail/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@thinkrail/ui/dropdown-menu";
import { cn } from "@thinkrail/ui/utils";
import {
	ArrowDown,
	ArrowUp,
	Camera,
	ChevronLeft,
	ChevronRight,
	Code,
	Copy,
	Download,
	ExternalLink,
	Globe,
	MonitorSmartphone,
	MoreHorizontal,
	MousePointer2,
	Plus,
	RefreshCw,
	Search,
	Square,
	Video,
	X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { copyText } from "../lib";
import { startChatInTab } from "../panels/openChat";
import { selectWorkspaceChatTarget, toast, useAppStore } from "../store";
import { getTransport } from "../transport";
import { BrowserRecording, recordingActive, recordingCommand } from "./BrowserRecording";
import {
	type BrowserTab,
	browserPage,
	browserSelectionText,
	closeBrowserTab,
	createBrowserTab,
	ensureWorkspaceBrowser,
	nativeBrowserBridge,
	recoverBrowserTab,
	selectBrowserTab,
	updateBrowserTab,
	useWorkspaceBrowser,
} from "./state";

const INPUT =
	"min-w-0 rounded-md border border-control-border-default bg-control-bg px-8 text-text-default outline-none focus:border-control-border-active focus-visible:ring-1 focus-visible:ring-focus-ring tr-text-ui";

export function BrowserPanel({ workspaceId }: { workspaceId: string }) {
	const t = useT();
	const workspace = useWorkspaceBrowser(workspaceId);
	useEffect(() => {
		ensureWorkspaceBrowser(workspaceId);
	}, [workspaceId]);
	const active = workspace.tabs.find((tab) => tab.id === workspace.active);
	if (!nativeBrowserBridge())
		return <div className="p-16 text-text-muted tr-text-ui">{t("browser.unavailable")}</div>;
	return (
		<div
			className="flex h-full min-h-0 flex-col bg-container-workspace-bg"
			data-testid="browser-panel"
		>
			{active ? (
				<BrowserTabView
					key={`${active.id}:${active.generation}`}
					tab={active}
					workspaceId={workspaceId}
				/>
			) : (
				<div className="flex flex-1 items-center justify-center">
					<Button variant="ghost" onClick={() => createBrowserTab(workspaceId)}>
						{t("browser.newTab")}
					</Button>
				</div>
			)}
		</div>
	);
}

export function BrowserTabs({ workspaceId }: { workspaceId: string }) {
	const t = useT();
	const workspace = useWorkspaceBrowser(workspaceId);
	const active = workspace.tabs.find((tab) => tab.id === workspace.active);
	return (
		<div className="flex min-w-0 flex-1 items-center gap-4 px-4">
			<div
				role="tablist"
				aria-label={t("browser.tabs")}
				className="flex min-w-0 flex-1 gap-4 overflow-x-auto"
			>
				{workspace.tabs.map((tab, index) => (
					<div
						key={tab.id}
						className={cn(
							"flex min-w-80 max-w-200 shrink-0 items-center rounded-sm",
							tab.id === active?.id && "bg-control-bg-selected",
						)}
					>
						<button
							type="button"
							role="tab"
							aria-selected={tab.id === active?.id}
							tabIndex={tab.id === active?.id ? 0 : -1}
							title={tab.page.title || tab.page.url || t("browser.newTab")}
							className="flex min-w-0 flex-1 items-center gap-8 rounded-sm px-8 py-4 text-text-default outline-none focus-visible:ring-1 focus-visible:ring-focus-ring tr-text-ui"
							onClick={() => selectBrowserTab(workspaceId, tab.id)}
							onKeyDown={(event) => {
								const next =
									event.key === "ArrowRight"
										? workspace.tabs[(index + 1) % workspace.tabs.length]
										: event.key === "ArrowLeft"
											? workspace.tabs[(index - 1 + workspace.tabs.length) % workspace.tabs.length]
											: event.key === "Home"
												? workspace.tabs[0]
												: event.key === "End"
													? workspace.tabs.at(-1)
													: null;
								if (next) {
									event.preventDefault();
									selectBrowserTab(workspaceId, next.id);
									const list = event.currentTarget.closest('[role="tablist"]');
									requestAnimationFrame(() =>
										list?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus(),
									);
								}
							}}
						>
							<Globe className="size-14 shrink-0" />
							<span className="truncate">{tab.page.title || t("browser.newTab")}</span>
						</button>
						<IconButton
							icon={X}
							size="s"
							label={t("browser.closeTab")}
							onClick={() => closeBrowserTab(workspaceId, tab.id)}
						/>
					</div>
				))}
			</div>
			<IconButton
				icon={Plus}
				size="s"
				label={t("browser.newTab")}
				disabled={workspace.tabs.length >= 16}
				onClick={() => createBrowserTab(workspaceId)}
			/>
		</div>
	);
}

function BrowserTabView({ tab, workspaceId }: { tab: BrowserTab; workspaceId: string }) {
	const t = useT();
	const container = useRef<HTMLDivElement>(null);
	const address = useRef<HTMLInputElement>(null);
	const findInput = useRef<HTMLInputElement>(null);
	const [find, setFind] = useState<string | null>(null);
	const [invalid, setInvalid] = useState(false);
	const [size, setSize] = useState({ width: 1, height: 1 });
	const [busy, setBusy] = useState(false);
	const [page, setPage] = useState<NativeBrowserPage | null>(null);
	const recording = recordingActive(tab.recording);
	useEffect(() => {
		setPage(browserPage(workspaceId, tab.id));
	}, [workspaceId, tab.id]);
	const update = (patch: Partial<BrowserTab>) => updateBrowserTab(workspaceId, tab.id, patch);
	const reload = () => (tab.page.crashed ? recoverBrowserTab(workspaceId, tab.id) : page?.reload());
	useEffect(() => {
		page?.attach(container.current);
		const node = container.current;
		if (!node) return;
		const observer = new ResizeObserver(([entry]) => {
			if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
		});
		observer.observe(node);
		return () => {
			observer.disconnect();
			page?.attach(null);
		};
	}, [page]);
	const scale =
		tab.zoom === "fit"
			? Math.max(0.05, Math.min(1, size.width / tab.width, size.height / tab.height))
			: tab.zoom;
	useEffect(() => {
		if (!tab.page.url || tab.page.loading || !page) return;
		void page
			.setViewport(tab.responsive ? { width: tab.width, height: tab.height, scale } : null)
			.catch((error: unknown) => toast.error(String(error)));
	}, [page, scale, tab.responsive, tab.width, tab.height, tab.page.url, tab.page.loading]);
	useEffect(() => {
		if (tab.command?.name === "address") {
			address.current?.focus();
			address.current?.select();
		} else if (tab.command?.name === "find") setFind("");
	}, [tab.command]);
	const finding = find !== null;
	useEffect(() => {
		if (finding) findInput.current?.focus();
	}, [finding]);
	const run = (operation: () => Promise<unknown>) => {
		setBusy(true);
		void operation()
			.catch((error: unknown) => toast.error(String(error)))
			.finally(() => setBusy(false));
	};
	const addSelection = async () => {
		if (!tab.selection) return;
		let sessionId =
			tab.selectionSessionId ?? selectWorkspaceChatTarget(useAppStore.getState(), workspaceId);
		if (!sessionId) sessionId = await startChatInTab(workspaceId);
		if (!sessionId) throw new Error(t("browser.chatUnavailable"));
		const current = useAppStore.getState();
		if (
			!current.sessions[sessionId] ||
			!current.tabsByWorkspace[workspaceId]?.some(
				(tab) => tab.kind === "chat" && tab.sessionId === sessionId,
			)
		)
			throw new Error(t("browser.chatUnavailable"));
		useAppStore
			.getState()
			.insertChatText(workspaceId, sessionId, browserSelectionText(tab.selection));
		update({ selection: null });
	};
	return (
		<section
			className="flex min-h-0 flex-1 flex-col"
			aria-label={t("workbench.tool.browser")}
			onKeyDown={(event) => {
				if (event.key === "Escape") {
					page?.cancelPick();
					if (find !== null) {
						setFind(null);
						page?.stopFind();
					}
				}
				if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "l") {
					event.preventDefault();
					address.current?.focus();
					address.current?.select();
				}
			}}
		>
			<form
				className="flex shrink-0 items-center gap-4 border-b border-border-muted p-8"
				onSubmit={(event) => {
					event.preventDefault();
					const url = normalizeBrowserUrl(tab.address);
					setInvalid(!url);
					if (url) {
						update({ address: url });
						page?.navigate(url);
						address.current?.blur();
					}
				}}
			>
				<IconButton
					icon={ChevronLeft}
					size="s"
					label={t("browser.back")}
					disabled={!tab.page.canGoBack}
					onClick={() => page?.back()}
				/>
				<IconButton
					icon={ChevronRight}
					size="s"
					label={t("browser.forward")}
					disabled={!tab.page.canGoForward}
					onClick={() => page?.forward()}
				/>
				<IconButton
					icon={tab.page.loading ? Square : RefreshCw}
					size="s"
					label={t(tab.page.loading ? "browser.stop" : "browser.reload")}
					disabled={!tab.page.url}
					onClick={() => (tab.page.loading ? page?.stop() : reload())}
				/>
				<input
					ref={address}
					className={cn(INPUT, "h-28 flex-1 rounded-full")}
					aria-label={t("browser.address")}
					data-testid="browser-address"
					placeholder={t("browser.addressPlaceholder")}
					value={tab.address}
					spellCheck={false}
					autoComplete="off"
					aria-invalid={invalid}
					onChange={(event) => {
						update({ address: event.target.value });
						setInvalid(false);
					}}
					onFocus={(event) => event.currentTarget.select()}
					onKeyDown={(event) => {
						if (event.key === "Escape") {
							update({ address: tab.page.url });
							setInvalid(false);
							event.currentTarget.blur();
						}
					}}
				/>
				<IconButton
					icon={MonitorSmartphone}
					size="s"
					label={t("browser.responsive")}
					selected={tab.responsive}
					disabled={!tab.page.url || tab.page.loading || recording}
					onClick={() => update({ responsive: !tab.responsive })}
				/>
				<IconButton
					icon={MousePointer2}
					size="s"
					label={t("browser.pick")}
					selected={tab.picking}
					disabled={!tab.page.url || tab.page.loading}
					onClick={() => {
						if (tab.picking) page?.cancelPick();
						else {
							update({
								selectionSessionId: selectWorkspaceChatTarget(useAppStore.getState(), workspaceId),
								picking: true,
							});
							page?.pick({
								instruction: t("browser.pickHint"),
								background: t("browser.background"),
								color: t("browser.color"),
								font: t("browser.font"),
							});
						}
					}}
				/>
				<IconButton
					icon={Camera}
					size="s"
					label={t("browser.copyScreenshot")}
					disabled={!page || !tab.page.url || busy}
					onClick={() =>
						run(async () => {
							if (!page) return;
							await page.copyScreenshot();
							toast.success(t("browser.screenshotCopied"));
						})
					}
				/>
				<IconButton
					icon={recording ? Square : Video}
					size="s"
					label={t(recording ? "browser.stopRecording" : "browser.startRecording")}
					selected={recording}
					disabled={!tab.page.url || busy || tab.recording?.phase === "finalizing"}
					onClick={() =>
						run(() =>
							recordingCommand(
								workspaceId,
								tab.id,
								recording ? "recordingStop" : "recordingStart",
								tab.recording?.id,
								tab.responsive ? { width: tab.width, height: tab.height } : undefined,
							),
						)
					}
				/>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<IconButton icon={MoreHorizontal} label={t("browser.more")} size="s" />
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem
							disabled={!tab.page.url}
							onSelect={() => run(async () => page?.openExternal())}
						>
							<ExternalLink />
							{t("browser.external")}
						</DropdownMenuItem>
						<DropdownMenuItem disabled={!tab.page.url} onSelect={() => page?.openDevTools()}>
							<Code />
							{t("browser.devtools")}
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem disabled={!tab.page.url} onSelect={() => setFind("")}>
							<Search />
							{t("browser.find")}
						</DropdownMenuItem>
						<DropdownMenuItem
							disabled={!tab.page.url}
							onSelect={() => {
								void copyText(tab.page.url);
							}}
						>
							<Copy />
							{t("browser.copyUrl")}
						</DropdownMenuItem>
						<DropdownMenuItem
							disabled={!tab.page.url || busy}
							onSelect={() =>
								run(async () => {
									const data = await page?.screenshot();
									if (!data) return;
									const link = document.createElement("a");
									link.href = data;
									link.download = "pideck-browser.png";
									link.click();
								})
							}
						>
							<Download />
							{t("browser.screenshot")}
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</form>
			<BrowserRecording workspaceId={workspaceId} tabId={tab.id} recording={tab.recording} />
			{tab.ownerSessionId && (
				<div
					role="status"
					className="flex items-center justify-between gap-8 border-b border-border-muted px-8 py-4 text-text-muted tr-text-caption"
				>
					{t(tab.activity ? "browser.agentOperating" : "browser.agentClaimed")}
					{tab.activity && (
						<Button
							size="s"
							variant="ghost"
							disabled={busy}
							onClick={() =>
								run(() =>
									getTransport().request("session.abort", { sessionId: tab.ownerSessionId ?? "" }),
								)
							}
						>
							{t("browser.stopAutomation")}
						</Button>
					)}
				</div>
			)}
			{tab.hidden && (
				<div className="flex items-center justify-between gap-8 border-b border-border-muted px-8 py-4 tr-text-caption">
					<span>{t("browser.hidden")}</span>
					<Button
						size="s"
						variant="ghost"
						onClick={() => {
							page?.setVisible(true);
							update({ hidden: false });
						}}
					>
						{t("browser.show")}
					</Button>
				</div>
			)}
			{invalid && (
				<div role="alert" className="px-8 py-4 text-feedback-error tr-text-ui">
					{t("browser.invalidUrl")}
				</div>
			)}
			{tab.responsive && (
				<fieldset
					disabled={recording}
					className="flex min-w-0 shrink-0 flex-wrap items-center justify-center gap-8 border-b border-border-muted px-8 py-4 tr-text-ui"
				>
					<ViewportDimension
						label={t("browser.width")}
						value={tab.width}
						onCommit={(width) => update({ width })}
					/>
					<span>×</span>
					<ViewportDimension
						label={t("browser.height")}
						value={tab.height}
						onCommit={(height) => update({ height })}
					/>
					<select
						className={cn(INPUT, "h-28")}
						aria-label={t("browser.zoom")}
						value={recording ? 1 : tab.zoom}
						onChange={(event) =>
							update({ zoom: event.target.value === "fit" ? "fit" : Number(event.target.value) })
						}
					>
						<option value="fit">{t("browser.fit")}</option>
						{[0.25, 0.5, 0.75, 1, 1.25, 1.5].map((value) => (
							<option key={value} value={value}>
								{Math.round(value * 100)}%
							</option>
						))}
					</select>
					<Button
						size="s"
						variant="ghost"
						onClick={() => update({ width: tab.height, height: tab.width })}
					>
						{t("browser.rotate")}
					</Button>
				</fieldset>
			)}
			{find !== null && (
				<div className="flex shrink-0 items-center gap-4 border-b border-border-muted p-8">
					<input
						ref={findInput}
						aria-label={t("browser.find")}
						className={cn(INPUT, "h-28 flex-1")}
						value={find}
						onChange={(event) => {
							setFind(event.target.value);
							page?.find(event.target.value);
						}}
						onKeyDown={(event) => {
							if (event.key === "Enter") page?.find(find, !event.shiftKey);
						}}
					/>
					<IconButton
						icon={ArrowUp}
						size="s"
						label={t("browser.previousMatch")}
						onClick={() => page?.find(find, false)}
					/>
					<IconButton
						icon={ArrowDown}
						size="s"
						label={t("browser.nextMatch")}
						onClick={() => page?.find(find)}
					/>
					<IconButton
						icon={X}
						size="s"
						label={t("browser.closeFind")}
						onClick={() => {
							setFind(null);
							page?.stopFind();
						}}
					/>
				</div>
			)}
			{tab.page.error && (
				<div
					role="alert"
					className="flex shrink-0 items-center gap-8 border-b border-border-muted p-8 text-feedback-error tr-text-ui"
				>
					<span className="min-w-0 flex-1 break-words">
						{t("browser.loadFailed")} {tab.page.error}
					</span>
					<Button size="s" variant="ghost" onClick={reload}>
						{t("browser.reload")}
					</Button>
				</div>
			)}
			<div
				ref={container}
				className={cn(
					"relative min-h-0 flex-1 overflow-auto",
					tab.responsive && "bg-container-content-bg",
				)}
				data-testid="browser-surface"
			>
				{!tab.page.url && (
					<div className="flex h-full flex-col items-center justify-center gap-16 p-24 text-center text-text-muted">
						<Globe className="size-48 text-text-subtle" />
						<div className="tr-text-ui">{t("workbench.tool.browser")}</div>
						<p className="tr-text-ui">{t("browser.emptyHint")}</p>
					</div>
				)}
			</div>
			{tab.picking && (
				<div
					role="status"
					className="shrink-0 border-t border-border-muted px-8 py-4 text-text-muted tr-text-ui"
				>
					{t("browser.pickHint")}
				</div>
			)}
			{tab.selection && (
				<div className="flex shrink-0 items-center gap-8 border-t border-border-default p-8">
					<div className="min-w-0 flex-1">
						<div className="truncate tr-text-ui">
							{tab.selection.tagName} · {tab.selection.accessibleName || tab.selection.selector}
						</div>
						<div className="truncate text-text-muted tr-text-caption">{tab.selection.pageUrl}</div>
					</div>
					<Button size="s" disabled={busy} onClick={() => run(addSelection)}>
						{t("browser.addToChat")}
					</Button>
					<IconButton
						icon={X}
						size="s"
						label={t("browser.discardSelection")}
						onClick={() => update({ selection: null })}
					/>
				</div>
			)}
		</section>
	);
}

function ViewportDimension({
	label,
	value,
	onCommit,
}: {
	label: string;
	value: number;
	onCommit(value: number): void;
}) {
	const [draft, setDraft] = useState(String(value));
	useEffect(() => setDraft(String(value)), [value]);
	const parsed = Number(draft);
	const valid = draft.trim() !== "" && Number.isInteger(parsed) && parsed >= 240 && parsed <= 3840;
	return (
		<input
			aria-label={label}
			aria-invalid={!valid}
			className={cn(INPUT, "h-28 w-64")}
			type="number"
			min={240}
			max={3840}
			value={draft}
			onChange={(event) => setDraft(event.target.value)}
			onBlur={() => {
				if (valid) onCommit(parsed);
			}}
			onKeyDown={(event) => {
				if (event.key === "Enter" && valid) onCommit(parsed);
				if (event.key === "Escape") setDraft(String(value));
			}}
		/>
	);
}
