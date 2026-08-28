import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import App from "@/App";
import { Toaster } from "@/components/ui/sonner";
import { MailServiceProvider } from "@/features/mail/service";
import "./index.css";

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
    <QueryClientProvider client={queryClient}>
      <MailServiceProvider>
        <App />
      </MailServiceProvider>
      <Toaster position="bottom-left" closeButton />
    </QueryClientProvider>
  </StrictMode>,
);
