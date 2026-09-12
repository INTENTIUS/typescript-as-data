import { makePair, describe, Bucket } from "@tsad/shapes";

export const bucket = new Bucket({ name: "b" });
export const pair = makePair("left", bucket.name);
export const nested = { inner: makePair(1, 2) };
