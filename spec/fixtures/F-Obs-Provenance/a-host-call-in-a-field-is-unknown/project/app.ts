import { Bucket, count } from "@tsad/shapes";

export const bucket = new Bucket({ name: "logs", replicas: count(["a", "b"]) });
