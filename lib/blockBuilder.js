/**
 * Bitoreum Pool (based on cryptonote-nodejs-pool, GPL-2.0)
 *
 * Builds Bitoreum blocks from a getblocktemplate answer: the coinbase transaction (a Dash style special transaction: version 3,
 * type 5, with the extra payload the node computed), the Bitcoin stratum job (coinb1 / coinb2 around the extranonce, the merkle
 * branch), the 80 byte header of a share and the serialized block for submitblock.
 *
 * Header (little endian): version 4 | previous block hash 32 | merkle root 32 | time 4 | bits 4 | nonce 4.
 * Coinbase outputs: the pool's output (whatever is left of coinbasevalue), then the payments the template demands
 * (smartnodes, superblocks, the founder), each with the exact amount and script of the template.
 **/
let crypto = require('crypto');

const HEADER_SIZE = 80;

function sha256d (buf) {
	return crypto.createHash('sha256').update(crypto.createHash('sha256').update(buf).digest()).digest();
}
exports.sha256d = sha256d;

function reverse (buf) {
	return Buffer.from(buf).reverse();
}
exports.reverse = reverse;

function varint (n) {
	if (n < 0xfd) return Buffer.from([n]);
	if (n <= 0xffff) { let b = Buffer.alloc(3); b[0] = 0xfd; b.writeUInt16LE(n, 1); return b; }
	if (n <= 0xffffffff) { let b = Buffer.alloc(5); b[0] = 0xfe; b.writeUInt32LE(n, 1); return b; }
	let b = Buffer.alloc(9); b[0] = 0xff; b.writeBigUInt64LE(BigInt(n), 1); return b;
}
exports.varint = varint;

/** the script push of the BIP34 height (minimal encoding of a script number) */
function heightPush (height) {
	if (height >= 1 && height <= 16) return Buffer.from([0x50 + height]);
	let bytes = [];
	let n = height;
	while (n > 0) { bytes.push(n & 0xff); n = Math.floor(n / 256); }
	if (bytes.length && (bytes[bytes.length - 1] & 0x80)) bytes.push(0);
	return Buffer.concat([Buffer.from([bytes.length]), Buffer.from(bytes)]);
}
exports.heightPush = heightPush;

function outputBuf (value, script) {
	let v = Buffer.alloc(8);
	v.writeBigUInt64LE(BigInt(value));
	return Buffer.concat([v, varint(script.length), script]);
}

/**
 * The payments the template requires next to the pool's output: [{script: Buffer, value: number}].
 * Smartnodes and superblocks come as arrays of {payee, script, amount}, the founder as one such object (or an empty object).
 **/
function requiredPayments (template) {
	let list = [];
	let add = function (entry) {
		if (!entry || !entry.script || !(entry.amount > 0)) return;
		list.push({script: Buffer.from(entry.script, 'hex'), value: entry.amount});
	};
	(template.smartnode || []).forEach(add);
	(template.superblock || []).forEach(add);
	add(template.founder);
	return list;
}

/**
 * Coinbase transaction around the extranonce. Returns {coinb1, coinb2 (Buffers), payments, poolValue}: the transaction is
 * coinb1 + extranonce1 + extranonce2 + coinb2 (the script of the input carries height, then one push of the extranonces, then the tag).
 **/
exports.buildCoinbase = function (template, poolScriptHex, extraNonceSize, tag) {
	let payments = requiredPayments(template);
	let paid = payments.reduce(function (sum, p) { return sum + p.value; }, 0);
	let poolValue = template.coinbasevalue - paid;
	if (!(poolValue > 0)) throw new Error('coinbasevalue ' + template.coinbasevalue + ' does not cover the required payments ' + paid);

	let height = heightPush(template.height);
	let tagPush = tag ? Buffer.concat([Buffer.from([tag.length]), Buffer.from(tag)]) : Buffer.alloc(0);
	let scriptLength = height.length + 1 + extraNonceSize + tagPush.length;
	if (scriptLength < 2 || scriptLength > 100) throw new Error('coinbase script of ' + scriptLength + ' bytes');

	let payload = template.coinbase_payload ? Buffer.from(template.coinbase_payload, 'hex') : Buffer.alloc(0);
	// version 3 with type 5 (TRANSACTION_COINBASE) when the node gives a payload, the plain version 1 otherwise
	let version = Buffer.alloc(4);
	if (payload.length) { version.writeUInt16LE(3, 0); version.writeUInt16LE(5, 2); } else { version.writeInt32LE(1, 0); }

	let outputs = [outputBuf(poolValue, Buffer.from(poolScriptHex, 'hex'))].concat(payments.map(function (p) { return outputBuf(p.value, p.script); }));

	let coinb1 = Buffer.concat([
		version, varint(1), Buffer.alloc(32), Buffer.from('ffffffff', 'hex'),
		varint(scriptLength), height, Buffer.from([extraNonceSize])
	]);
	let coinb2 = Buffer.concat([
		tagPush, Buffer.from('ffffffff', 'hex'),
		varint(outputs.length)].concat(outputs).concat([
		Buffer.alloc(4),                                     // lock time
	]).concat(payload.length ? [varint(payload.length), payload] : []));
	return {coinb1: coinb1, coinb2: coinb2, payments: payments, poolValue: poolValue};
};

