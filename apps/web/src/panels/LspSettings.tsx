import {
	LSP_IDLE_MINUTES,
	type LspCatalogEntry,
	type LspConfigUpdate,
	type LspOverview,
	type LspServerOverride,
} from "@thinkrail/contracts";
import { useT } from "@thinkrail/locales/react";
import { Button } from "@thinkrail/ui/button";
import { type FormEvent, useEffect, useState } from "react";
import { getTransport } from "@/transport";
import { SettingsGroup, SettingsPageContainer } from "./SettingsGroup";
import { SettingsNotice } from "./SettingsNotice";
import { SettingsRow } from "./SettingsRow";
import { SettingsSwitch } from "./SettingsSwitch";

const INPUT =
	"w-full min-w-0 rounded-sm border border-control-border-default bg-control-bg px-8 py-4 tr-code-text text-text-default outline-none focus-visible:border-control-border-active";
const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;

function parseExtensions(text: string): string[] {
	return text
		.split(/[\s,]+/)
		.filter(Boolean)
		.map((item) => (item.startsWith(".") ? item : `.${item}`));
}

/** An override without `disabled`, or null when nothing else is left in it. */
function withoutDisabled(override: LspServerOverride | undefined): LspServerOverride | null {
	if (!override) return null;
	const { disabled: _disabled, ...rest } = override;
	return Object.keys(rest).length === 0 ? null : rest;
}

function BuiltinRow({
	entry,
	override,
	busy,
	onToggle,
}: {
	entry: LspCatalogEntry;
	override: LspServerOverride | undefined;
	busy: boolean;
	onToggle: (enabled: boolean) => void;
}) {
	const t = useT();
	const enabled = override?.disabled !== true;
	return (
		<SettingsRow
			testId={`lsp-builtin-${entry.id}`}
			label={entry.name}
			description={
				<span className="flex flex-col gap-2">
					<span className="tr-code-text">{entry.extensions.join(" ")}</span>
					<span
						data-testid={`lsp-available-${entry.id}`}
						data-available={entry.available}
						className={entry.available ? "text-feedback-success" : "text-text-muted"}
					>
						{entry.available ? (
							t("settings.lsp.available")
						) : (
							<>
								{t("settings.lsp.unavailable")} ·{" "}
								<span className="tr-code-text">{entry.install}</span>
							</>
						)}
					</span>
				</span>
			}
			control={
				<SettingsSwitch
					checked={enabled}
					disabled={busy}
					label={entry.name}
					testId={`lsp-server-${entry.id}`}
					onChange={onToggle}
				/>
			}
		/>
	);
}

function AddServerForm({
	taken,
	busy,
	error,
	onAdd,
}: {
	taken: ReadonlySet<string>;
	busy: boolean;
	error: string | null;
	onAdd: (id: string, override: LspServerOverride) => Promise<boolean>;
}) {
	const t = useT();
	const [name, setName] = useState("");
	const [command, setCommand] = useState("");
	const [extensions, setExtensions] = useState("");
	const [invalid, setInvalid] = useState<"name" | "taken" | "fields" | null>(null);
	const submit = (event: FormEvent) => {
		event.preventDefault();
		const id = name.trim();
		const argv = command.trim().split(/\s+/).filter(Boolean);
		const list = parseExtensions(extensions);
		if (!ID_PATTERN.test(id)) return setInvalid("name");
		if (taken.has(id)) return setInvalid("taken");
		if (argv.length === 0 || list.length === 0) return setInvalid("fields");
		setInvalid(null);
		void onAdd(id, { command: argv, extensions: list }).then((added) => {
			if (!added) return;
			setName("");
			setCommand("");
			setExtensions("");
		});
	};
	const fields = [
		{ key: "name", label: "settings.lsp.name", value: name, set: setName, hint: null },
		{
			key: "command",
			label: "settings.lsp.command",
			value: command,
			set: setCommand,
			hint: "settings.lsp.commandHint",
		},
		{
			key: "extensions",
			label: "settings.lsp.extensions",
			value: extensions,
			set: setExtensions,
			hint: "settings.lsp.extensionsHint",
		},
	] as const;
	return (
		<form
			data-testid="lsp-add-form"
			onSubmit={submit}
			className="flex flex-col gap-12 border-border-muted border-t pt-16"
		>
			{fields.map((field) => (
				<label key={field.key} className="flex flex-col gap-4 tr-text-ui text-text-default">
					{t(field.label)}
					<input
						data-testid={`lsp-add-${field.key}`}
						data-settings-draft-input
						className={INPUT}
						value={field.value}
						autoComplete="off"
						spellCheck={false}
						onChange={(event) => field.set(event.currentTarget.value)}
					/>
					{field.hint ? (
						<span className="tr-text-metadata text-text-muted">{t(field.hint)}</span>
					) : null}
				</label>
			))}
			{invalid || error ? (
				<SettingsNotice variant="error" testId="lsp-add-error">
					<p>
						{invalid === "name"
							? t("settings.lsp.invalidName")
							: invalid === "taken"
								? t("settings.lsp.nameTaken")
								: invalid === "fields"
									? t("settings.lsp.invalidFields")
									: error}
					</p>
				</SettingsNotice>
			) : null}
			<div className="flex justify-end">
				<Button type="submit" variant="outline" data-testid="lsp-add" disabled={busy}>
					{t("settings.lsp.add")}
				</Button>
			</div>
		</form>
	);
}

