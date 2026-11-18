export function readPath(hash = typeof location !== "undefined" ? location.hash : "") {
  const raw = String(hash || "").replace(/^#/, "");
  return raw.startsWith("/") ? raw : "/";
}

export function sameHash(href, hash = typeof location !== "undefined" ? location.hash : "") {
  return hash === `#${href}` || (href === "/" && (!hash || hash === "#/" || hash === "#"));
}

export function isAuthPath(path) {
  return path === "/login" || path === "/owner" || path === "/join" || path.startsWith("/join/");
}

export function redirectTarget(path, me) {
  if (!me) return isAuthPath(path) ? null : { href: "/login" };
  if (isAuthPath(path)) return { href: me.role === "crew" ? "/tasks" : me.role === "lead" ? "/" : "/work" };
  if (me.role === "crew" && path !== "/tasks") return { href: "/tasks" };
  if (me.role === "manager" && (path === "/" || path === "/houses")) return { href: "/work" };
  if (me.role === "lead") {
    if (path === "/houses") return { href: "/" };
    if (path === "/apartments" || path === "/residents") {
      return { href: "/work", desk: path === "/residents" ? "people" : "plan" };
    }
    if (path === "/ledger") return { href: "/reports" };
  }
  return null;
}

export function homeFor(me) {
  if (!me) return "/login";
  if (me.role === "crew") return "/tasks";
  if (me.role === "lead") return "/";
  return "/work";
}