/** the sibling hashes of the coinbase (index 0) up the merkle tree of the block, given the ids of the other transactions (internal byte order) */
exports.merkleBranches = function (txids) {
	let level = [null].concat(txids);
	let steps = [];
	while (level.length > 1) {
		steps.push(level[1]);
		if (level.length % 2) level.push(level[level.length - 1]);
		let next = [null];
		for (let i = 2; i < level.length; i += 2) next.push(sha256d(Buffer.concat([level[i], level[i + 1]])));
		level = next;
	}
	return steps;
};

/** merkle root (internal byte order) from the coinbase id and the branch */
exports.merkleRootFromBranches = function (coinbaseTxid, branches) {
	let root = coinbaseTxid;
	for (let b of branches) root = sha256d(Buffer.concat([root, b]));
	return root;
};

/** compact bits to the 256 bit target */
exports.compactToTarget = function (bits) {
	let exponent = bits >>> 24;
	let mantissa = BigInt(bits & 0x007fffff);
	if (bits & 0x00800000) return 0n;
	return exponent <= 3 ? mantissa >> BigInt(8 * (3 - exponent)) : mantissa << BigInt(8 * (exponent - 3));
};

/** every 4 byte word reversed: the way Bitcoin stratum sends the previous block hash (the miner reverses the words back) */
function swapWords (buf) {
	let out = Buffer.from(buf);
	for (let i = 0; i < out.length; i += 4) out.slice(i, i + 4).reverse();
	return out;
}
exports.swapWords = swapWords;

/**
 * The job for miners out of a template.
 *   {height, version, bits, time, target (BigInt), prevHash (display hex), coinb1, coinb2, branches (Buffers), stratum: {...notify fields},
 *    transactions (hex list for submitblock), coinbaseInfo}
 **/
exports.buildJob = function (template, poolScriptHex, extraNonceSize, tag) {
	let coinbase = exports.buildCoinbase(template, poolScriptHex, extraNonceSize, tag);
	let txs = template.transactions || [];
	let txids = txs.map(function (t) { return reverse(Buffer.from(t.txid || t.hash, 'hex')); });
	let branches = exports.merkleBranches(txids);
	let bits = parseInt(template.bits, 16);
	let versionHex = (template.version >>> 0).toString(16).padStart(8, '0');
	return {
		height: template.height,
		version: template.version,
		versionHex: versionHex,
		bits: bits,
		bitsHex: template.bits,
		time: template.curtime,
		mintime: template.mintime,
		target: BigInt('0x' + template.target),
		prevHash: template.previousblockhash,
		prevInternal: reverse(Buffer.from(template.previousblockhash, 'hex')),
		coinb1: coinbase.coinb1,
		coinb2: coinbase.coinb2,
		branches: branches,
		transactions: txs.map(function (t) { return t.data; }),
		poolValue: coinbase.poolValue,
		payments: coinbase.payments.length
	};
};

/** what the stratum notify carries (everything hex, in the byte order Bitcoin stratum uses) */
exports.notifyParams = function (job, jobId, clean) {
	return [
		jobId,
		swapWords(job.prevInternal).toString('hex'),
		job.coinb1.toString('hex'),
		job.coinb2.toString('hex'),
		job.branches.map(function (b) { return b.toString('hex'); }),
		job.versionHex,
		job.bitsHex,
		job.time.toString(16).padStart(8, '0'),
		!!clean
	];
};

/** the coinbase transaction of one miner: {legacy: Buffer (the whole transaction), txid} for its extranonce1 + extranonce2 */
exports.coinbaseFor = function (job, extraNonce) {
	let tx = Buffer.concat([job.coinb1, extraNonce, job.coinb2]);
	return {tx: tx, txid: sha256d(tx)};
};

/** the 80 byte header of a share */
exports.buildHeader = function (job, merkleRoot, ntime, nonce) {
	let header = Buffer.alloc(HEADER_SIZE);
	header.writeInt32LE(job.version, 0);
	job.prevInternal.copy(header, 4);
	merkleRoot.copy(header, 36);
	header.writeUInt32LE(ntime >>> 0, 68);
	header.writeUInt32LE(job.bits >>> 0, 72);
	header.writeUInt32LE(nonce >>> 0, 76);
	return header;
};

/** the serialized block for submitblock: header, the number of transactions, the coinbase, the template's transactions */
exports.serializeBlock = function (job, header, coinbaseTx) {
	let count = 1 + job.transactions.length;
	return header.toString('hex') + varint(count).toString('hex') + coinbaseTx.toString('hex') + job.transactions.join('');
};

exports.HEADER_SIZE = HEADER_SIZE;
