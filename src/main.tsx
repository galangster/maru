import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ErrorBoundary } from "@/components/error-boundary";
import { Toaster } from "@/components/ui/sonner";
import { MailServiceProvider } from "@/features/mail/service";
import { installTroubleHooks } from "@/lib/debug-report";
import { isMobileShell, isTune } from "@/lib/env";
import "./index.css";

// The character tuning stage (?tune=1, P13) replaces the app outright — no
// mail service, no query client. Dev-only by construction: import.meta.env.DEV
// is statically false in release builds, so Rollup drops the dynamic import
// and dialkit never enters a shipped artifact.
const WrenStage = import.meta.env.DEV ? lazy(() => import("@/dev/wren-stage")) : null;
const App = lazy(() => import("@/App"));
const MobileApp = lazy(() =>
  import("@/mobile/MobileApp").then((module) => ({ default: module.MobileApp })),
);

function PlatformApp() {
  return isMobileShell ? <MobileApp /> : <App />;
}

// Before render, so a crash during mount still lands in the debug report.
installTroubleHooks();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // MailService.onEvent is the invalidation signal; polling on top of it
      // would only re-read the same in-memory data.
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found");
}

createRoot(rootElement).render(
  <StrictMode>
    {/* Outside the providers, not inside: a throw while MailServiceProvider is
        setting up is exactly the case that must not reach a white window. */}
    <ErrorBoundary>
      {WrenStage && isTune ? (
        <Suspense fallback={null}>
          <WrenStage />
        </Suspense>
      ) : (
        <QueryClientProvider client={queryClient}>
          <MailServiceProvider>
            <Suspense fallback={<div className="bg-canvas h-full" />}>
              <PlatformApp />
            </Suspense>
          </MailServiceProvider>
          <Toaster position="bottom-left" closeButton />
        </QueryClientProvider>
      )}
    </ErrorBoundary>
  </StrictMode>,
);
