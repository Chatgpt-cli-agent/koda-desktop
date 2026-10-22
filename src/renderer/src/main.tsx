import "./assets/main.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { I18nProvider } from "./components/I18nProvider";
import { initAnalytics } from "./utils/analytics";

const appName = import.meta.env.VITE_HERMES_DESKTOP_APP_NAME?.trim();
// The window title names the *application*, not the product family. It says
// "Koda Desktop" because the bare product name "Koda" is also the name of the
// older Unsloth Studio shell, and two windows on one desktop both titled
// "Koda" cannot be told apart.
document.title = appName || "Koda Desktop";

// Initialize analytics (privacy-first, only if user consented and key is configured)
initAnalytics();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
);
