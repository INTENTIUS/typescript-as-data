import { Bucket, Pair } from "@tsad/shapes";

export const withProps = new Bucket({ name: "a" });
export const withAttributes = new Bucket({ name: "b" }, { region: "eu" });
export const spread = new Pair(1, "two");
