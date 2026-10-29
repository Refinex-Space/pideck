import * as ContextMenuPrimitive from "@radix-ui/react-context-menu";
import { RiArrowRightSLine as ChevronRight } from "@remixicon/react";
import type * as React from "react";
import { menuContentClass, menuItemClass, menuSeparatorClass } from "./menu-styles";
import { cn } from "./utils";

const ContextMenu = ContextMenuPrimitive.Root;
const ContextMenuTrigger = ContextMenuPrimitive.Trigger;
const ContextMenuSub = ContextMenuPrimitive.Sub;

function ContextMenuContent({
	className,
	...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Content>) {
	return (
		<ContextMenuPrimitive.Portal>
			<ContextMenuPrimitive.Content
				className={cn(
					menuContentClass,
					"max-h-[min(60vh,var(--radix-context-menu-content-available-height))]",
					className,
				)}
				{...props}
			/>
		</ContextMenuPrimitive.Portal>
	);
}

function ContextMenuItem({
	className,
	...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Item>) {
	return <ContextMenuPrimitive.Item className={cn(menuItemClass, className)} {...props} />;
}

function ContextMenuSubTrigger({
	className,
	children,
	...props
}: React.ComponentProps<typeof ContextMenuPrimitive.SubTrigger>) {
	return (
		<ContextMenuPrimitive.SubTrigger
			className={cn(menuItemClass, "data-[state=open]:bg-control-bg-selected", className)}
			{...props}
		>
			{children}
			<ChevronRight className="ml-auto" />
		</ContextMenuPrimitive.SubTrigger>
	);
}

function ContextMenuSubContent({
	className,
	...props
}: React.ComponentProps<typeof ContextMenuPrimitive.SubContent>) {
	return (
		<ContextMenuPrimitive.Portal>
			<ContextMenuPrimitive.SubContent
				className={cn(
					menuContentClass,
					"min-w-[10rem] max-h-[min(60vh,var(--radix-context-menu-content-available-height))]",
					className,
				)}
				{...props}
			/>
		</ContextMenuPrimitive.Portal>
	);
}

function ContextMenuLabel({
	className,
	...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Label>) {
	return (
		<ContextMenuPrimitive.Label
			className={cn("px-8 py-4 tr-text-eyebrow text-text-muted", className)}
			{...props}
		/>
	);
}

function ContextMenuSeparator({
	className,
	...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Separator>) {
	return (
		<ContextMenuPrimitive.Separator className={cn(menuSeparatorClass, className)} {...props} />
	);
}

export {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuLabel,
	ContextMenuSeparator,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuTrigger,
};
