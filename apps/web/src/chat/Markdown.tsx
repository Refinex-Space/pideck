import { MermaidView } from "@thinkrail/ext-visualize/web";
import { type ComponentProps, memo, type ReactNode, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useHighlightedCode } from "@/lib/highlightCode";
import { CodeFrame } from "./CodeFrame";
import { createMarkdownSplitter } from "./markdownBlocks";

const CHAT_PROSE =
	"tr-prose-chat max-w-none break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_a]:text-primary [&_a]:underline [&_li]:my-2 [&_ol]:my-8 [&_ol]:list-decimal [&_ol]:pl-16 [&_p]:my-8 [&_table]:w-full [&_table]:border-collapse [&_td]:border-border-muted [&_td]:border-b [&_td]:px-12 [&_td]:py-8 [&_th]:border-border-muted [&_th]:border-b [&_th]:px-12 [&_th]:py-8 [&_th]:text-left [&_:is(td,th):not(:last-child)]:border-r [&_tbody_tr:last-child_td]:border-b-0 [&_ul]:my-8 [&_ul]:list-disc [&_ul]:pl-16";

type ReactMarkdownProps = ComponentProps<typeof ReactMarkdown>;

interface MarkdownProps {
	text: string;
	className?: string;
	remarkPlugins?: ReactMarkdownProps["remarkPlugins"];
	rehypePlugins?: ReactMarkdownProps["rehypePlugins"];
	urlTransform?: ReactMarkdownProps["urlTransform"];
	components?: ReactMarkdownProps["components"];
}

interface MarkdownBlockProps extends Omit<MarkdownProps, "text" | "className"> {
	raw: string;
	separated: boolean;
}

export const Markdown = memo(function Markdown({
	text,
	className = CHAT_PROSE,
	remarkPlugins,
	components,
	...rest
}: MarkdownProps) {
	return (
		<div className={className}>
			<ReactMarkdown
				remarkPlugins={withDefaultPlugins(remarkPlugins)}
				components={withDefaultComponents(components)}
				{...rest}
			>
				{text}
			</ReactMarkdown>
		</div>
	);
});

export const BlockMarkdown = memo(function BlockMarkdown({
	text,
	className = CHAT_PROSE,
	remarkPlugins,
	components,
	...rest
}: MarkdownProps) {
	const [split] = useState(createMarkdownSplitter);
	const { blocks } = useMemo(() => split(text), [split, text]);
	const plugins = useMemo(() => withDefaultPlugins(remarkPlugins), [remarkPlugins]);
	const merged = useMemo(() => withDefaultComponents(components), [components]);
	return (
		<div className={className}>
			{blocks.map((block) => (
				<MarkdownBlock
					key={block.start}
					raw={block.raw}
					separated={block.start > 0}
					remarkPlugins={plugins}
					components={merged}
					{...rest}
				/>
			))}
		</div>
	);
});

const MarkdownBlock = memo(function MarkdownBlock({
	raw,
	separated,
	...props
}: MarkdownBlockProps) {
	return (
		<>
			{separated && "\n"}
			<ReactMarkdown {...props}>{raw}</ReactMarkdown>
		</>
	);
});

function Table({ children }: { children?: ReactNode }) {
	return (
		<div className="my-16 overflow-x-auto rounded-md border border-border-muted">
			<table>{children}</table>
		</div>
	);
}

function Anchor({ href, children }: { href?: string | undefined; children?: ReactNode }) {
	return (
		<a href={href} target="_blank" rel="noopener noreferrer">
			{children}
		</a>
	);
}

function CodeBlock({
	className,
	children,
}: {
	className?: string | undefined;
	children?: ReactNode;
}) {
	const lang = /language-(\w+)/.exec(className ?? "")?.[1];
	const code = String(children ?? "").replace(/\n$/, "");
	if (lang === "mermaid") return <MermaidBlock code={code} />;
	if (!lang) {
		if (!code.includes("\n")) {
			return <code className="rounded-xs bg-container-elevated-bg px-4 py-2">{children}</code>;
		}
		return (
			<CodeFrame code={code}>
				<pre className="overflow-auto p-8">{code}</pre>
			</CodeFrame>
		);
	}
	return (
		<CodeFrame code={code} lang={lang}>
			<ShikiCode code={code} lang={lang} />
		</CodeFrame>
	);
}

function MermaidBlock({ code }: { code: string }) {
	const [settled, setSettled] = useState<string | null>(null);
	useEffect(() => {
		const timer = setTimeout(() => setSettled(code), 200);
		return () => clearTimeout(timer);
	}, [code]);

	const source = <ShikiCode code={code} lang="mermaid" />;
	if (settled !== code) {
		return (
			<CodeFrame code={code} lang="mermaid">
				{source}
			</CodeFrame>
		);
	}
	return (
		<div className="whitespace-normal">
			<MermaidView source={code} fallback={source} className="my-8" />
		</div>
	);
}

function ShikiCode({ code, lang }: { code: string; lang: string }) {
	const html = useHighlightedCode(code, lang);

	if (html === null) {
		return <pre className="overflow-auto p-8 text-text-default">{code}</pre>;
	}
	return (
		<div
			className="overflow-auto [&_pre]:!m-0 [&_pre]:!bg-transparent [&_pre]:p-8"
			dangerouslySetInnerHTML={{ __html: html }}
		/>
	);
}

const DEFAULT_REMARK_PLUGINS: ReactMarkdownProps["remarkPlugins"] = [remarkGfm];
const DEFAULT_COMPONENTS: ReactMarkdownProps["components"] = {
	code: CodeBlock,
	a: Anchor,
	table: Table,
};

function withDefaultPlugins(plugins: ReactMarkdownProps["remarkPlugins"]) {
	return plugins ? [remarkGfm, ...plugins] : DEFAULT_REMARK_PLUGINS;
}

function withDefaultComponents(components: ReactMarkdownProps["components"]) {
	return components ? { ...DEFAULT_COMPONENTS, ...components } : DEFAULT_COMPONENTS;
}
