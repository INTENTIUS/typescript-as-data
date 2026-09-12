import { Bucket, join, ref, upper } from "@tsad/shapes";

export const logs = new Bucket({ name: "logs" });
export const arn = logs.arn;
export const tagged = join`arn:${"logs"}`;
export const called = ref("logs");
export const helped = upper("logs");
