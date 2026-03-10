import { describe, it, expect } from "bun:test";
import { handleHealth } from "../../src/routes/health";

describe("handleHealth", () => {
	it("returns a Response instance", () => {
		expect(handleHealth()).toBeInstanceOf(Response);
	});

	it("returns HTTP 200", () => {
		expect(handleHealth().status).toBe(200);
	});

	it("body contains status 'ok'", async () => {
		const body = await handleHealth().json();
		expect(body.status).toBe("ok");
	});

	it("body contains uptime as a non-negative number", async () => {
		const body = await handleHealth().json();
		expect(typeof body.uptime).toBe("number");
		expect(body.uptime).toBeGreaterThanOrEqual(0);
	});

	it("includes all CORS headers", () => {
		const res = handleHealth();
		expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
		expect(res.headers.get("Access-Control-Allow-Methods")).toBe(
			"GET, POST, OPTIONS",
		);
		expect(res.headers.get("Access-Control-Allow-Headers")).toBe(
			"Content-Type",
		);
	});

	it("content-type is application/json", () => {
		const res = handleHealth();
		expect(res.headers.get("content-type")).toContain("application/json");
	});
});
