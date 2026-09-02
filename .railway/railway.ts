import { defineRailway, github, postgres, project, service, volume } from "railway/iac";

// Maru sync service. Spec: docs/spec/MARU-ACCOUNT.md. Ops: ops/, server/README.md.
// The service builds server/Dockerfile from the server/ directory on every push
// to main. Secrets (Stripe, APNs, Pub/Sub) are set in Railway by hand and are
// not declared here; the allowlist and comp lists are literal because they are
// the beta's door. Omit means delete: every resource in the project is listed.
export default defineRailway(() => {
  const db = postgres("Postgres", { region: "us-west2" });
  const dbVolume = volume("postgres-volume", {
    alerts: { usage: { "80": {}, "95": {}, "100": {} } },
    allowOnlineResize: true,
    region: "us-west2",
    sizeMB: 50000,
  });

  const sync = service("sync", {
    source: github("galangster/maru", { branch: "main", rootDirectory: "server" }),
    healthcheck: "/healthz",
    healthcheckTimeout: 60,
    replicas: { "us-west2": 1 },
    domains: ["sync.getmaru.app"],
    env: {
      DATABASE_URL: db.env.DATABASE_URL,
      NODE_ENV: "production",
      PORT: "8787",
      PUBSUB_AUDIENCE: "maru-sync",
      PUBSUB_SERVICE_ACCOUNT: "maru-push@maru-mail-prod.iam.gserviceaccount.com",
      APNS_KEY_ID: "T89G5MWVBQ",
      APNS_TEAM_ID: "2M8UE59WH7",
      APNS_BUNDLE_ID: "app.getmaru.ios",
      APNS_ENV: "production",
      // APNS_KEY_P8 is a secret set by hand in Railway; never declared here.
      STRIPE_PRICE_MONTHLY: "price_1UB6LY9GRlyl1yugHzLceThn",
      STRIPE_PRICE_YEARLY: "price_1UB6LZ9GRlyl1yugQuUmI3tx",
      // STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are set by hand in Railway.
      MARU_ALLOWLIST: "nick@metadao.fi,galangsterr@gmail.com,nicholasgalang@gmail.com",
      MARU_COMPED: "nick@metadao.fi,galangsterr@gmail.com,nicholasgalang@gmail.com",
    },
  });

  return project("maru-sync", { resources: [sync, db, dbVolume] });
});
