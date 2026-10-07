import { Bucket } from "@tsad/shapes";

const region = "eu";
export const bucket = new Bucket({ name: "assets", region, tags: { team: "web" } });
