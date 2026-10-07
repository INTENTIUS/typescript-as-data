import { Bucket, Composite } from "@tsad/shapes";
import { Inner } from "./inner";

export const Outer = Composite((props: { name: string }) => ({
  main: Inner({ name: props.name }),
  fixed: Inner({ name: "fixed" }),
  side: new Bucket({ name: props.name }),
}), "Outer");
