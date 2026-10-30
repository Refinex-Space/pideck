function localHost(host: string): boolean {
	if (
		["localhost", "localhost.localdomain", "[::1]"].includes(host) ||
		/\.(localhost|local|test)$/.test(host)
	)
		return true;
	if (!/^\d+\.\d+\.\d+\.\d+$/.test(host)) return false;
	const parts = host.split(".").map(Number);
	if (parts.some((part) => part > 255)) return false;
	const [first, second] = parts;
	return (
		first === 127 ||
		first === 10 ||
		host === "0.0.0.0" ||
		(first === 192 && second === 168) ||
		(first === 169 && second === 254) ||
		(first === 172 && second !== undefined && second >= 16 && second <= 31)
	);
}

export function isLocalBrowserUrl(input: string): boolean {
	try {
		const url = new URL(input);
		return ["http:", "https:"].includes(url.protocol) && localHost(url.hostname.toLowerCase());
	} catch {
		return false;
	}
}

export function normalizeBrowserUrl(input: string): string | null {
	const text = input.trim();
	if (!text || text.length > 8192 || [...text].some((char) => char.charCodeAt(0) < 32)) return null;
	const explicit = /^[a-z][a-z\d+.-]*:/i.test(text) && !/^[^/:]+:\d+(?:[/?#]|$)/.test(text);
	try {
		const candidate = text === "::1" ? "[::1]" : text;
		const parsed = new URL(explicit ? candidate : `http://${candidate.replace(/^\/\//, "")}`);
		if (
			!["http:", "https:", "file:"].includes(parsed.protocol) ||
			parsed.username ||
			parsed.password
		)
			return null;
		if (!explicit) {
			const host = parsed.hostname.toLowerCase();
			const local = localHost(host);
			const port = candidate
				.replace(/^\/\//, "")
				.split(/[/?#]/, 1)[0]
				?.match(/:(\d+)$/)?.[1];
			if (!local && (!port || port === "443")) parsed.protocol = "https:";
		}
		return parsed.href;
	} catch {
		return null;
	}
}
