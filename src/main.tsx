import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { registerSW } from "virtual:pwa-register";
import App from "@/app/App";
import { AuthProvider } from "@/features/auth/AuthProvider";
import "@/styles/index.css";

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } } });
registerSW({
  immediate: true,
  onNeedRefresh() {
    window.location.reload();
  },
  onOfflineReady() {
    console.log("App is ready to work offline");
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter><AuthProvider><App /></AuthProvider></BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
console.log("[boot] url =", JSON.stringify(import.meta.env.VITE_SUPABASE_URL));
console.log("[boot] key =", JSON.stringify(import.meta.env.VITE_SUPABASE_ANON_KEY));
console.log("[boot] all env =", import.meta.env);