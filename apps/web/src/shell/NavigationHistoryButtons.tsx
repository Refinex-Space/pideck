import { useT } from "@thinkrail/locales/react";
import { IconButton } from "@thinkrail/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useSyncExternalStore } from "react";
import { TooltipShortcut } from "../components/TooltipShortcut";
import { platformShortcutLabel } from "../lib";
import { getNavigationHistory, goBack, goForward, subscribeNavigationHistory } from "../navigation";

export function NavigationHistoryButtons() {
	const t = useT();
	const { canGoBack, canGoForward } = useSyncExternalStore(
		subscribeNavigationHistory,
		getNavigationHistory,
		getNavigationHistory,
	);
	return (
		<div className="window-no-drag flex shrink-0 items-center" data-testid="navigation-history">
			<IconButton
				variant="ghost"
				size="m"
				icon={ChevronLeft}
				label={t("shell.navigation.back")}
				tooltip={
					<TooltipShortcut
						label={t("shell.navigation.back")}
						shortcut={platformShortcutLabel("[")}
					/>
				}
				tooltipSide="bottom"
				disabled={!canGoBack}
				onClick={goBack}
				data-testid="navigate-back"
			/>
			<IconButton
				variant="ghost"
				size="m"
				icon={ChevronRight}
				label={t("shell.navigation.forward")}
				tooltip={
					<TooltipShortcut
						label={t("shell.navigation.forward")}
						shortcut={platformShortcutLabel("]")}
					/>
				}
				tooltipSide="bottom"
				disabled={!canGoForward}
				onClick={goForward}
				data-testid="navigate-forward"
			/>
		</div>
	);
}
