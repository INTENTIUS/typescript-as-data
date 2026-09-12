import { Bucket, Composite } from "@tsad/shapes";

export const NoReturn = Composite((props: { name: string }) => {
  const bucket = new Bucket({ name: props.name });
}, "NoReturn");

export const Empty = Composite(() => {}, "Empty");
