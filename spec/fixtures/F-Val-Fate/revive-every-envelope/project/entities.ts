import { Bucket, join, upper } from "@tsad/shapes";

export const bucket = new Bucket({ name: "logs" });
export const tagged = join`bucket-${1}`;
export const shouted = upper("done");
export const reference = { who: bucket.name };
