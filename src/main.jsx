import { hydratePersist } from "./persist.js";
import "./styles.css";

async function boot() {
  await hydratePersist();
  const { createRoot } = await import("react-dom/client");
  const { App } = await import("./App.jsx");
  createRoot(document.getElementById("root")).render(<App />);

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  }
}

boot().catch((error) => {
  console.error(error);
  const root = document.getElementById("root");
  if (root) {
    root.textContent = "Не удалось запустить Salam Residences. Обновите страницу.";
  }
});
