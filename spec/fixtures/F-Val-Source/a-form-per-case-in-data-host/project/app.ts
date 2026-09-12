import { Bucket, join, ref } from "@tsad/shapes";

export const scalars = { s: "text", n: 1.5, b: true, z: null, u: undefined };
export const nested = [1, { "a-b": [2, 3] }];
export const logs = new Bucket({ name: "logs" }, { region: "eu" });
export const arn = logs.arn;
export const tagged = join`arn:${Region.Name}:${logs.arn}`;
export const called = ref("logs");
