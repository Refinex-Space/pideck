import { refreshNavigationHistory, writeNavigationHistory } from "./browserHistory";
export interface NavigationDriver {
	read(): string;
	replace(fragment: string): void;
	push(fragment: string): void;
	onIncoming(handler: (fragment: string) => void): () => void;
}

export function browserNavigationDriver(): NavigationDriver {
	refreshNavigationHistory();
	return {
		read: () => window.location.hash,
		replace: (fragment) => {
			writeNavigationHistory(fragment, false);
		},
		push: (fragment) => {
			writeNavigationHistory(fragment, true);
		},
		onIncoming: (handler) => {
			const listener = () => {
				refreshNavigationHistory();
				handler(window.location.hash);
			};
			window.addEventListener("hashchange", listener);
			window.addEventListener("popstate", refreshNavigationHistory);
			return () => {
				window.removeEventListener("hashchange", listener);
				window.removeEventListener("popstate", refreshNavigationHistory);
			};
		},
	};
}
