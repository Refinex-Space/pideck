import type {
	BrowserCommand,
	BrowserResult,
	BrowserViewport,
	BrowserWorkbenchRequest,
	BrowserWorkbenchResult,
	NativeCommand,
	NativeNotificationInput,
	NativeQuitHint,
	NativeUpdateState,
	NativeWindowState,
} from "@thinkrail/contracts";
import type { PageZoomAction, PageZoomGesture } from "./pageZoom";
import type { WindowChromeGeometry } from "./windowChrome";

export type DesktopRpc = {
	bun: {
		requests: {
			browserCommand: {
				params: { workspaceId: string; command: BrowserCommand };
				response: BrowserResult;
			};
			browserAttach: { params: { viewId: number }; response: undefined };
			browserExternal: { params: { viewId: number }; response: undefined };
			browserHistory: {
				params: { viewId: number };
				response: { canGoBack: boolean; canGoForward: boolean };
			};
			browserScript: { params: { viewId: number; script: string }; response: undefined };
			browserViewport: {
				params: { viewId: number; viewport: BrowserViewport | null };
				response: undefined;
			};
			browserScreenshot: { params: { viewId: number }; response: string };
			browserCopyScreenshot: { params: { viewId: number }; response: undefined };
			browserDetach: { params: { viewId: number }; response: undefined };
			getUpdateState: { params: undefined; response: NativeUpdateState };
			getWindowState: { params: undefined; response: NativeWindowState };
			minimizeWindow: { params: undefined; response: undefined };
			toggleMaximizeWindow: { params: undefined; response: undefined };
			closeWindow: { params: undefined; response: undefined };
			quitApp: { params: undefined; response: undefined };
			checkForUpdates: { params: undefined; response: undefined };
			downloadUpdate: { params: undefined; response: undefined };
			restartToUpdate: { params: undefined; response: undefined };
			dismissInstallResult: { params: undefined; response: undefined };
			showNotification: { params: NativeNotificationInput; response: undefined };
		};
		messages: {
			routeChanged: { hash: string };
			preferenceWrite: { key: string; value: string };
			preferenceRemove: { key: string };
			titleBarDoubleClick: undefined;
			pageZoomRequested: { action: PageZoomAction };
			pageZoomGestureRequested: PageZoomGesture;
			menuLabelsChanged: { labels: Record<string, string> };
		};
	};
	webview: {
		requests: {
			browserWorkbench: { params: BrowserWorkbenchRequest; response: BrowserWorkbenchResult };
		};
		messages: {
			updateStateChanged: NativeUpdateState;
			browserGuestEvent: { viewId: number; payload: unknown };
			windowChromeChanged: WindowChromeGeometry;
			windowStateChanged: NativeWindowState;
			windowFocusChanged: { focused: boolean };
			quitHintChanged: { hint: NativeQuitHint };
			nativeCommand: { command: NativeCommand };
		};
	};
};
