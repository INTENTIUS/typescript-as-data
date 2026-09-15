import { Bucket, Composite } from "@tsad/shapes";

// Not interpretable: two parameters (S-FactoryParams). Before 2.0, open mode
// imported this module and invoked the definition; F-Call step 5 now refuses
// a project-file specifier outside `executing`.
export const Pair2 = Composite((a: { name: string }, b: string) => ({ bucket: new Bucket({ name: a.name + b }) }), "Pair2");
