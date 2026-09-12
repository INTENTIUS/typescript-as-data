import { Bucket } from "@tsad/shapes";

export const scalars = { s: "text", n: 1.5, b: false, z: null, u: undefined };
export const list = [1, "two", [3], { four: 4 }];
export const bucket = new Bucket({ name: "logs" });
export const reference = { arn: bucket.arn };
