import { Stack, makePair } from "@tsad/shapes";

const stack = Stack({ left: 1, right: 2 });
const pair = makePair("l", "r");
const alias = pair;

export { stack, pair, alias as again };
