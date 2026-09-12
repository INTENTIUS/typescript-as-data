import { Bucket } from "@tsad/shapes";

export const good = new Bucket({ BucketName: "logs" });
export const bad = new Bucket({});
