import { Bucket, Composite } from "@tsad/shapes";

export const Named = Composite(({ name }: { name: string }) => ({ bucket: new Bucket({ name }) }), "Named");
