/**
 * Block reward of Bitoreum mainnet: a direct port of GetBlockSubsidy() in the node's src/validation.cpp, byte-for-byte identical
 * to Raptoreum's (Bitoreum is a fork of Raptoreum's codebase and kept the same "owlings" schedule). Unlike a Bitcoin-style
 * halving, the subsidy steps DOWN by a small amount every 21262 blocks ("owlings") inside a handful of height brackets; it is not
 * simply `base / 2^halvings`. Amounts in atomic units (1 BTRM = 1e8). Smartnodes take a height/collateral-dependent percentage of it
 * inside the block, and the fees of the transactions come on top: the pool reads the exact reward of its own blocks from its wallet
 * (this is only used for display, e.g. an estimate on the website/API).
 **/
const RTM_BASE = 100000000;
const OWLINGS = 21262;

exports.minerReward = function (height) {
	if (!(height > 0)) return 0;
	let prevHeight = height - 1;
	let subsidy = 5000;
	if (prevHeight < 720) {
		subsidy = 4;
	} else if (prevHeight > 553531 && prevHeight < 2105657) {
		let multiplier = Math.floor((prevHeight - 553532) / OWLINGS);
		subsidy -= (multiplier * 10 + 10);
	} else if (prevHeight >= 2105657 && prevHeight < 5273695) {
		let multiplier = Math.floor((prevHeight - 2105657) / OWLINGS);
		subsidy -= (multiplier * 20 + 750);
	} else if (prevHeight >= 5273695 && prevHeight < 7378633) {
		let multiplier = Math.floor((prevHeight - 5273695) / OWLINGS);
		subsidy -= (multiplier * 10 + 3720);
	} else if (prevHeight >= 7378633 && prevHeight < 8399209) {
		let multiplier = Math.floor((prevHeight - 7378633) / OWLINGS);
		subsidy -= (multiplier * 5 + 4705);
	} else if (prevHeight >= 8399209 && prevHeight < 14735285) {
		subsidy = 55;
	} else if (prevHeight >= 14735285 && prevHeight < 15798385) {
		let multiplier = Math.floor((prevHeight - 14735285) / OWLINGS);
		subsidy -= (multiplier + 4946);
	} else if (prevHeight >= 15798385 && prevHeight < 25844304) {
		subsidy = 5;
	} else if (prevHeight >= 25844304) {
		subsidy = 0.001;
	}
	return Math.round(subsidy * RTM_BASE);
};
