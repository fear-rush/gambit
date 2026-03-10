// Pure math functions for computing trading indicators incrementally.

// ── EMA (Exponential Moving Average) ────────────────────────────────────────

export interface EMAState {
	period: number;
	k: number;
	value: number;
	count: number;
	/** Internal SMA accumulator used during warm-up. */
	_sum: number;
}

export function initEMA(period: number): EMAState {
	return {
		period,
		k: 2 / (period + 1),
		value: NaN,
		count: 0,
		_sum: 0,
	};
}

/**
 * Feed the next closing price and return the current EMA value.
 *
 * During the warm-up phase (fewer than `period` values) returns NaN.
 * The first real value is seeded with the SMA of the first `period` closes.
 */
export function updateEMA(state: EMAState, close: number): number {
	state.count++;

	if (state.count < state.period) {
		// Still accumulating for the initial SMA seed.
		state._sum += close;
		state.value = NaN;
		return NaN;
	}

	if (state.count === state.period) {
		// Seed the EMA with the SMA of the first `period` values.
		state._sum += close;
		state.value = state._sum / state.period;
		return state.value;
	}

	// Standard incremental EMA formula.
	state.value = close * state.k + state.value * (1 - state.k);
	return state.value;
}

// ── RSI (Relative Strength Index) — Wilder's smoothing ──────────────────────

export interface RSIState {
	period: number;
	prevClose: number;
	avgGain: number;
	avgLoss: number;
	count: number;
	value: number;
	/** Internal accumulators used during the initial warm-up window. */
	_gainSum: number;
	_lossSum: number;
}

export function initRSI(period: number): RSIState {
	return {
		period,
		prevClose: NaN,
		avgGain: 0,
		avgLoss: 0,
		count: 0,
		value: NaN,
		_gainSum: 0,
		_lossSum: 0,
	};
}

/**
 * Feed the next closing price and return the current RSI (0–100).
 *
 * Returns NaN until `period + 1` values have been supplied (we need
 * `period` *changes*, which requires `period + 1` closes).
 */
export function updateRSI(state: RSIState, close: number): number {
	state.count++;

	// First value — just record the close; no change to compute yet.
	if (state.count === 1) {
		state.prevClose = close;
		state.value = NaN;
		return NaN;
	}

	const change = close - state.prevClose;
	const gain = change > 0 ? change : 0;
	const loss = change < 0 ? -change : 0;
	state.prevClose = close;

	// Number of changes seen so far (one fewer than count).
	const changes = state.count - 1;

	if (changes < state.period) {
		// Still in the initial accumulation window.
		state._gainSum += gain;
		state._lossSum += loss;
		state.value = NaN;
		return NaN;
	}

	if (changes === state.period) {
		// Seed averages with a simple mean of the first `period` changes.
		state._gainSum += gain;
		state._lossSum += loss;
		state.avgGain = state._gainSum / state.period;
		state.avgLoss = state._lossSum / state.period;
	} else {
		// Wilder's smoothing.
		state.avgGain = (state.avgGain * (state.period - 1) + gain) / state.period;
		state.avgLoss = (state.avgLoss * (state.period - 1) + loss) / state.period;
	}

	if (state.avgLoss === 0) {
		state.value = 100;
		return 100;
	}

	const rs = state.avgGain / state.avgLoss;
	state.value = 100 - 100 / (1 + rs);
	return state.value;
}

// ── SMA (Simple Moving Average) — sliding window ────────────────────────────

export interface SMAState {
	period: number;
	values: number[];
	sum: number;
	count: number;
	value: number;
}

export function initSMA(period: number): SMAState {
	return {
		period,
		values: [],
		sum: 0,
		count: 0,
		value: NaN,
	};
}

/**
 * Feed the next value and return the current SMA.
 *
 * Returns NaN until `period` values have been supplied.
 */
export function updateSMA(state: SMAState, value: number): number {
	state.count++;
	state.values.push(value);
	state.sum += value;

	if (state.values.length < state.period) {
		state.value = NaN;
		return NaN;
	}

	if (state.values.length > state.period) {
		// Drop the oldest value to maintain the sliding window.
		state.sum -= state.values.shift() as number;
	}

	state.value = state.sum / state.period;
	return state.value;
}
