import type { ProductsData, ProductsStorage } from "shared";

const PRODUCTS_EXPIRES_AFTER = 1000 * 60 * 60 * 24; // 24 hours

const productsCache = new Map<string, ProductsStorage>();

export async function fetchAndFormatProducts(
	exchangeId: string,
	endpoints: any[],
	exchange: { formatProducts(data: unknown): ProductsData },
	forceFetch?: boolean,
): Promise<ProductsData | null> {
	if (!Array.isArray(endpoints)) {
		endpoints = [endpoints];
	}

	// Check cache first
	if (!forceFetch) {
		const cached = productsCache.get(exchangeId);
		if (
			cached?.timestamp &&
			Date.now() - cached.timestamp < PRODUCTS_EXPIRES_AFTER
		) {
			console.debug(`[products.${exchangeId}] using cached products`);
			return cached.data;
		}
	}

	console.debug(
		`[products.${exchangeId}] fetching latest products...`,
		endpoints,
	);

	const data: unknown[] = [];

	for (let index = 0; index < endpoints.length; index++) {
		const instruction = endpoints[index];
		let endpoint: {
			url: string;
			method: string;
			data?: string;
			proxy?: boolean;
		};

		if (typeof instruction === "string") {
			endpoint = { url: instruction, method: "GET" };
		} else {
			endpoint = instruction as {
				url: string;
				method: string;
				data?: string;
				proxy?: boolean;
			};
		}

		try {
			const headers: Record<string, string> = {};
			if (endpoint.method === "POST" && endpoint.data) {
				headers["Content-Type"] = "application/json";
			}

			// Server fetches directly — no CORS proxy needed
			const response = await fetch(endpoint.url, {
				headers,
				method: endpoint.method,
				body: endpoint.data,
			});

			if (!response.ok) {
				throw new Error(
					`HTTP ${response.status} ${response.statusText}`,
				);
			}

			data[index] = await response.json();
		} catch (error) {
			console.warn(
				`[products.${exchangeId}] products request failed`,
				error,
			);
			data[index] = null;
		}
	}

	if (data.indexOf(null) !== -1) {
		return null;
	}

	const response = data.length === 1 ? data[0] : data;

	if (response) {
		try {
			const productsData = exchange.formatProducts(response);

			if (productsData) {
				productsCache.set(exchangeId, {
					exchange: exchangeId,
					data: productsData,
					timestamp: Date.now(),
				});
				return productsData;
			}
		} catch (error) {
			console.error(
				`[products.${exchangeId}] failed to format products`,
				error,
			);
		}
	}

	return null;
}
