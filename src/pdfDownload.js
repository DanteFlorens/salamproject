import { getFlorensToken } from "./florensToken.js";

/**
 * Скачивает PDF с передачей X-Florens-Token.
 * @param {string} url
 * @param {string} [fallbackName]
 */
export async function downloadPdf(url, fallbackName = "document.pdf") {
  const token = getFlorensToken();
  if (!token) {
    throw new Error("Нет сессии PDF. Выйдите и войдите снова по PIN.");
  }

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "X-Florens-Token": token,
    },
  });

  if (!response.ok) {
    let message = `Ошибка ${response.status}`;
    try {
      const body = await response.json();
      if (body?.error) message = body.error;
    } catch {
      /* binary or empty */
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const disposition = response.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="?([^";]+)"?/i);
  link.href = objectUrl;
  link.download = match?.[1] || fallbackName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 2_000);
}
