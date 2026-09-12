import { Bucket, Composite } from "@tsad/shapes";

export const Rest = Composite((...all: { name: string }[]) => ({ bucket: new Bucket({ name: all[0].name }) }), "Rest");
export const Two = Composite((a: { name: string }, b: string) => ({ bucket: new Bucket({ name: a.name + b }) }), "Two");
