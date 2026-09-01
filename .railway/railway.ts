import { defineRailway, github, postgres, project, service } from "railway/iac";

// Maru sync service. Spec: docs/spec/MARU-ACCOUNT.md. Ops: ops/, server/README.md.
// The service builds server/Dockerfile from the server/ directory on every push
// to main. Secrets (Stripe, APNs, Pub/Sub) are set in Railway by hand and are
// not declared here; the allowlist and comp lists are literal because they are
// the beta's door.
export default defineRailway(() => {
  const db = postgres("Postgres");

  const sync = service("sync", {
    source: github("galangster/maru", { branch: "main", rootDirectory: "server" }),
    healthcheck: "/healthz",
    healthcheckTimeout: 60,
    domains: ["sync.getmaru.app"],
    env: {
      DATABASE_URL: db.env.DATABASE_URL,
      NODE_ENV: "production",
      PORT: "8787",
      MARU_ALLOWLIST: "nick@metadao.fi,galangsterr@gmail.com,nicholasgalang@gmail.com",
      MARU_COMPED: "nick@metadao.fi,galangsterr@gmail.com,nicholasgalang@gmail.com",
    },
  });

  return project("maru-sync", { resources: [db, sync] });
});
