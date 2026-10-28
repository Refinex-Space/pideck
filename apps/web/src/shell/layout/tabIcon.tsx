import {
	RiDiscussFill,
	RiDiscussLine,
	RiFileFill,
	RiFileLine,
	RiGitPullRequestFill,
	RiGitPullRequestLine,
	RiLayout2Fill,
	RiLayout2Line,
	RiListCheck3,
} from "@remixicon/react";
import { BookOpen, Folder, PanelLeft, PanelRight, SquareCheckBig, Terminal } from "lucide-react";
import type { ReactNode } from "react";
import { CustomIcon } from "../../components/CustomIcon";
import type { LayoutTab } from "./types";

export function tabIcon(tab: LayoutTab, active = false, cls = "size-14 shrink-0"): ReactNode {
	switch (tab.kind) {
		case "file":
			return active ? <RiFileFill className={cls} /> : <RiFileLine className={cls} />;
		case "diff":
			return active ? (
				<RiGitPullRequestFill className={cls} />
			) : (
				<RiGitPullRequestLine className={cls} />
			);
		case "changes":
			return <CustomIcon name={active ? "file-diff-fill" : "file-diff-line"} className={cls} />;
		case "chat":
			return null;
		case "document":
			return <RiListCheck3 className={cls} />;
		case "terminal":
			return <Terminal className={cls} />;
		case "tool":
			switch (tab.tool) {
				case "projects":
					return active ? <PanelLeft className={cls} /> : <PanelRight className={cls} />;
				case "specs":
					return <BookOpen className={cls} />;
				case "files":
					return <Folder className={cls} />;
				case "review":
					return active ? <RiDiscussFill className={cls} /> : <RiDiscussLine className={cls} />;
				case "plan":
					return <SquareCheckBig className={cls} />;
				default:
					return active ? <RiLayout2Fill className={cls} /> : <RiLayout2Line className={cls} />;
			}
	}
}
