import type { ProviderStatusReport } from "@thinkrail/contracts";
import type { LoginState } from "@/auth";

/** Whether signing in to Claude with a subscription should say it bills as Anthropic extra usage. */
export function warnsExtraUsageOnSignIn(
	login: Pick<LoginState, "providerId" | "method">,
	report: ProviderStatusReport | null,
): boolean {
	return (
		login.providerId === "anthropic" &&
		login.method === "oauth" &&
		report?.warnings?.anthropicExtraUsage !== false
	);
}
