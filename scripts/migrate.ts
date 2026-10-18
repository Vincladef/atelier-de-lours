import { database, migrate } from "../server/db";
await migrate(database());
console.log(
  "Migrations PostgreSQL appliquées. Aucune donnée de démonstration importée.",
);
process.exit(0);
