import { makePair } from "@tsad/shapes";

const first = makePair("a", "b");
const second = makePair(1, 2);

export const member = makePair({ inner: second.left }, "m");
export const listed = makePair([first, { again: first }], "l");
