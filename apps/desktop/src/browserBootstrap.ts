export const BROWSER_BOOTSTRAP = `// @bun
import { createServer } from "node:net";
import { dlopen, ptr } from "bun:ffi";
const reservation = createServer();
await new Promise((resolve, reject) => {
  reservation.once("error", reject);
  reservation.listen(0, "127.0.0.1", resolve);
});
const address = reservation.address();
if (!address || typeof address === "string") throw new Error("Cannot allocate browser endpoint");
await new Promise((resolve, reject) => reservation.close(error => error ? reject(error) : resolve()));
process.env.ELECTROBUN_CEF_REMOTE_DEBUGGING_PORT = String(address.port);
const key = Buffer.from("ELECTROBUN_CEF_REMOTE_DEBUGGING_PORT\\0");
const value = Buffer.from(String(address.port) + "\\0");
const library = process.platform === "win32"
  ? dlopen("ucrtbase.dll", { _putenv_s: { args: ["cstring", "cstring"], returns: "i32" } })
  : dlopen(process.platform === "darwin" ? "/usr/lib/libSystem.B.dylib" : "libc.so.6", { setenv: { args: ["cstring", "cstring", "i32"], returns: "i32" } });
const result = process.platform === "win32"
  ? library.symbols._putenv_s(ptr(key), ptr(value))
  : library.symbols.setenv(ptr(key), ptr(value), 1);
if (result !== 0) throw new Error("Cannot initialize browser endpoint");
await import("./electrobun-main.js");
`;
