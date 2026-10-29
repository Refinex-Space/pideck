import "./monacoChrome.css";
import { useT } from "@thinkrail/locales/react";
import { type editor, KeyCode, KeyMod, Range } from "monaco-editor/editor/editor.api.js";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { type ResourceHost, useResourceHost, useResourcePreferences } from "../host";
import type { ResourceDescriptor, ResourceViewProps, SurfaceReview } from "../registry";
import { MonacoReviewZones } from "./MonacoReviewZones";
import { decorateEditorContextMenus } from "./monacoMenuIcons";
import {
	createFileEditor,
	disposeFileEditor,
	ensureMonaco,
	fileEditorOptions,
	languageForPath,
	revealLineNow,
	syncFileModel,
	warmLanguage,
} from "./monacoSetup";
import {
	applyReviewDecorations,
	attachReviewCommenting,
	attachReviewThreads,
	type MonacoReviewZoneState,
	type ReviewCommenting,
} from "./reviewWidgets";

function focusLine(review: SurfaceReview): number | null {
	const range = review.focus?.anchor.selectors.find((selector) => selector.kind === "lineRange");
	return range?.kind === "lineRange" ? range.startLine : null;
}

function isEditorViewState(value: unknown): value is editor.ICodeEditorViewState {
	if (typeof value !== "object" || value === null) return false;
	return Array.isArray(Reflect.get(value, "cursorState")) && Reflect.has(value, "viewState");
}

export function warm(host: ResourceHost, resource: ResourceDescriptor): void {
	ensureMonaco(host.code);
	setTimeout(() => warmLanguage(languageForPath(resource.path)), 0);
}

