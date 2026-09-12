import { labels, port } from "./defaults";

const http = port(8080);

export const service = {
  name: `svc-${labels.team}`,
  labels: { ...labels, exposed: true },
  ports: [http, port(8443)],
  replicas: labels.tier === "gold" ? 3 : 1,
};
