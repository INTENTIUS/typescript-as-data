import { Bucket } from "@tsad/shapes";
import { named } from "./helpers";

const props = (name?: string) => (name ? { BucketName: name } : {});

export const a = new Bucket(props("a"));
export const b = new Bucket(props());
export const c = new Bucket(named("c"));
