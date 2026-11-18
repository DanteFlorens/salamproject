import { useEffect } from "react";
import { currentHouseId, getParty, getUnit, listHouses } from "./domain.js";
import { AppProvider, redirectTarget, sameHash, useApp } from "./app/store.jsx";
import { placeLabel, unitTitle } from "./app/labels.js";
import { AuthPage, AuthShell } from "./ui/Auth.jsx";
import { Shell } from "./ui/Shell.jsx";
import { HousesPage } from "./ui/HousesPage.jsx";
import { HousePage } from "./ui/HousePage.jsx";
import { ReportsPage } from "./ui/ReportsPage.jsx";
import { TasksPage } from "./ui/TasksPage.jsx";
import { TeamPage } from "./ui/TeamPage.jsx";
import { ApartmentPage, ResidentPage } from "./ui/DetailPages.jsx";

function pageTitle(path, me) {
  if (!me) {
    if (path.startsWith("/join")) return "Регистрация сотрудника";
    if (path === "/owner") return "Регистрация владельца";
    return "Вход";
  }
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return me.role === "lead" ? "Дома" : "Дом";
  if (parts[0] === "work") {
    const name = listHouses().find((item) => item.id === currentHouseId())?.name;
    return name && name !== "Salam Residences" ? name : "Объект";
  }
  if (parts[0] === "reports") return "Отчёты";
  if (parts[0] === "apartments" && parts[1]) {
    const unit = getUnit(decodeURIComponent(parts[1]));
    return unit ? `${unitTitle(unit)} ${placeLabel(unit)}` : "Не найдена";
  }
  if (parts[0] === "residents" && parts[1]) {
    const party = getParty(decodeURIComponent(parts[1]));
    return party ? party.name : "Жилец не найден";
  }
  if (parts[0] === "team") return "Команда";
  if (parts[0] === "tasks") return me.role === "crew" ? "Поручения" : "Задачи";
  return "Страница";
}

function documentTitle(path, me) {
  const title = pageTitle(path, me);
  return title === "Salam Residences" ? title : `${title} · Salam Residences`;
}

function resolvePage(path, me) {
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return me.role === "lead" ? <HousesPage /> : <HousePage />;
  if (parts[0] === "work") return <HousePage />;
  if (parts[0] === "reports") return <ReportsPage />;
  if (parts[0] === "apartments" && parts[1]) return <ApartmentPage code={decodeURIComponent(parts[1])} />;
  if (parts[0] === "residents" && parts[1]) return <ResidentPage id={decodeURIComponent(parts[1])} />;
  if (parts[0] === "team") return <TeamPage />;
  if (parts[0] === "tasks") return <TasksPage />;
  return (
    <article>
      <h1 className="page-title">Такой страницы нет</h1>
    </article>
  );
}

function Screen() {
  const { path, revision, me } = useApp();

  useEffect(() => {
    document.title = documentTitle(path, me);
  }, [path, revision, me]);

  const dest = redirectTarget(path, me);
  if (dest?.href && !sameHash(dest.href)) return null;

  if (!me) {
    return (
      <AuthShell>
        <AuthPage />
      </AuthShell>
    );
  }

  return <Shell>{resolvePage(path, me)}</Shell>;
}

export function App() {
  return (
    <AppProvider>
      <Screen />
    </AppProvider>
  );
}
