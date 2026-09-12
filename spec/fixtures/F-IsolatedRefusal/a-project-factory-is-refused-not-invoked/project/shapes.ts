import { Bucket, Composite } from "@tsad/shapes";

// Not interpretable: two parameters (S-FactoryParams). In open mode F-Call
// step 6 would import this module and invoke the definition instead.
export const Pair2 = Composite((a: { name: string }, b: string) => ({ bucket: new Bucket({ name: a.name + b }) }), "Pair2");
