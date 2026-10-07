import { describe, makePair } from "@tsad/shapes";

const d = describe("x");

export const p = makePair({ d: d.described }, 1);
