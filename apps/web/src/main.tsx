import "./index.css";
import { useT } from "@thinkrail/locales/react";
import { TooltipProvider } from "@thinkrail/ui/tooltip";
import { LucideProvider } from "lucide-react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { initChatPreferencesPersistence } from "./chat/chatPreferences";
import { initModelVisibilityPersistence } from "./chat/modelVisibility";
import { ErrorBoundary, setErrorBoundaryReporter } from "./components/ErrorBoundary";
import { registerWebExtensions } from "./extensions";
import { useLocaleSync } from "./i18n";
import { initNavigation } from "./navigation";
import { initFileActivityPreferencesPersistence } from "./panels/fileActivityPreferences";
import { initFilesTreePersistence } from "./panels/filesTreeState";
import { initProjectExpansionPersistence } from "./panels/projectExpansion";
import { AppResourceHost } from "./shell/AppResourceHost";
import { Shell } from "./shell/Shell";
import { applyThemePreference, initializeThemes, readThemeHint } from "./themes";
import {
	clientErrorReport,
	initTransport,
	installClientErrorReporting,
	reportClientError,
} from "./transport";

initializeThemes();
applyThemePreference(readThemeHint());
initTransport();
installClientErrorReporting();
setErrorBoundaryReporter((error, reportId) =>
	reportClientError(clientErrorReport("render", error, reportId)),
);
initChatPreferencesPersistence();
initFileActivityPreferencesPersistence();
initModelVisibilityPersistence();
initProjectExpansionPersistence();
initFilesTreePersistence();
initNavigation();
registerWebExtensions();

function App() {
	useLocaleSync();
	const t = useT();
	return (
		<ErrorBoundary label={t("app.errorBoundary.label")} reportId="app">
			<TooltipProvider delayDuration={250} skipDelayDuration={400}>
				<LucideProvider strokeWidth={1.75}>
					<AppResourceHost>
						<Shell />
					</AppResourceHost>
				</LucideProvider>
			</TooltipProvider>
		</ErrorBoundary>
	);
}

const root = document.getElementById("root");
if (root) {
	createRoot(root).render(
		<StrictMode>
			<App />
		</StrictMode>,
	);
}
