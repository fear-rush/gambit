import { create } from "zustand";

export interface ConnectionInfo {
	exchange: string;
	pair: string;
	url?: string;
}

interface ConnectionState {
	connections: Map<string, ConnectionInfo>;
	addConnection: (key: string, info: ConnectionInfo) => void;
	removeConnection: (key: string) => void;
	removeConnections: (keys: string[]) => void;
	clear: () => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
	connections: new Map(),
	addConnection: (key, info) =>
		set((state) => {
			const next = new Map(state.connections);
			next.set(key, info);
			return { connections: next };
		}),
	removeConnection: (key) =>
		set((state) => {
			const next = new Map(state.connections);
			next.delete(key);
			return { connections: next };
		}),
	removeConnections: (keys) =>
		set((state) => {
			const next = new Map(state.connections);
			for (const key of keys) {
				next.delete(key);
			}
			return { connections: next };
		}),
	clear: () => set({ connections: new Map() }),
}));
