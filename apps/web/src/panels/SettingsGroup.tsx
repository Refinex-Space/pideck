import { Children, isValidElement, type ReactNode } from "react";
import { SETTINGS_CARD } from "./SettingsRow";

/**
 * `rows`: a bordered card of self-padded rows with edge-to-edge dividers. `block`: a padded card for free-form
 * content. `plain`: no card, for content that draws its own surface (editors, lists with their own borders).
 */
export type SettingsGroupLayout = "rows" | "block" | "plain";

const GROUP_BODY: Record<SettingsGroupLayout, string> = {
	rows: SETTINGS_CARD,
	block: "flex flex-col gap-16 rounded-lg border border-border-muted p-16",
	plain: "flex flex-col",
};

export interface SettingsGroupProps {
	/** Omitted when the page title already says it. */
	title?: string | undefined;
	description?: string | undefined;
	layout?: SettingsGroupLayout;
	/** Sits right of the title, e.g. a `SettingsHint` that keeps long explanations off the page. */
	titleAddon?: ReactNode;
	children: ReactNode;
	testId?: string;
}

export function SettingsGroup({
	title,
	description,
	layout = "rows",
	titleAddon,
	children,
	testId,
}: SettingsGroupProps) {
	return (
		<section data-testid={testId} className="flex flex-col">
			{title || description ? (
				<div className="flex flex-col gap-2 pb-8">
					{title && titleAddon ? (
						<div className="flex items-center gap-4">
							<h3 className="tr-title-section text-text-default">{title}</h3>
							{titleAddon}
						</div>
					) : title ? (
						<h3 className="tr-title-section text-text-default">{title}</h3>
					) : null}
					{description ? <p className="tr-text-metadata text-text-muted">{description}</p> : null}
				</div>
			) : null}
			<div className={GROUP_BODY[layout]}>{children}</div>
		</section>
	);
}

export interface SettingsPageContainerProps {
	children: ReactNode;
	testId?: string;
}

export function SettingsPageContainer({ children, testId }: SettingsPageContainerProps) {
	return (
		<div data-testid={testId} className="flex flex-col">
			{Children.toArray(children).map((child, index) => (
				<div
					key={isValidElement(child) && child.key !== null ? child.key : index}
					className="flex flex-col empty:hidden [:not(:empty)~&]:mt-32"
				>
					{child}
				</div>
			))}
		</div>
	);
}
