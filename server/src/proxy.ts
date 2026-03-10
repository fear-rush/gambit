import type { ServerWebSocket } from "bun";

export interface WsData {
	type: "proxy";
	target: string;
	upstream: WebSocket | null;
}

export function handleWsOpen(ws: ServerWebSocket<WsData>) {
	const { target } = ws.data;

	console.log(`[proxy] client connected, opening upstream: ${target}`);

	const upstream = new WebSocket(target);
	ws.data.upstream = upstream;

	upstream.binaryType = "arraybuffer";

	upstream.onopen = () => {
		console.log(`[proxy] upstream connected: ${target}`);
	};

	upstream.onmessage = (event) => {
		try {
			if (ws.readyState === 1) {
				ws.send(event.data);
			}
		} catch {
			// client disconnected
		}
	};

	upstream.onclose = () => {
		console.log(`[proxy] upstream closed: ${target}`);
		try {
			ws.close();
		} catch {
			// already closed
		}
	};

	upstream.onerror = (event) => {
		console.error(`[proxy] upstream error: ${target}`, event);
		try {
			ws.close();
		} catch {
			// already closed
		}
	};
}

export function handleWsMessage(
	ws: ServerWebSocket<WsData>,
	message: string | ArrayBuffer | Uint8Array,
) {
	const { upstream } = ws.data;
	if (upstream && upstream.readyState === WebSocket.OPEN) {
		upstream.send(message);
	}
}

export function handleWsClose(ws: ServerWebSocket<WsData>) {
	const { upstream } = ws.data;
	if (upstream) {
		try {
			upstream.close();
		} catch {
			// already closed
		}
		ws.data.upstream = null;
	}
	console.log(`[proxy] client disconnected`);
}
