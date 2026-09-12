import { makePair, Bucket } from "@tsad/shapes";

export const bucket = new Bucket({ name: "b" });
export const pair = makePair("left", bucket.name);
