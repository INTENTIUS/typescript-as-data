import { makePair } from "@tsad/shapes";

const p = makePair("a", "b");

export const plain = { inner: p };
export const wrapped = makePair({ inner: p }, 0);
