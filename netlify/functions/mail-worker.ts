import { schedule } from "@netlify/functions";
import { runtime } from "../../server/runtime";
import { runMailWorker } from "../../server/mail";
export const handler = schedule("*/15 * * * *", async () => {
  try {
    await runMailWorker(await runtime());
    return { statusCode: 200 };
  } catch {
    return { statusCode: 503 };
  }
});
