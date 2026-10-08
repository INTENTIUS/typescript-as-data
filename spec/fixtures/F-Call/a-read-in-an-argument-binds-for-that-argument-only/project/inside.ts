import { makePair } from "@tsad/shapes";

const p = makePair("a", "b");

export const wrapped = makePair({ inner: p }, 0);
