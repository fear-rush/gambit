const DAY = 60 * 60 * 24;

function isOddTimeframe(timeframe: number) {
	return DAY % timeframe !== 0 && timeframe < DAY;
}

export function floorTimestampToTimeframe(
	timestamp: number,
	timeframe: number,
	isOdd?: boolean,
) {
	if (typeof isOdd === "undefined") {
		isOdd = isOddTimeframe(timeframe);
	}

	if (isOdd) {
		const dayOpen = Math.floor(timestamp / DAY) * DAY;
		return dayOpen + Math.floor((timestamp - dayOpen) / timeframe) * timeframe;
	}
	return Math.floor(timestamp / timeframe) * timeframe;
}
