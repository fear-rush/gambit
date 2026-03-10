export const marketDecimals: Record<string, number> = {};

export function countDecimals(value: number) {
	const parts = value.toString().split(".");

	if (parts.length === 2) {
		return parts[1].length;
	}

	return 0;
}

export function formatAmount(amount: number, decimals?: number) {
	const negative = amount < 0;
	const d = decimals ?? undefined;

	amount = Math.abs(amount);

	let result: string;
	if (amount >= 1000000000) {
		result = +(amount / 1000000000).toFixed(d ?? 1) + " B";
	} else if (amount >= 1000000) {
		result = +(amount / 1000000).toFixed(d ?? 1) + " M";
	} else if (amount >= 1000) {
		result = +(amount / 1000).toFixed(d ?? 1) + " K";
	} else {
		result = String(+amount.toFixed(d ?? 2));
	}

	if (negative) {
		return "-" + result;
	}
	return result;
}

export function parseMarket(market: string) {
	const PARSE_MARKET_REGEX = /([^:]*):(.*)/;
	return market.match(PARSE_MARKET_REGEX)?.slice(1, 3) ?? [];
}
