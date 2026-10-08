import { Bucket, Composite } from "@tsad/shapes";

export const Store = Composite((props: { name: string }) => ({ bucket: new Bucket({ name: props.name }) }), "Store");
export const Wrap = Composite((props: { inner: unknown }) => ({ inner: props.inner }), "Wrap");
