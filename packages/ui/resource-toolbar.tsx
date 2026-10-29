import { createContext, type ReactNode, useContext } from "react";
import { createPortal } from "react-dom";

const ToolbarTarget = createContext<HTMLElement | null>(null);
export function ResourceToolbarProvider({
	target,
	children,
}: {
	target: HTMLElement | null;
	children: ReactNode;
}) {
	return <ToolbarTarget.Provider value={target}>{children}</ToolbarTarget.Provider>;
}
export function ResourceToolbar({ children }: { children: ReactNode }) {
	const target = useContext(ToolbarTarget);
	return target ? createPortal(children, target) : children;
}
