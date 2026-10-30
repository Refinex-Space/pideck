/** One configured override of a language server, or a whole custom one. Persisted by the host. */
export interface LspServerOverride {
	/** Keep this server from starting. */
	disabled?: boolean;
	/** The command that starts it, as argv; required for a custom server. */
	command?: string[];
	/** The file extensions it serves, each with its leading dot; required for a custom server. */
	extensions?: string[];
	env?: Record<string, string>;
	/** Sent to the server in `initialize` and answered to its `workspace/configuration` requests. */
	initialization?: Record<string, unknown>;
}

export interface LspConfig {
	/** Master switch; off by default because every server is a long-lived child process. */
	enabled: boolean;
	/** Add the language server's errors to an `edit`/`write` result so the agent fixes them at once. */
	diagnostics: boolean;
	/** Offer the agent the `lsp` code-intelligence tool. */
	tool: boolean;
	/** A server nothing has used for this many minutes is stopped; the next use starts it again. */
	idleMinutes: number;
	/** Overrides by server id: a catalog id tunes a built-in server, any other id is a custom one. */
	servers: Record<string, LspServerOverride>;
}

export const LSP_IDLE_MINUTES = { min: 1, max: 240, default: 15 } as const;

export const DEFAULT_LSP_CONFIG: LspConfig = {
	enabled: false,
	diagnostics: true,
	tool: true,
	idleMinutes: LSP_IDLE_MINUTES.default,
	servers: {},
};

/** A built-in language server and whether this host can start it. */
export interface LspCatalogEntry {
	id: string;
	name: string;
	extensions: string[];
	/** The executable the host looks for; `null` when it needs no single binary. */
	binary: string | null;
	/** Whether the executable was found on this host's PATH. */
	available: boolean;
	/** How to get it when it is missing. */
	install: string;
}

export type LspServerState = "starting" | "ready" | "error" | "missing";

/** One language server the host runs, or tried to, for a workspace. */
export interface LspServerStatus {
	id: string;
	name: string;
	/** The project root it serves, relative to the workspace (`.` for the workspace itself). */
	root: string;
	state: LspServerState;
	/** The failure, or how to install a missing server. */
	message?: string;
	/** Documents it currently holds open. */
	files: number;
	errors: number;
	warnings: number;
	custom: boolean;
}

export interface LspWorkspaceStatus {
	/** Whether the host runs language servers at all (the master switch). */
	enabled: boolean;
	/** Whether the project is trusted; servers never start in one that is not. */
	trusted: boolean;
	servers: LspServerStatus[];
}

export interface LspOverview {
	config: LspConfig;
	catalog: LspCatalogEntry[];
	/** The asked workspace's servers; empty without a workspace. */
	status: LspWorkspaceStatus;
}

export type LspConfigUpdate = Partial<Omit<LspConfig, "servers">> & {
	/** An entry replaces that server's override; `null` removes it. */
	servers?: Record<string, LspServerOverride | null>;
};

/** Payload of the `lsp.status` channel: a workspace's servers changed. */
export interface LspStatusPayload extends LspWorkspaceStatus {
	workspaceId: string;
}
