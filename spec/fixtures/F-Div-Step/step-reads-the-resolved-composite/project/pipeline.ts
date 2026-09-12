import { Bucket, Composite } from "@tsad/shapes";

export const Stage = Composite((props: { name: string }) => ({ step: new Bucket({ name: props.name }) }), "Stage");
