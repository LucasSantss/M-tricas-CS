import "dotenv/config";
import { ensureSchema } from "../lib/db";

ensureSchema()
  .then(() => {
    console.log("Schema OK: app_settings e departments criadas/confirmadas no Neon.");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
