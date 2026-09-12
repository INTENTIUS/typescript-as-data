import { Bucket, Composite } from "@tsad/shapes";

export const Store = Composite((props: { name: string }) => ({
  data: new Bucket({ name: props.name }),
  logs: new Bucket({ name: `${props.name}-logs` }),
}), "Store");
