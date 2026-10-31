import { Children, isValidElement, type ReactNode } from "react";
import { SETTINGS_ROWS_CONTAINER } from "./SettingsRow";

export interface SettingsGroupProps {
	title: string;
	description?: string | undefined;
	/** Sits right of the title, e.g. a `SettingsHint` that keeps long explanations off the page. */
	titleAddon?: ReactNode;
	children: ReactNode;
	testId?: string;
}

export function SettingsGroup({
	title,
	description,
	titleAddon,
	children,
	testId,
}: SettingsGroupProps) {
	return (
		<section data-testid={testId} className="flex flex-col">
			<div className="flex flex-col gap-2 pb-12">
				{titleAddon ? (
					<div className="flex items-center gap-4">
						<h3 className="tr-title-section text-text-default">{title}</h3>
						{titleAddon}
					</div>
				) : (
					<h3 className="tr-title-section text-text-default">{title}</h3>
				)}
				{description ? <p className="tr-text-metadata text-text-muted">{description}</p> : null}
			</div>
			<div className={SETTINGS_ROWS_CONTAINER}>{children}</div>
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
