import { Stack, makePair } from "@tsad/shapes";
import { Store } from "./store";

const published = Stack({ left: 1, right: 2 });
const registered = Store({ name: "b" });
const plain = makePair("l", "r");
const again = published;

export const pair = published.pair;
export const data = registered.data;
export const whole = plain;
export const left = plain.left;
export const { pair: chained } = again;