export default function MonacoEditor({
	resource,
	content,
	review,
	viewState,
	onViewState,
	editing,
	wordWrap,
	onEditorReady,
	onSelectionChange,
	onAddSelectionToChat,
}: ResourceViewProps) {
	const t = useT();
	const { fileLineWidth, fileLineWidthBounded } = useResourcePreferences();
	ensureMonaco(useResourceHost().code);
	const scope = useId().replace(/[^\w-]/g, "");
	const path = resource.path;
	const text = content.kind === "text" ? content.text : "";
	const commentLabel = t("review.widget.commentOnSelection");
	const options = {
		...fileEditorOptions(t, fileLineWidth, fileLineWidthBounded, resource.path),
		readOnly: !editing,
		...(wordWrap === false ? { wordWrap: "off" as const } : {}),
	};
	const addToChatLabel = t("files.addSelectionToChat");
	const saveLabel = t("files.save");
	const selectionRef = useRef<() => { text: string; startLine: number; endLine: number } | null>(
		() => null,
	);
	const canAddSelection = !!onAddSelectionToChat;
	const containerRef = useRef<HTMLDivElement | null>(null);
	const commentingRef = useRef<ReviewCommenting | null>(null);
	const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
	const threadsRef = useRef<ReturnType<typeof attachReviewThreads> | null>(null);
	const decorationsRef = useRef<string[]>([]);
	const freshMountRef = useRef(false);
	const appliedRef = useRef({ scope, path, text, options });
	const latestRef = useRef({
		scope,
		path,
		text,
		options,
		commentLabel,
		viewState,
		review,
		onViewState,
		editing,
		onEditorReady,
		onSelectionChange,
		onAddSelectionToChat,
		addToChatLabel,
	});
	const [reviewZones, setReviewZones] = useState<MonacoReviewZoneState>({
		threads: [],
		composer: null,
	});

	useLayoutEffect(() => {
		latestRef.current = {
			scope,
			path,
			text,
			options,
			commentLabel,
			viewState,
			review,
			onViewState,
			editing,
			onEditorReady,
			onSelectionChange,
			onAddSelectionToChat,
			addToChatLabel,
		};
	});

	useLayoutEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		const mount = latestRef.current;
		const codeEditor = createFileEditor(container, mount);
		editorRef.current = codeEditor;
		freshMountRef.current = true;
		appliedRef.current = {
			scope: mount.scope,
			path: mount.path,
			text: mount.text,
			options: mount.options,
		};
		const menuIcons = decorateEditorContextMenus(codeEditor);
		if (isEditorViewState(mount.viewState)) codeEditor.restoreViewState(mount.viewState);
		const threads = mount.review ? attachReviewThreads(codeEditor, setReviewZones) : null;
		const commenting = threads
			? attachReviewCommenting(codeEditor, threads, mount.commentLabel)
			: null;
		const selection = () => {
			const range = codeEditor.getSelection();
			const model = codeEditor.getModel();
			if (!range || range.isEmpty() || !model) return null;
			return {
				text: model.getValueInRange(range),
				startLine: range.startLineNumber,
				endLine:
					range.endColumn === 1 && range.endLineNumber > range.startLineNumber
						? range.endLineNumber - 1
						: range.endLineNumber,
			};
		};
		const changes = codeEditor.onDidChangeModelContent(() => {
			const text = codeEditor.getModel()?.getValue(undefined, true) ?? "";
			if (text !== latestRef.current.text) latestRef.current.editing?.onChange(text);
		});
		const selections = codeEditor.onDidChangeCursorSelection(() =>
			latestRef.current.onSelectionChange?.(selection()),
		);
		selectionRef.current = selection;
		mount.onEditorReady?.({
			focus: () => codeEditor.focus(),
			selection,
			find: () => {
				codeEditor.focus();
				void codeEditor.getAction("actions.find")?.run();
			},
			selectAll: () => {
				const model = codeEditor.getModel();
				if (!model) return;
				codeEditor.focus();
				codeEditor.setSelection(
					new Range(1, 1, model.getLineCount(), model.getLineMaxColumn(model.getLineCount())),
				);
			},
			comment: () => {
				if (!latestRef.current.editing)
					void codeEditor
						.getAction(`thinkrail.review.commentSelection.${codeEditor.getId()}`)
						?.run();
			},
		});
		threadsRef.current = threads;
		commentingRef.current = commenting;
		return () => {
			const saved = codeEditor.saveViewState();
			if (saved) latestRef.current.onViewState?.(saved);
			latestRef.current.onEditorReady?.(null);
			changes.dispose();
			selections.dispose();
			selectionRef.current = () => null;
			menuIcons.dispose();
			commenting?.dispose();
			threads?.dispose();
			threadsRef.current = null;
			commentingRef.current = null;
			editorRef.current = null;
			decorationsRef.current = [];
			disposeFileEditor(codeEditor);
		};
	}, []);

	useLayoutEffect(() => {
		const codeEditor = editorRef.current;
		if (!codeEditor) return;
		const saveAction = codeEditor.addAction({
			id: "pideck.file.save",
			label: saveLabel,
			keybindings: [KeyMod.CtrlCmd | KeyCode.KeyS],
			run: () => latestRef.current.editing?.onSave(),
		});
		const addAction = canAddSelection
			? codeEditor.addAction({
					id: "pideck.file.addSelection",
					label: addToChatLabel,
					precondition: "editorHasSelection",
					contextMenuGroupId: "9_cutcopypaste",
					contextMenuOrder: 3,
					run: () => {
						const value = selectionRef.current();
						if (value) latestRef.current.onAddSelectionToChat?.(value);
					},
				})
			: null;
		return () => {
			saveAction.dispose();
			addAction?.dispose();
		};
	}, [saveLabel, addToChatLabel, canAddSelection]);

	useLayoutEffect(() => {
		const codeEditor = editorRef.current;
		const applied = appliedRef.current;
		if (
			!codeEditor ||
			(applied.scope === scope && applied.path === path && applied.text === text)
		) {
			return;
		}
		syncFileModel(codeEditor, { scope, path, text }, applied.text);
		appliedRef.current = { ...applied, scope, path, text };
	}, [scope, path, text]);

	useLayoutEffect(() => {
		commentingRef.current?.setLabel(commentLabel);
	}, [commentLabel]);

	useLayoutEffect(() => {
		const codeEditor = editorRef.current;
		if (!codeEditor || appliedRef.current.options === options) return;
		appliedRef.current = { ...appliedRef.current, options };
		codeEditor.updateOptions(options);
	}, [options]);

	const isEditing = !!editing;
	useLayoutEffect(() => {
		if (!isEditing) return;
		const frame = requestAnimationFrame(() => {
			if (containerRef.current?.isConnected) editorRef.current?.focus();
		});
		return () => cancelAnimationFrame(frame);
	}, [isEditing]);

	const closeComposer = () => threadsRef.current?.closeComposer();
	const layoutReviewZones = () => threadsRef.current?.layout();

	useLayoutEffect(() => {
		const codeEditor = editorRef.current;
		const freshMount = freshMountRef.current;
		freshMountRef.current = false;
		if (!codeEditor) return;
		if (!review || editing) {
			threadsRef.current?.setThreads([]);
			threadsRef.current?.closeComposer();
			decorationsRef.current = codeEditor.deltaDecorations(decorationsRef.current, []);
			return;
		}
		threadsRef.current?.setThreads(review.threads);
		decorationsRef.current = applyReviewDecorations(
			codeEditor,
			decorationsRef.current,
			review.threads,
		);
		const line = focusLine(review);
		if (line === null) return;
		if (freshMount) revealLineNow(codeEditor, line);
		else codeEditor.revealLineInCenter(line);
		review.onFocusHandled();
	}, [review, editing]);

	return (
		<>
			<div ref={containerRef} className="h-full w-full text-left" />
			<MonacoReviewZones
				zones={reviewZones}
				review={review}
				onCloseComposer={closeComposer}
				onRendered={layoutReviewZones}
			/>
		</>
	);
}
