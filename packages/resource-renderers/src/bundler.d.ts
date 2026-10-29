declare module "*?worker" {
	const WorkerConstructor: new () => Worker;
	export default WorkerConstructor;
}

declare module "*?url" {
	const url: string;
	export default url;
}

declare module "*.css";

declare module "*.css?inline" {
	const css: string;
	export default css;
}
