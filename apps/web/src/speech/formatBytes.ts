/** Decimal megabytes/gigabytes, the unit model hosts and download dialogs use. */
export function formatBytes(bytes: number): string {
	if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
	if (bytes >= 1e7) return `${Math.round(bytes / 1e6)} MB`;
	return `${(bytes / 1e6).toFixed(1)} MB`;
}
