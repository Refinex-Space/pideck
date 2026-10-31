import { expect, test } from "bun:test";
import { insertDictation } from "./insertDictation";

test("fills an empty draft", () => {
	expect(insertDictation("", 0, " hello world ")).toEqual({ value: "hello world", caret: 11 });
});

test("appends after existing text with one space and keeps the draft", () => {
	expect(insertDictation("fix the bug", 11, "in parser")).toEqual({
		value: "fix the bug in parser",
		caret: 21,
	});
	expect(insertDictation("fix the bug ", 12, "in parser")).toEqual({
		value: "fix the bug in parser",
		caret: 21,
	});
});

test("inserts at the caret without replacing the selection", () => {
	const result = insertDictation("hello world", 5, "there");
	expect(result.value).toBe("hello there world");
	expect(result.caret).toBe("hello there".length);
});

test("CJK text joins directly while mixed boundaries stay readable", () => {
	expect(insertDictation("你好", 2, "世界")).toEqual({ value: "你好世界", caret: 4 });
	expect(insertDictation("请修复", 3, "parser 的问题")).toEqual({
		value: "请修复parser 的问题",
		caret: 13,
	});
	expect(insertDictation("run", 3, "测试")).toEqual({ value: "run测试", caret: 5 });
});

test("empty dictation and out-of-range carets are harmless", () => {
	expect(insertDictation("keep", 4, "  ")).toEqual({ value: "keep", caret: 4 });
	expect(insertDictation("ab", 99, "cd").value).toBe("ab cd");
});