export interface LspFailure {
	message: string;
	/** Which control the failed change came from, so the message sits beside it. */
	scope: "general" | "add";
}

export function LspSettingsForm({
	overview,
	busy,
	failure,
	onUpdate,
}: {
	overview: LspOverview;
	busy: boolean;
	failure: LspFailure | null;
	onUpdate: (update: LspConfigUpdate, scope?: LspFailure["scope"]) => Promise<boolean>;
}) {
	const t = useT();
	const { config, catalog } = overview;
	const [idle, setIdle] = useState<string | null>(null);
	const catalogIds = new Set(catalog.map((entry) => entry.id));
	const custom = Object.entries(config.servers).filter(([id]) => !catalogIds.has(id));
	const commitIdle = () => {
		const minutes = Number(idle);
		setIdle(null);
		if (
			idle === null ||
			!Number.isInteger(minutes) ||
			minutes < LSP_IDLE_MINUTES.min ||
			minutes > LSP_IDLE_MINUTES.max ||
			minutes === config.idleMinutes
		)
			return;
		void onUpdate({ idleMinutes: minutes });
	};
	return (
		<SettingsPageContainer testId="settings-lsp">
			<SettingsGroup title={t("settings.lsp.group")}>
				<SettingsNotice variant="info" testId="lsp-notice" className="mb-12">
					<p>{t("settings.lsp.notice")}</p>
				</SettingsNotice>
				<SettingsRow
					label={t("settings.lsp.enabled")}
					description={t("settings.lsp.enabledDescription")}
					control={
						<SettingsSwitch
							checked={config.enabled}
							disabled={busy}
							label={t("settings.lsp.enabled")}
							testId="lsp-enabled"
							onChange={(enabled) => void onUpdate({ enabled })}
						/>
					}
				/>
				<SettingsRow
					label={t("settings.lsp.diagnostics")}
					description={t("settings.lsp.diagnosticsDescription")}
					control={
						<SettingsSwitch
							checked={config.diagnostics}
							disabled={busy || !config.enabled}
							label={t("settings.lsp.diagnostics")}
							testId="lsp-diagnostics"
							onChange={(diagnostics) => void onUpdate({ diagnostics })}
						/>
					}
				/>
				<SettingsRow
					label={t("settings.lsp.tool")}
					description={t("settings.lsp.toolDescription")}
					control={
						<SettingsSwitch
							checked={config.tool}
							disabled={busy || !config.enabled}
							label={t("settings.lsp.tool")}
							testId="lsp-tool"
							onChange={(tool) => void onUpdate({ tool })}
						/>
					}
				/>
				<SettingsRow
					label={t("settings.lsp.idle")}
					description={t("settings.lsp.idleDescription")}
					control={
						<span className="flex items-center gap-8">
							<input
								type="number"
								data-testid="lsp-idle"
								aria-label={t("settings.lsp.idle")}
								className={`${INPUT} w-72 text-right`}
								min={LSP_IDLE_MINUTES.min}
								max={LSP_IDLE_MINUTES.max}
								step={1}
								disabled={busy || !config.enabled}
								value={idle ?? String(config.idleMinutes)}
								onChange={(event) => setIdle(event.currentTarget.value)}
								onBlur={commitIdle}
								onKeyDown={(event) => {
									if (event.key === "Enter") event.currentTarget.blur();
								}}
							/>
							<span className="tr-text-metadata text-text-muted">{t("settings.lsp.idleUnit")}</span>
						</span>
					}
				/>
				{failure?.scope === "general" && !busy ? (
					<SettingsNotice variant="error" testId="lsp-error" className="mt-12">
						<p>{failure.message}</p>
					</SettingsNotice>
				) : null}
			</SettingsGroup>
			<SettingsGroup
				title={t("settings.lsp.builtin")}
				description={t("settings.lsp.builtinDescription")}
				testId="lsp-builtin"
			>
				{catalog.map((entry) => (
					<BuiltinRow
						key={entry.id}
						entry={entry}
						override={config.servers[entry.id]}
						busy={busy}
						onToggle={(enabled) =>
							void onUpdate({
								servers: {
									[entry.id]: enabled
										? withoutDisabled(config.servers[entry.id])
										: { ...config.servers[entry.id], disabled: true },
								},
							})
						}
					/>
				))}
			</SettingsGroup>
			<SettingsGroup
				title={t("settings.lsp.custom")}
				description={t("settings.lsp.customDescription")}
				testId="lsp-custom"
			>
				{custom.length === 0 ? (
					<p data-testid="lsp-custom-empty" className="py-8 text-text-muted tr-text-metadata">
						{t("settings.lsp.customEmpty")}
					</p>
				) : (
					custom.map(([id, override]) => (
						<SettingsRow
							key={id}
							testId={`lsp-custom-${id}`}
							label={id}
							description={
								<span className="flex flex-col gap-2">
									<span className="tr-code-text">{override.command?.join(" ")}</span>
									<span className="tr-code-text">{override.extensions?.join(" ")}</span>
								</span>
							}
							control={
								<Button
									variant="quiet"
									size="s"
									data-testid={`lsp-remove-${id}`}
									disabled={busy}
									onClick={() => void onUpdate({ servers: { [id]: null } })}
								>
									{t("settings.lsp.remove")}
								</Button>
							}
						/>
					))
				)}
				<AddServerForm
					taken={new Set([...catalogIds, ...custom.map(([id]) => id)])}
					busy={busy}
					error={failure?.scope === "add" && !busy ? failure.message : null}
					onAdd={(id, override) => onUpdate({ servers: { [id]: override } }, "add")}
				/>
			</SettingsGroup>
		</SettingsPageContainer>
	);
}

