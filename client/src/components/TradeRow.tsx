import { memo } from "react";
import type { Trade } from "shared";
import { formatAmount } from "../services/productsService";
import { shortExchange } from "../lib/constants";

interface TradeRowProps {
	trade: Trade;
}

export const TradeRow = memo(function TradeRow({ trade }: TradeRowProps) {
	if (trade.price == null) return null;

	const isBuy = trade.side === "buy";
	const time = new Date(trade.timestamp);
	const timeStr = time.toLocaleTimeString("en-US", {
		hour12: false,
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});

	const amount = trade.amount ?? trade.price * trade.size;

	return (
		<div
			className={`flex items-center px-2 py-px text-[10px] font-mono leading-[18px] ${
				isBuy
					? "bg-emerald-500/[0.03] text-emerald-400/90"
					: "bg-red-500/[0.03] text-red-400/90"
			}`}
		>
			<span className="w-[52px] shrink-0 text-neutral-600">{timeStr}</span>
			<span
				className="w-9 shrink-0 truncate text-neutral-500"
				title={trade.exchange}
			>
				{shortExchange(trade.exchange)}
			</span>
			<span className="flex-1 text-right tabular-nums">
				{trade.price.toLocaleString(undefined, {
					minimumFractionDigits: 1,
					maximumFractionDigits: 1,
				})}
			</span>
			<span className="w-14 text-right tabular-nums">
				{formatAmount(amount)}
			</span>
		</div>
	);
});
