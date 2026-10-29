export function windowControlsProbeScript(maximized: boolean): string {
	return `(() => {
	const selector = ${JSON.stringify(`[data-testid="window-maximize"][data-maximized="${maximized}"]`)};
	const deadline = Date.now() + 15000;
	const poll = () => {
		const element = document.querySelector(selector);
		if (element) element.click();
		else if (Date.now() < deadline) setTimeout(poll, 50);
	};
	poll();
})();`;
}
