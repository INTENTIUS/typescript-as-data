import { Bucket, Composite } from "@tsad/shapes";

export const Inner = Composite((props: { name: string }) => ({
  bucket: new Bucket({ name: props.name, tier: "inner" }),
}), "Inner");
