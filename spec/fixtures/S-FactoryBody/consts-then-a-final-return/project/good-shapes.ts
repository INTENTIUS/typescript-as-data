import { Bucket, Composite } from "@tsad/shapes";

export const Good = Composite((props: { name: string }) => {
  const base = `${props.name}-base`;
  const { suffix } = { suffix: "x" };
  return { bucket: new Bucket({ name: `${base}-${suffix}` }) };
}, "Good");
