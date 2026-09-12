import { Stage } from "./pipeline";

export const first = Stage({ name: "first" }).step;
export const both = { a: Stage({ name: "a" }).step, b: Stage({ name: "b" }).step };
