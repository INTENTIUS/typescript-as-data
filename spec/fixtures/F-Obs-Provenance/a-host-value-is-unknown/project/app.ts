import { Bucket, SIZES } from "@tsad/shapes";

export const bucket = new Bucket({ name: "logs", replicas: SIZES.large });
export const large = SIZES.large;
