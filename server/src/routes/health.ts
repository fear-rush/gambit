import { CORS_HEADERS } from "../config/constants";

export function handleHealth(): Response {
	return Response.json(
		{ status: "ok", uptime: process.uptime() },
		{ headers: CORS_HEADERS },
	);
}
