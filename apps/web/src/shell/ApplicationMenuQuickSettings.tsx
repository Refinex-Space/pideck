import { RiCheckLine, RiGlobalLine, RiPaletteLine } from "@remixicon/react";
import {
	type AppConfigUpdate,
	LOCALES_PROTOCOL_VERSION,
	THEME_SYSTEM_PROTOCOL_VERSION,
} from "@thinkrail/contracts";
import { SYSTEM_LOCALE } from "@thinkrail/locales";
import { useT } from "@thinkrail/locales/react";
import {
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "@thinkrail/ui/dropdown-menu";
import { useMemo } from "react";
import { languageOptions } from "../i18n";
import { toast, useAppStore } from "../store";
import { deriveSystemThemePair, resolveTheme } from "../themes";
import { errorText, getTransport } from "../transport";

type ThemeModeChoice = "system" | "light" | "dark";

function Checked({ selected }: { selected: boolean }) {
	return selected ? (
		<RiCheckLine aria-hidden className="size-14 text-primary" />
	) : (
		<span aria-hidden className="size-14" />
	);
}

function updateSettings(config: AppConfigUpdate, failure: string) {
	getTransport()
		.request("settings.update", { config })
		.catch((error) => toast.error(errorText(error, failure)));
}

export function AppearanceQuickMenu() {
	const t = useT();
	const protocolVersion = useAppStore((state) => state.protocolVersion);
	const theme = useAppStore((state) => state.theme);
	const themeMode = useAppStore((state) => state.themeMode);
	const systemThemePair = useAppStore((state) => state.systemThemePair);
	const systemSupported = (protocolVersion ?? 0) >= THEME_SYSTEM_PROTOCOL_VERSION;
	const pair = systemThemePair ?? deriveSystemThemePair(theme);
	const value: ThemeModeChoice =
		systemSupported && themeMode === "system" ? "system" : resolveTheme(theme).appearance;

	const select = (next: string) => {
		if (next === value) return;
		const failure = t("settings.appearance.changeFailed");
		if (next === "system") {
			updateSettings({ themeMode: "system", systemThemePair: pair }, failure);
		} else if (next === "light" || next === "dark") {
			updateSettings({ theme: pair[next], themeMode: "fixed" }, failure);
		}
	};

	return (
		<DropdownMenuSub>
			<DropdownMenuSubTrigger data-testid="app-menu-appearance">
				<RiPaletteLine />
				{t("settings.nav.appearance")}
			</DropdownMenuSubTrigger>
			<DropdownMenuSubContent sideOffset={12} data-testid="app-menu-appearance-content">
				<DropdownMenuRadioGroup value={value} onValueChange={select}>
					{systemSupported ? (
						<DropdownMenuRadioItem value="system" data-testid="app-menu-theme-system">
							<Checked selected={value === "system"} />
							{t("settings.appearance.mode.system")}
						</DropdownMenuRadioItem>
					) : null}
					<DropdownMenuRadioItem value="light" data-testid="app-menu-theme-light">
						<Checked selected={value === "light"} />
						{t("settings.appearance.mode.light")}
					</DropdownMenuRadioItem>
					<DropdownMenuRadioItem value="dark" data-testid="app-menu-theme-dark">
						<Checked selected={value === "dark"} />
						{t("settings.appearance.mode.dark")}
					</DropdownMenuRadioItem>
				</DropdownMenuRadioGroup>
			</DropdownMenuSubContent>
		</DropdownMenuSub>
	);
}

export function LanguageQuickMenu() {
	const t = useT();
	const protocolVersion = useAppStore((state) => state.protocolVersion);
	const preference = useAppStore((state) => state.locale);
	const snapshot = useAppStore((state) => state.localLocales);
	const options = useMemo(() => languageOptions(preference, snapshot), [preference, snapshot]);
	if (protocolVersion === null || protocolVersion < LOCALES_PROTOCOL_VERSION) return null;

	const select = (next: string) => {
		if (next === preference) return;
		updateSettings({ locale: next }, t("settings.language.changeFailed"));
	};

	return (
		<DropdownMenuSub>
			<DropdownMenuSubTrigger data-testid="app-menu-language">
				<RiGlobalLine />
				{t("settings.nav.language")}
			</DropdownMenuSubTrigger>
			<DropdownMenuSubContent sideOffset={12} data-testid="app-menu-language-content">
				<DropdownMenuRadioGroup value={preference} onValueChange={select}>
					<DropdownMenuRadioItem value={SYSTEM_LOCALE} data-testid="app-menu-language-system">
						<Checked selected={preference === SYSTEM_LOCALE} />
						{t("settings.language.system.label")}
					</DropdownMenuRadioItem>
					{options.map((option) =>
						option.kind === "language" ? (
							<DropdownMenuRadioItem
								key={option.tag}
								value={option.tag}
								data-testid={`app-menu-language-${option.tag}`}
							>
								<Checked selected={preference === option.tag} />
								{option.name}
							</DropdownMenuRadioItem>
						) : null,
					)}
				</DropdownMenuRadioGroup>
			</DropdownMenuSubContent>
		</DropdownMenuSub>
	);
}
