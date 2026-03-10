export function formatAmount(amount: number, decimals?: number) {
	const negative = amount < 0;
	const d = decimals ?? undefined;

	amount = Math.abs(amount);

	let result: string;
	if (amount >= 1_000_000_000) {
		result = `${+(amount / 1_000_000_000).toFixed(d ?? 1)} B`;
	} else if (amount >= 1_000_000) {
		result = `${+(amount / 1_000_000).toFixed(d ?? 1)} M`;
	} else if (amount >= 1_000) {
		result = `${+(amount / 1_000).toFixed(d ?? 1)} K`;
	} else {
		result = String(+amount.toFixed(d ?? 2));
	}

	return negative ? `-${result}` : result;
}
