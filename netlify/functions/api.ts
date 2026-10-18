import { handle } from "../../server/api";
import { runtime } from "../../server/runtime";
export default async (request: Request) => {
  try {
    return await handle(request, await runtime());
  } catch {
    return new Response(
      JSON.stringify({
        error:
          "L’atelier est temporairement indisponible. Réessaie dans quelques instants.",
      }),
      {
        status: 503,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      },
    );
  }
};
