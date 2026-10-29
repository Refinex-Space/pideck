import type {
	NetworkDiagnostic,
	NetworkProxyConfig,
	NetworkProxyRoute,
	NetworkProxyStatus,
} from "@thinkrail/contracts";
import { useT } from "@thinkrail/locales/react";
import { Button } from "@thinkrail/ui/button";
import { CircleAlert, CircleCheck, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { getTransport } from "@/transport";
import { SegmentedControl } from "./SegmentedControl";
import { SettingsGroup } from "./SettingsGroup";
import { SettingsNotice } from "./SettingsNotice";
import { SettingsRadioCards } from "./SettingsRadioCards";

const NETWORK_TEXT = {
	"endpoint.anthropic": "network.endpoint.anthropic",
	"endpoint.openaiApi": "network.endpoint.openaiApi",
	"endpoint.openaiAuth": "network.endpoint.openaiAuth",
	"issue.bypassUnsupported": "network.issue.bypassUnsupported",
	"issue.credentialUnavailable": "network.issue.credentialUnavailable",
	"issue.detectionFailed": "network.issue.detectionFailed",
	"issue.invalidConfig": "network.issue.invalidConfig",
	"issue.pacUnsupported": "network.issue.pacUnsupported",
	"issue.socksUnsupported": "network.issue.socksUnsupported",
	"issue.systemAuthUnsupported": "network.issue.systemAuthUnsupported",
	"mode.auto": "network.mode.auto",
	"mode.auto.hint": "network.mode.auto.hint",
	"mode.direct": "network.mode.direct",
	"mode.direct.hint": "network.mode.direct.hint",
	"mode.manual": "network.mode.manual",
	"mode.manual.hint": "network.mode.manual.hint",
	"result.authRequired": "network.result.authRequired",
	"result.blocked": "network.result.blocked",
	"result.forbidden": "network.result.forbidden",
	"result.httpError": "network.result.httpError",
	"result.network": "network.result.network",
	"result.proxyAuth": "network.result.proxyAuth",
	"result.proxyTunnel": "network.result.proxyTunnel",
	"result.reachable": "network.result.reachable",
	"result.redirect": "network.result.redirect",
	"result.regionDenied": "network.result.regionDenied",
	"result.timeout": "network.result.timeout",
	"result.tls": "network.result.tls",
	"source.direct": "network.source.direct",
	"source.environment": "network.source.environment",
	"source.gnome": "network.source.gnome",
	"source.kde": "network.source.kde",
	"source.macos": "network.source.macos",
	"source.manual": "network.source.manual",
	"source.none": "network.source.none",
	"source.windows": "network.source.windows",
	host: "network.host",
	port: "network.port",
	username: "network.username",
	bypass: "network.bypass",
} as const;

const INPUT =
	"w-full min-w-0 rounded-sm border border-control-border-default bg-control-bg px-8 py-4 tr-code-text text-text-default outline-none focus-visible:border-control-border-active";
export function formatProxyAddress(value: string): string {
	if (!value) return "";
	try {
		const url = new URL(value);
		return `${url.protocol}//${url.hostname}:${url.port || (url.protocol === "https:" ? "443" : "80")}`;
	} catch {
		return "";
	}
}
function ProxyRoute({ route, applied = false }: { route: NetworkProxyRoute; applied?: boolean }) {
	const t = useT();
	const blocked = applied && Boolean(route.issue);
	return (
		<div className="flex flex-col gap-12">
			<dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-16 gap-y-8 tr-text-ui">
				<dt className="text-text-muted">{t("network.source")}</dt>
				<dd className="text-text-default">{t(NETWORK_TEXT[`source.${route.source}`])}</dd>
				{blocked ? (
					<>
						<dt className="text-text-muted">{t("network.connectionStatus")}</dt>
						<dd className="text-feedback-warning">{t("network.result.blocked")}</dd>
					</>
				) : (
					<>
						{(["http", "https"] as const).map((scheme) => (
							<div key={scheme} className="contents">
								<dt className="text-text-muted">
									{t(scheme === "http" ? "network.http" : "network.https")}
								</dt>
								<dd className="min-w-0 break-all tr-code-text text-text-default">
									{formatProxyAddress(route[scheme]) || t("network.direct")}
								</dd>
							</div>
						))}
						<dt className="text-text-muted">{t("network.bypass")}</dt>
						<dd className="min-w-0 break-all tr-code-text text-text-default">
							{route.bypass || "—"}
						</dd>
					</>
				)}
			</dl>
			{route.issue ? (
				<SettingsNotice variant="warning">
					<p>{t(NETWORK_TEXT[`issue.${route.issue}`])}</p>
				</SettingsNotice>
			) : null}
			{route.bypassWarning ? (
				<SettingsNotice variant="warning">
					<p>{t("network.bypassCompatibility")}</p>
				</SettingsNotice>
			) : null}
		</div>
	);
}
export function NetworkForm({
	status,
	draft,
	password,
	busy,
	failed,
	results,
	onChange,
	onPassword,
	onSave,
	onRefresh,
	onDiagnose,
	onDiscard,
}: {
	status: NetworkProxyStatus;
	draft: NetworkProxyConfig;
	password: string;
	busy: boolean;
	failed: boolean;
	results: NetworkDiagnostic[];
	onChange(value: NetworkProxyConfig): void;
	onPassword(value: string): void;
	onSave(): void;
	onRefresh(): void;
	onDiagnose(provider: "openai" | "anthropic"): void;
	onDiscard(): void;
}) {
	const t = useT();
	const changed = JSON.stringify(draft) !== JSON.stringify(status.config) || Boolean(password);
	const [provider, setProvider] = useState<"openai" | "anthropic">("openai");
	return (
		<div data-testid="settings-network" className="flex flex-col gap-32">
			<SettingsGroup title={t("network.title")} description={t("network.description")}>
				<div className="flex flex-col gap-16">
					{status.environmentOverride ? (
						<SettingsNotice variant="warning" testId="network-override">
							<p>{t("network.override")}</p>
						</SettingsNotice>
					) : null}
					{status.restartRequired ? (
						<SettingsNotice variant="warning" testId="network-restart">
							<p>{t("network.restart")}</p>
						</SettingsNotice>
					) : null}
					<form
						className="flex flex-col gap-16"
						onSubmit={(event) => {
							event.preventDefault();
							onSave();
						}}
					>
						<fieldset disabled={busy} className="flex min-w-0 flex-col gap-16">
							<SettingsRadioCards
								name="proxy-mode"
								label={t("network.mode")}
								value={draft.mode}
								onSelect={(mode) => onChange({ ...draft, mode })}
								choices={(["auto", "manual", "direct"] as const).map((id) => ({
									id,
									label: t(NETWORK_TEXT[`mode.${id}`]),
									description: t(NETWORK_TEXT[`mode.${id}.hint`]),
									testId: `network-mode-${id}`,
								}))}
							/>
							{draft.mode === "manual" ? (
								<div className="flex flex-col gap-12">
									<SegmentedControl
										name="proxy-protocol"
										label={t("network.protocol")}
										value={draft.protocol}
										onSelect={(protocol) => onChange({ ...draft, protocol })}
										options={[
											{ id: "http", label: "HTTP" },
											{ id: "https", label: "HTTPS" },
										]}
									/>
									{(["host", "port", "username", "bypass"] as const).map((field) => (
										<label key={field} className="flex flex-col gap-4 tr-text-ui text-text-default">
											{t(NETWORK_TEXT[`${field}`])}
											<input
												data-testid={`network-${field}`}
												data-settings-draft-input
												className={INPUT}
												value={draft[field]}
												type={field === "port" ? "number" : "text"}
												min={field === "port" ? 1 : undefined}
												max={field === "port" ? 65535 : undefined}
												required={field === "host" || field === "port"}
												autoComplete="off"
												onChange={(event) =>
													onChange({
														...draft,
														[field]:
															field === "port"
																? Number(event.currentTarget.value)
																: event.currentTarget.value,
													})
												}
											/>
										</label>
									))}
									<label className="flex flex-col gap-4 tr-text-ui text-text-default">
										{t("network.password")}
										<input
											data-testid="network-password"
											data-settings-draft-input
											className={INPUT}
											value={password}
											type="password"
											autoComplete="new-password"
											onChange={(event) => onPassword(event.currentTarget.value)}
										/>
									</label>
									<p className="tr-text-metadata text-text-muted">
										{t(status.hasPassword ? "network.passwordSaved" : "network.passwordHint")}
									</p>
									<p className="tr-text-metadata text-text-muted">{t("network.bypassHint")}</p>
								</div>
							) : null}
							{failed ? (
								<SettingsNotice variant="error" testId="network-error">
									<p>{t("network.failed")}</p>
								</SettingsNotice>
							) : null}
							<div className="flex justify-end gap-8">
								<Button variant="outline" disabled={!changed} onClick={onDiscard}>
									{t("settings.environment.discard")}
								</Button>
								<Button type="submit" data-testid="network-save" disabled={!changed}>
									{t("common.save")}
								</Button>
							</div>
						</fieldset>
					</form>
				</div>
			</SettingsGroup>
			<SettingsGroup title={t("network.effective")}>
				<ProxyRoute route={status.effective} applied />
			</SettingsGroup>
			<SettingsGroup title={t("network.detected")}>
				<div className="flex flex-col gap-16" data-testid="network-detected">
					<ProxyRoute route={status.detected} />
					<div className="flex flex-wrap items-center justify-between gap-12">
						<p className="tr-text-metadata text-text-muted">
							{t("network.detectedAt")}{" "}
							<time dateTime={status.detectedAt}>
								{new Date(status.detectedAt).toLocaleString()}
							</time>
						</p>
						<Button variant="outline" iconLeft={RefreshCw} disabled={busy} onClick={onRefresh}>
							{t("network.refresh")}
						</Button>
					</div>
				</div>
			</SettingsGroup>
			<SettingsGroup title={t("network.diagnostics")} description={t("network.diagnosticsHint")}>
				<div className="flex flex-col gap-16">
					<div className="flex flex-wrap items-center justify-between gap-12">
						<SegmentedControl
							name="diagnostic-provider"
							label={t("network.provider")}
							value={provider}
							onSelect={setProvider}
							disabled={busy}
							options={[
								{ id: "openai", label: t("network.openai") },
								{ id: "anthropic", label: t("network.anthropic") },
							]}
						/>
						<Button
							variant="outline"
							data-testid="network-diagnose"
							disabled={busy || changed || status.restartRequired}
							onClick={() => onDiagnose(provider)}
						>
							{t("network.check")}
						</Button>
					</div>
					{busy ? (
						<p role="status" className="tr-text-metadata text-text-muted">
							{t("network.working")}
						</p>
					) : null}
					<div aria-live="polite" className="flex flex-col divide-y divide-border-muted">
						{results.map((result) => {
							const reachable = result.code === "reachable" || result.code === "authRequired";
							const Icon = reachable ? CircleCheck : CircleAlert;
							return (
								<div
									key={result.endpoint}
									className="flex items-start gap-12 py-12"
									data-testid={`network-result-${result.endpoint}`}
								>
									<Icon aria-hidden className="mt-2 size-16 shrink-0 text-text-muted" />
									<div className="flex min-w-0 flex-1 flex-col gap-4">
										<div className="flex flex-wrap items-baseline justify-between gap-8">
											<p className="tr-text-ui text-text-default">
												{t(NETWORK_TEXT[`endpoint.${result.endpoint}`])}
											</p>
											{result.code !== "blocked" ? (
												<p className="tr-code-text text-text-muted">
													{t("network.timing", {
														status: result.status ?? "—",
														duration: result.elapsedMs,
													})}
												</p>
											) : null}
										</div>
										<p className="tr-text-metadata text-text-muted">
											{t(NETWORK_TEXT[`result.${result.code}`])}
										</p>
									</div>
								</div>
							);
						})}
					</div>
				</div>
			</SettingsGroup>
		</div>
	);
}
export function NetworkSettings() {
	const t = useT();
	const [state, setState] = useState<{
		status: NetworkProxyStatus;
		draft: NetworkProxyConfig;
	} | null>(null);
	const [password, setPassword] = useState("");
	const [busy, setBusy] = useState(false);
	const [failed, setFailed] = useState(false);
	const [results, setResults] = useState<NetworkDiagnostic[]>([]);
	useEffect(() => {
		let cancelled = false;
		getTransport()
			.request("network.get", {})
			.then((status) => {
				if (!cancelled) setState({ status, draft: status.config });
			})
			.catch(() => {
				if (!cancelled) setFailed(true);
			});
		return () => {
			cancelled = true;
		};
	}, []);
	if (!state)
		return (
			<p className="tr-text-ui text-text-muted">
				{t(failed ? "network.failed" : "network.loading")}
			</p>
		);
	const run = (operation: () => Promise<void>) => {
		setBusy(true);
		setFailed(false);
		void operation()
			.catch(() => setFailed(true))
			.finally(() => setBusy(false));
	};
	return (
		<NetworkForm
			status={state.status}
			draft={state.draft}
			password={password}
			busy={busy}
			failed={failed}
			results={results}
			onChange={(draft) => {
				setState({ ...state, draft });
				setFailed(false);
				setResults([]);
			}}
			onPassword={setPassword}
			onDiscard={() => {
				setState({ ...state, draft: state.status.config });
				setPassword("");
				setFailed(false);
			}}
			onSave={() =>
				run(async () => {
					const status = await getTransport().request("network.update", {
						config: state.draft,
						...(password ? { password } : {}),
						...(!state.draft.username ? { password: null } : {}),
					});
					setState({ status, draft: status.config });
					setPassword("");
					setResults([]);
				})
			}
			onRefresh={() =>
				run(async () => {
					const status = await getTransport().request("network.get", { refresh: true });
					setState({ status, draft: state.draft });
					setResults([]);
				})
			}
			onDiagnose={(provider) =>
				run(async () => {
					setResults(await getTransport().request("network.diagnose", { provider }));
				})
			}
		/>
	);
}
