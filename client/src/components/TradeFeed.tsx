import { useState, useCallback } from "react";
import { useTrades } from "../hooks/useTrades";
import { TradeRow } from "./TradeRow";

export function TradeFeed() {
	const [minAmount, setMinAmount] = useState(0);
	const trades = useTrades(minAmount);

	const handleMinAmountChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			setMinAmount(Number(e.target.value) || 0);
		},
		[],
	);

	return (
		<div className="flex flex-col h-full bg-[#0c0c0e]">
			<div className="flex items-center justify-between px-2 py-1 border-b border-neutral-800/50">
				<span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
					Trades
				</span>
				<div className="flex items-center gap-1">
					<span className="text-[10px] text-neutral-600">min $</span>
					<input
						type="number"
						value={minAmount || ""}
						onChange={handleMinAmountChange}
						placeholder="0"
						className="w-14 px-1 py-0 text-[10px] bg-transparent border border-neutral-800 rounded text-neutral-400 focus:outline-none focus:border-neutral-600"
					/>
				</div>
			</div>
			<div className="flex-1 overflow-y-auto overflow-x-hidden">
				{trades.map((trade) => (
					<TradeRow key={trade._id} trade={trade} />
				))}
				{trades.length === 0 && (
					<div className="text-center text-neutral-700 text-[11px] py-8">
						Waiting for trades...
					</div>
				)}
			</div>
		</div>
	);
}
