import { describe, it, expect, mock } from "bun:test";
import {
	handleProxyMessage,
	handleProxyClose,
} from "../../src/ws/proxy";

// ---------------------------------------------------------------------------
// handleProxyClose
// ---------------------------------------------------------------------------
describe("handleProxyClose", () => {
	it("closes the upstream connection", () => {
		const upstream = { close: mock(() => {}), readyState: WebSocket.OPEN };
		const ws = {
			data: { type: "proxy" as const, target: "wss://up.com", upstream },
		};

		handleProxyClose(ws as any);
		expect(upstream.close).toHaveBeenCalled();
		expect(ws.data.upstream).toBeNull();
	});

	it("handles null upstream gracefully", () => {
		const ws = {
			data: { type: "proxy" as const, target: "wss://up.com", upstream: null },
		};
		expect(() => handleProxyClose(ws as any)).not.toThrow();
	});

	it("swallows upstream.close() throwing (already closed)", () => {
		const upstream = {
			close: mock(() => {
				throw new Error("Already closed");
			}),
		};
		const ws = {
			data: { type: "proxy" as const, target: "wss://up.com", upstream },
		};
		expect(() => handleProxyClose(ws as any)).not.toThrow();
		expect(ws.data.upstream).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// handleProxyMessage
// ---------------------------------------------------------------------------
describe("handleProxyMessage", () => {
	it("forwards string messages to open upstream", () => {
		const upstream = { send: mock(() => {}), readyState: WebSocket.OPEN };
		const ws = {
			data: { type: "proxy" as const, target: "wss://up.com", upstream },
		};

		handleProxyMessage(ws as any, "hello");
		expect(upstream.send).toHaveBeenCalledWith("hello");
	});

	it("forwards binary (ArrayBuffer) messages", () => {
		const upstream = { send: mock(() => {}), readyState: WebSocket.OPEN };
		const ws = {
			data: { type: "proxy" as const, target: "wss://up.com", upstream },
		};

		const buf = new ArrayBuffer(4);
		handleProxyMessage(ws as any, buf);
		expect(upstream.send).toHaveBeenCalledWith(buf);
	});

	it("forwards Uint8Array messages", () => {
		const upstream = { send: mock(() => {}), readyState: WebSocket.OPEN };
		const ws = {
			data: { type: "proxy" as const, target: "wss://up.com", upstream },
		};

		const arr = new Uint8Array([1, 2, 3]);
		handleProxyMessage(ws as any, arr);
		expect(upstream.send).toHaveBeenCalledWith(arr);
	});

	it("does NOT forward when upstream is null", () => {
		const ws = {
			data: { type: "proxy" as const, target: "wss://up.com", upstream: null },
		};
		expect(() => handleProxyMessage(ws as any, "msg")).not.toThrow();
	});

	it("does NOT forward when upstream is CLOSED", () => {
		const upstream = { send: mock(() => {}), readyState: WebSocket.CLOSED };
		const ws = {
			data: { type: "proxy" as const, target: "wss://up.com", upstream },
		};
		handleProxyMessage(ws as any, "msg");
		expect(upstream.send).not.toHaveBeenCalled();
	});

	it("does NOT forward when upstream is CONNECTING", () => {
		const upstream = { send: mock(() => {}), readyState: WebSocket.CONNECTING };
		const ws = {
			data: { type: "proxy" as const, target: "wss://up.com", upstream },
		};
		handleProxyMessage(ws as any, "msg");
		expect(upstream.send).not.toHaveBeenCalled();
	});

	it("does NOT forward when upstream is CLOSING", () => {
		const upstream = { send: mock(() => {}), readyState: WebSocket.CLOSING };
		const ws = {
			data: { type: "proxy" as const, target: "wss://up.com", upstream },
		};
		handleProxyMessage(ws as any, "msg");
		expect(upstream.send).not.toHaveBeenCalled();
	});
});
