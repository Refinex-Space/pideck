import { cn } from "@thinkrail/ui/utils";

export interface SegmentedControlOption<T extends string> {
	id: T;
	label: string;
	testId?: string;
	disabled?: boolean;
}

export interface SegmentedControlProps<T extends string> {
	name: string;
	label: string;
	options: readonly SegmentedControlOption<T>[];
	value: T | null;
	onSelect: (value: T) => void;
	disabled?: boolean;
	testId?: string;
	className?: string;
	/** `raised` seats the selected option as a lifted chip in a recessed track; `flat` only tints it. */
	variant?: "flat" | "raised";
}

export function SegmentedControl<T extends string>({
	name,
	label,
	options,
	value,
	onSelect,
	disabled = false,
	testId,
	className,
	variant = "flat",
}: SegmentedControlProps<T>) {
	const raised = variant === "raised";
	return (
		<div
			role="radiogroup"
			aria-label={label}
			data-testid={testId}
			className={cn(
				"inline-flex h-32",
				raised
					? "items-center gap-2 rounded-md border border-control-border-default bg-container-sidebar-bg p-2 [[data-theme-appearance=light]_&]:bg-control-bg-selected"
					: "overflow-hidden rounded-sm bg-control-bg",
				className,
			)}
		>
			{options.map((option) => {
				const selected = value !== null && option.id === value;
				const optionDisabled = disabled || option.disabled === true;
				return (
					<label
						key={option.id}
						data-testid={option.testId}
						data-active={selected}
						className={cn(
							"relative cursor-pointer transition-colors",
							optionDisabled && "cursor-default",
						)}
					>
						<input
							type="radio"
							name={name}
							value={option.id}
							checked={selected}
							disabled={optionDisabled}
							onChange={() => onSelect(option.id)}
							className="peer sr-only inset-0"
						/>
						<span
							className={cn(
								"flex items-center px-12 tr-text-ui transition-colors",
								raised ? "h-28 rounded-sm border" : "h-32",
								selected
									? cn(
											"text-text-default",
											raised
												? "border-control-border-default bg-control-bg shadow-[var(--shadow-sm)]"
												: "rounded-sm bg-control-bg-selected",
										)
									: cn("text-text-muted hover:text-text-default", raised && "border-transparent"),
								"peer-focus-visible:ring-1 peer-focus-visible:ring-inset peer-focus-visible:ring-focus-ring",
								"peer-disabled:text-control-disabled-text peer-disabled:hover:text-control-disabled-text",
							)}
						>
							{option.label}
						</span>
					</label>
				);
			})}
		</div>
	);
}