/** Language servers: the switches that govern them, the ones PiDeck can start, and the user's own. */
export function LspSettings() {
	const t = useT();
	const [overview, setOverview] = useState<LspOverview | null>(null);
	const [busy, setBusy] = useState(false);
	const [failure, setFailure] = useState<LspFailure | null>(null);
	const [failed, setFailed] = useState(false);
	useEffect(() => {
		let cancelled = false;
		getTransport()
			.request("lsp.get", {})
			.then((next) => {
				if (!cancelled) setOverview(next);
			})
			.catch(() => {
				if (!cancelled) setFailed(true);
			});
		return () => {
			cancelled = true;
		};
	}, []);
	if (!overview) {
		return (
			<p className="tr-text-ui text-text-muted">
				{t(failed ? "settings.lsp.failed" : "settings.lsp.loading")}
			</p>
		);
	}
	const update = (config: LspConfigUpdate, scope: LspFailure["scope"] = "general") => {
		setBusy(true);
		setFailure(null);
		return getTransport()
			.request("lsp.update", { config })
			.then(
				(next) => {
					setOverview(next);
					return true;
				},
				(caught: unknown) => {
					setFailure({
						message:
							caught instanceof Error && caught.message ? caught.message : t("settings.lsp.failed"),
						scope,
					});
					return false;
				},
			)
			.finally(() => setBusy(false));
	};
	return <LspSettingsForm overview={overview} busy={busy} failure={failure} onUpdate={update} />;
}
