import { Bucket, upper } from "@tsad/shapes";

export const bucket = new Bucket({ name: "logs" });
export const shouted = upper(bucket.name);
