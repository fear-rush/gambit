import { useEffect, useState, useRef, useCallback, useMemo, memo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
	fetchExchanges,
	searchPairs,
	fetchProductsForPair,
	type GroupedPair,
	type IndexedProduct,
	type MarketType,
} from "../services/productIndex";
import { useConnections } from "../hooks/useConnections";
import { EXCHANGE_SHORT } from "../lib/constants";

interface SearchDialogProps {
	open: boolean;
	onClose: () => void;
}

const TYPE_LABELS: Record<MarketType, string> = {
	spot: "Spot",
	perpetual: "Perp",
	futures: "Futures",
};

const TYPE_COLORS: Record<MarketType, string> = {
	spot: "text-emerald-400",
	perpetual: "text-amber-400",
	futures: "text-blue-400",
};

const TYPE_BG: Record<MarketType, string> = {
	spot: "bg-emerald-500/15 text-emerald-400",
	perpetual: "bg-amber-500/15 text-amber-400",
	futures: "bg-blue-500/15 text-blue-400",
};

/** Hook to debounce a value */
function useDebouncedValue<T>(value: T, ms: number): T {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const timer = setTimeout(() => setDebounced(value), ms);
		return () => clearTimeout(timer);
	}, [value, ms]);
	return debounced;
}

export function SearchDialog({ open, onClose }: SearchDialogProps) {
	const [query, setQuery] = useState("");
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [expandedPair, setExpandedPair] = useState<string | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const { setConnections, connections } = useConnections();

	// Filters
	const [activeExchanges, setActiveExchanges] = useState<Set<string>>(
		new Set(),
	);
	const [activeTypes, setActiveTypes] = useState<Set<MarketType>>(new Set());

	const connectedIds = useMemo(
		() => new Set<string>(connections.keys()),
		[connections],
	);

	// Debounce search query by 150ms so fast typing cancels stale requests
	const debouncedQuery = useDebouncedValue(query, 150);

	// Build stable filter arrays for query keys
	const exchangeFilter = useMemo(
		() => [...activeExchanges].sort(),
		[activeExchanges],
	);
	const typeFilter = useMemo(() => [...activeTypes].sort(), [activeTypes]);

	// Fetch exchanges list (cached, fetched once)
	const {
		data: allExchanges = [],
		isLoading: exchangesLoading,
	} = useQuery({
		queryKey: ["exchanges"],
		queryFn: ({ signal }) => fetchExchanges(signal),
		staleTime: 5 * 60 * 1000,
		enabled: open,
	});

	// Search pairs — auto-cancels previous request when query key changes.
	// `placeholderData` keeps stale results visible during refetch,
	// so we use `isFetching` (not `isLoading`) to show the spinner overlay.
	const {
		data: results = [],
		isLoading: searchLoading,
		isFetching: searchFetching,
	} = useQuery({
		queryKey: ["products-search", debouncedQuery, exchangeFilter, typeFilter],
		queryFn: ({ signal }) => {
			const filters: { exchanges?: string[]; types?: string[] } = {};
			if (exchangeFilter.length) filters.exchanges = exchangeFilter;
			if (typeFilter.length) filters.types = typeFilter;
			return searchPairs(
				debouncedQuery || undefined,
				Object.keys(filters).length ? filters : undefined,
				signal,
			);
		},
		staleTime: 30 * 1000,
		enabled: open,
		placeholderData: (prev) => prev,
	});

	// Pre-populate selected with current connections on open
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally only resets on open change, not connection changes
	useEffect(() => {
		if (!open) return;
		setSelected(new Set(connections.keys()));
		setExpandedPair(null);
		setActiveExchanges(new Set());
		setActiveTypes(new Set());
		setQuery("");
		setTimeout(() => inputRef.current?.focus(), 50);
	}, [open]);

	const toggleExchange = useCallback((exchange: string) => {
		setActiveExchanges((prev) => {
			const next = new Set(prev);
			if (next.has(exchange)) next.delete(exchange);
			else next.add(exchange);
			return next;
		});
	}, []);

	const toggleType = useCallback((type: MarketType) => {
		setActiveTypes((prev) => {
			const next = new Set(prev);
			if (next.has(type)) next.delete(type);
			else next.add(type);
			return next;
		});
	}, []);

	const toggleMarket = useCallback((marketId: string) => {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(marketId)) next.delete(marketId);
			else next.add(marketId);
			return next;
		});
	}, []);

	const selectAllForPair = useCallback(
		(_pairLocal: string, markets: string[]) => {
			setSelected((prev) => {
				const next = new Set(prev);
				const allSelected = markets.every((m) => next.has(m));
				if (allSelected) {
					for (const m of markets) next.delete(m);
				} else {
					for (const m of markets) next.add(m);
				}
				return next;
			});
		},
		[],
	);

	const handleExpand = useCallback((pairLocal: string) => {
		setExpandedPair((prev) => (prev === pairLocal ? null : pairLocal));
	}, []);

	const handleApply = useCallback(() => {
		setConnections([...selected]);
		onClose();
	}, [selected, setConnections, onClose]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		},
		[onClose],
	);

	const handleClearFilters = useCallback(() => {
		setActiveExchanges(new Set());
		setActiveTypes(new Set());
	}, []);

	if (!open) return null;

	// True when results exist from placeholderData but a new fetch is in-flight
	const isRefetching = searchFetching && !searchLoading;

	return (
		<div className="fixed inset-0 z-50 flex items-start justify-center pt-[5vh]">
			<button
				type="button"
				className="absolute inset-0 bg-black/70 cursor-default"
				onClick={onClose}
				aria-label="Close dialog"
			/>

			<div className="relative w-[860px] max-h-[80vh] bg-[#111113] border border-neutral-800 rounded-lg shadow-2xl flex flex-col overflow-hidden">
				{/* Header */}
				<div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
					<div className="flex items-center gap-3">
						<span className="text-sm font-semibold text-neutral-300">
							CONNECT
						</span>
						{selected.size > 0 && (
							<span className="text-xs px-2 py-0.5 bg-emerald-600/20 text-emerald-400 rounded">
								{selected.size} selected
							</span>
						)}
					</div>
					<button
						type="button"
						onClick={onClose}
						className="text-neutral-500 hover:text-neutral-300 text-lg leading-none"
					>
						&times;
					</button>
				</div>

				{/* Body */}
				<div className="flex flex-1 min-h-0">
					{/* Sidebar filters */}
					<div className="w-48 shrink-0 border-r border-neutral-800 overflow-y-auto p-3 space-y-4">
						<div>
							<div className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">
								Exchanges
							</div>
							{exchangesLoading ? (
								<SidebarSkeleton count={6} />
							) : (
								<div className="space-y-0.5">
									{allExchanges.map((ex) => {
										const isActive = activeExchanges.has(ex);
										return (
											<button
												key={ex}
												type="button"
												onClick={() => toggleExchange(ex)}
												className={`flex items-center gap-2 w-full px-2 py-1 text-left text-[11px] rounded ${
													isActive
														? "bg-neutral-700/50 text-neutral-200"
														: "text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800/30"
												}`}
											>
												<div
													className={`w-3 h-3 rounded-sm border flex items-center justify-center shrink-0 ${
														isActive
															? "bg-emerald-600 border-emerald-600"
															: "border-neutral-700"
													}`}
												>
													{isActive && (
														<span className="text-white text-[8px]">
															&#10003;
														</span>
													)}
												</div>
												{EXCHANGE_SHORT[ex] ?? ex.slice(0, 5)}
											</button>
										);
									})}
								</div>
							)}
						</div>

						<div>
							<div className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">
								Type
							</div>
							<div className="space-y-0.5">
								{(["spot", "perpetual", "futures"] as MarketType[]).map(
									(type) => {
										const isActive = activeTypes.has(type);
										return (
											<button
												key={type}
												type="button"
												onClick={() => toggleType(type)}
												className={`flex items-center gap-2 w-full px-2 py-1 text-left text-[11px] rounded ${
													isActive
														? "bg-neutral-700/50 text-neutral-200"
														: "text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800/30"
												}`}
											>
												<div
													className={`w-3 h-3 rounded-sm border flex items-center justify-center shrink-0 ${
														isActive
															? "bg-emerald-600 border-emerald-600"
															: "border-neutral-700"
													}`}
												>
													{isActive && (
														<span className="text-white text-[8px]">
															&#10003;
														</span>
													)}
												</div>
												<span
													className={isActive ? TYPE_COLORS[type] : ""}
												>
													{TYPE_LABELS[type]}
												</span>
											</button>
										);
									},
								)}
							</div>
						</div>

						{(activeExchanges.size > 0 || activeTypes.size > 0) && (
							<button
								type="button"
								onClick={handleClearFilters}
								className="text-[10px] text-neutral-500 hover:text-neutral-300 underline"
							>
								Clear filters
							</button>
						)}
					</div>

					{/* Main area */}
					<div className="flex-1 min-w-0 flex flex-col">
						<div className="px-4 py-2 border-b border-neutral-800/50">
							<div className="relative">
								<input
									ref={inputRef}
									type="text"
									value={query}
									onChange={(e) => setQuery(e.target.value)}
									placeholder="Search pairs (e.g. BTC, ETH, SOL...)"
									className="w-full px-3 py-2 text-sm bg-neutral-900/50 border border-neutral-800 rounded text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-neutral-600"
									onKeyDown={handleKeyDown}
								/>
								{searchFetching && (
									<div className="absolute right-3 top-1/2 -translate-y-1/2">
										<Spinner />
									</div>
								)}
							</div>
						</div>

						<div className="relative flex-1 overflow-y-auto">
							{/* Refetch overlay — dims stale results while new data loads */}
							{isRefetching && (
								<div className="absolute inset-x-0 top-0 z-10 flex justify-center pt-2 pointer-events-none">
									<div className="flex items-center gap-2 px-3 py-1 bg-neutral-800/90 rounded-full text-[10px] text-neutral-400">
										<Spinner />
										Updating...
									</div>
								</div>
							)}

							{searchLoading && (
								<div className="flex items-center justify-center py-12">
									<div className="flex items-center gap-2 text-sm text-neutral-500">
										<Spinner />
										Loading...
									</div>
								</div>
							)}

							{!searchLoading && results.length === 0 && (
								<div className="flex items-center justify-center py-12">
									<div className="text-sm text-neutral-600">
										No pairs found
									</div>
								</div>
							)}

							{!searchLoading && (
								<div className={isRefetching ? "opacity-60 transition-opacity duration-150" : ""}>
									{results.map((pair) => (
										<PairRow
											key={pair.local}
											pair={pair}
											expanded={expandedPair === pair.local}
											selectedCount={
												pair.markets.filter((m) => selected.has(m)).length
											}
											totalMarkets={pair.markets.length}
											connectedCount={
												pair.markets.filter((m) => connectedIds.has(m)).length
											}
											onToggleExpand={handleExpand}
											onSelectAll={selectAllForPair}
											onToggleMarket={toggleMarket}
											activeExchanges={activeExchanges}
											activeTypes={activeTypes}
											selected={selected}
											connectedIds={connectedIds}
										/>
									))}
								</div>
							)}
						</div>
					</div>
				</div>

				{/* Footer */}
				<div className="flex items-center justify-between px-4 py-3 border-t border-neutral-800">
					<span className="text-xs text-neutral-600">
						{searchFetching && results.length > 0
							? `${results.length} pairs (updating...)`
							: `${results.length} pairs`}
					</span>
					<div className="flex gap-2">
						<button
							type="button"
							onClick={onClose}
							className="px-3 py-1.5 text-xs text-neutral-400 hover:text-neutral-200"
						>
							Cancel
						</button>
						<button
							type="button"
							onClick={handleApply}
							className="px-4 py-1.5 text-xs bg-emerald-700 hover:bg-emerald-600 text-white rounded"
						>
							Apply ({selected.size})
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

// --- Spinner: tiny inline loading indicator ---

function Spinner() {
	return (
		<div className="animate-spin h-3 w-3">
		<svg
			className="h-3 w-3 text-neutral-500"
			viewBox="0 0 24 24"
			fill="none"
			role="img"
			aria-label="Loading"
		>
			<title>Loading</title>
			<circle
				className="opacity-25"
				cx="12"
				cy="12"
				r="10"
				stroke="currentColor"
				strokeWidth="4"
			/>
			<path
				className="opacity-75"
				fill="currentColor"
				d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
			/>
		</svg>
		</div>
	);
}

// --- SidebarSkeleton: pulse placeholders for exchanges loading ---

const SKELETON_WIDTHS = ["62%", "78%", "55%", "71%", "65%", "80%"];

function SidebarSkeleton({ count }: { count: number }) {
	return (
		<div className="space-y-1">
			{Array.from({ length: count }, (_, i) => (
				<div
					key={`skeleton-${SKELETON_WIDTHS[i % SKELETON_WIDTHS.length]}`}
					className="flex items-center gap-2 px-2 py-1"
				>
					<div className="w-3 h-3 rounded-sm bg-neutral-800 animate-pulse" />
					<div
						className="h-3 rounded bg-neutral-800 animate-pulse"
						style={{ width: SKELETON_WIDTHS[i % SKELETON_WIDTHS.length] }}
					/>
				</div>
			))}
		</div>
	);
}

// --- PairRow ---

interface PairRowProps {
	pair: GroupedPair;
	expanded: boolean;
	selectedCount: number;
	totalMarkets: number;
	connectedCount: number;
	onToggleExpand: (pairLocal: string) => void;
	onSelectAll: (pairLocal: string, markets: string[]) => void;
	onToggleMarket: (marketId: string) => void;
	activeExchanges: Set<string>;
	activeTypes: Set<MarketType>;
	selected: Set<string>;
	connectedIds: Set<string>;
}

const PairRow = memo(
	function PairRow({
		pair,
		expanded,
		selectedCount,
		totalMarkets,
		connectedCount,
		onToggleExpand,
		onSelectAll,
		onToggleMarket,
		activeExchanges,
		activeTypes,
		selected,
		connectedIds,
	}: PairRowProps) {
		const allSelected = selectedCount === totalMarkets && totalMarkets > 0;

		return (
			<div className="border-b border-neutral-800/30">
				<div className="flex items-center w-full text-left px-4 py-2 hover:bg-neutral-800/20">
					<button
						type="button"
						onClick={() => onSelectAll(pair.local, pair.markets)}
						className="shrink-0 mr-3"
					>
						<div
							className={`w-4 h-4 rounded border flex items-center justify-center ${
								allSelected
									? "bg-emerald-600 border-emerald-600"
									: selectedCount > 0
										? "bg-emerald-600/40 border-emerald-600"
										: "border-neutral-700"
							}`}
						>
							{(allSelected || selectedCount > 0) && (
								<span className="text-white text-[10px]">
									{allSelected ? "\u2713" : "\u2014"}
								</span>
							)}
						</div>
					</button>

					<button
						type="button"
						onClick={() => onToggleExpand(pair.local)}
						className="flex items-center gap-2 flex-1 min-w-0"
					>
						<span className="text-sm font-medium text-neutral-200 w-24 shrink-0">
							{pair.local}
						</span>

						<span className="text-[10px] font-semibold text-neutral-400 w-6 shrink-0 text-center">
							{pair.count}
						</span>

						<div className="flex gap-1 shrink-0">
							{pair.types.map((t) => (
								<span
									key={t}
									className={`text-[9px] px-1.5 py-px rounded ${TYPE_BG[t]}`}
								>
									{TYPE_LABELS[t]}
								</span>
							))}
						</div>

						<div className="flex-1 min-w-0 flex flex-wrap gap-1 ml-2 overflow-hidden max-h-5">
							{pair.exchanges.slice(0, 8).map((ex) => (
								<span
									key={ex}
									className="text-[9px] px-1 py-px rounded bg-neutral-800/80 text-neutral-500 whitespace-nowrap"
								>
									{EXCHANGE_SHORT[ex] ?? ex.slice(0, 4)}
								</span>
							))}
						</div>

						{connectedCount > 0 && (
							<span className="flex items-center gap-1 shrink-0 ml-2">
								<span className="w-2 h-2 rounded-full bg-emerald-500" />
								<span className="text-[9px] text-emerald-500">
									{connectedCount}
								</span>
							</span>
						)}

						<span
							className={`text-neutral-600 text-[10px] ml-2 shrink-0 ${
								expanded ? "rotate-180" : ""
							}`}
						>
							&#9660;
						</span>
					</button>
				</div>

				{expanded && (
					<ExpandedMarkets
						pairLocal={pair.local}
						selected={selected}
						connectedIds={connectedIds}
						activeExchanges={activeExchanges}
						activeTypes={activeTypes}
						onToggleMarket={onToggleMarket}
					/>
				)}
			</div>
		);
	},
	(prev, next) =>
		prev.pair === next.pair &&
		prev.expanded === next.expanded &&
		prev.selectedCount === next.selectedCount &&
		prev.totalMarkets === next.totalMarkets &&
		prev.connectedCount === next.connectedCount &&
		prev.activeExchanges === next.activeExchanges &&
		prev.activeTypes === next.activeTypes &&
		prev.selected === next.selected &&
		prev.connectedIds === next.connectedIds,
);

// --- ExpandedMarkets: fetches products on demand with TanStack Query ---

interface ExpandedMarketsProps {
	pairLocal: string;
	selected: Set<string>;
	connectedIds: Set<string>;
	activeExchanges: Set<string>;
	activeTypes: Set<MarketType>;
	onToggleMarket: (marketId: string) => void;
}

function ExpandedMarkets({
	pairLocal,
	selected,
	connectedIds,
	activeExchanges,
	activeTypes,
	onToggleMarket,
}: ExpandedMarketsProps) {
	const exchangeFilter = useMemo(
		() => [...activeExchanges].sort(),
		[activeExchanges],
	);
	const typeFilter = useMemo(() => [...activeTypes].sort(), [activeTypes]);

	const {
		data: products = [],
		isLoading,
		isFetching,
	} = useQuery({
		queryKey: ["products-pair", pairLocal, exchangeFilter, typeFilter],
		queryFn: ({ signal }) => {
			const filters: { exchanges?: string[]; types?: string[] } = {};
			if (exchangeFilter.length) filters.exchanges = exchangeFilter;
			if (typeFilter.length) filters.types = typeFilter;
			return fetchProductsForPair(
				pairLocal,
				Object.keys(filters).length ? filters : undefined,
				signal,
			);
		},
		staleTime: 30 * 1000,
		placeholderData: (prev) => prev,
	});

	const isRefetching = isFetching && !isLoading;

	return (
		<div className="relative bg-neutral-900/30 border-t border-neutral-800/20">
			{isLoading && (
				<div className="flex items-center gap-2 px-8 py-3 text-[11px] text-neutral-500">
					<Spinner />
					Loading markets...
				</div>
			)}
			{!isLoading && (
				<div className={isRefetching ? "opacity-60 transition-opacity duration-150" : ""}>
					{products.map((product) => (
						<MarketRow
							key={product.id}
							product={product}
							isSelected={selected.has(product.id)}
							isConnected={connectedIds.has(product.id)}
							onToggle={onToggleMarket}
						/>
					))}
				</div>
			)}
			{!isLoading && products.length === 0 && (
				<div className="px-8 py-3 text-[11px] text-neutral-600">
					No markets match current filters
				</div>
			)}
			{isRefetching && (
				<div className="absolute top-2 right-3">
					<Spinner />
				</div>
			)}
		</div>
	);
}

// --- MarketRow ---

interface MarketRowProps {
	product: IndexedProduct;
	isSelected: boolean;
	isConnected: boolean;
	onToggle: (marketId: string) => void;
}

const MarketRow = memo(function MarketRow({
	product,
	isSelected,
	isConnected,
	onToggle,
}: MarketRowProps) {
	return (
		<button
			type="button"
			onClick={() => onToggle(product.id)}
			className={`flex items-center w-full text-left px-8 py-1.5 ${
				isSelected ? "bg-emerald-500/10" : "hover:bg-neutral-800/20"
			}`}
		>
			<div
				className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 mr-3 ${
					isSelected
						? "bg-emerald-600 border-emerald-600"
						: "border-neutral-700"
				}`}
			>
				{isSelected && (
					<span className="text-white text-[9px]">&#10003;</span>
				)}
			</div>

			<span className="text-[11px] text-neutral-300 w-16 shrink-0 font-medium">
				{EXCHANGE_SHORT[product.exchange] ?? product.exchange.slice(0, 5)}
			</span>

			<span className="text-[11px] text-neutral-500 flex-1 min-w-0 truncate">
				{product.pair}
			</span>

			<span
				className={`text-[9px] px-1.5 py-px rounded shrink-0 ml-2 ${TYPE_BG[product.type]}`}
			>
				{TYPE_LABELS[product.type]}
			</span>

			{isConnected && (
				<span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 ml-2" />
			)}
		</button>
	);
});
