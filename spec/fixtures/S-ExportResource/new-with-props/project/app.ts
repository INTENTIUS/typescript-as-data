import { Bucket } from "@tsad/shapes";

export const logs = new Bucket({ BucketName: "logs" }, { region: "eu" });
