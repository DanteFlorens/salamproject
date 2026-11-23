/** @deprecated Use db/postgres.mjs — SQLite удалён, это совместимый реэкспорт. */
export {
  STORE_KEYS,
  openDatabase,
  closeDatabase,
  getDatabasePath,
  getDatabaseSchema,
  listKv,
  getKv,
  putKv,
  putKvBatch,
  appendPayment,
  appendExpense,
  upsertHouseSpec,
  setActiveHouse,
  listHouses,
  listMoneyEvents,
  health,
} from "./postgres.mjs";
