import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import App from "@/App";
import { ErrorBoundary } from "@/components/error-boundary";
import { Toaster } from "@/components/ui/sonner";
import { MailServiceProvider } from "@/features/mail/service";
import { installTroubleHooks } from "@/lib/debug-report";
import "./index.css";

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
      <QueryClientProvider client={queryClient}>
        <MailServiceProvider>
          <App />
        </MailServiceProvider>
        <Toaster position="bottom-left" closeButton />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
