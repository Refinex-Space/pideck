import { expect, test } from "bun:test";
import { normalizeBrowserUrl } from "./browserUrl";

test.each([
	["example.com", "https://example.com/"],
	["localhost:3000/test", "http://localhost:3000/test"],
	["127.0.0.1:5173", "http://127.0.0.1:5173/"],
	["[::1]:5173", "http://[::1]:5173/"],
	["::1", "http://[::1]/"],
	["192.168.1.2", "http://192.168.1.2/"],
	["172.20.0.2", "http://172.20.0.2/"],
	["example.com:80", "http://example.com/"],
	["example.com:443", "https://example.com/"],
	["localhost.example.com", "https://localhost.example.com/"],
	["127.example.com", "https://127.example.com/"],
	["10.example.com", "https://10.example.com/"],
	["  https://example.com/a?q=1#b  ", "https://example.com/a?q=1#b"],
	["file:///tmp/test.html", "file:///tmp/test.html"],
	["javascript:alert(1)", null],
	["data:text/html,hello", null],
	["https://user:password@example.com", null],
	["https://example.com/\npath", null],
	["", null],
])("normalizes browser navigation %s", (input, expected) => {
	expect(normalizeBrowserUrl(input as string)).toBe(expected);
});
