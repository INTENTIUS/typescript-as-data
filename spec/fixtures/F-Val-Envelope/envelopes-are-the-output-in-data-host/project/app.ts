import { Bucket, join, ref } from "@tsad/shapes";

export const tagged = join`bucket-${1}`;
export const called = ref("Logs");
export const resource = new Bucket({ name: "logs" });
