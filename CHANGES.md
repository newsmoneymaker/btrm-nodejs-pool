# Changes

## 1.0.0

* First release: Bitoreum (BTRM, a Raptoreum/Dash based node with GhostRider) pool derived from scash-nodejs-pool, veil-nodejs-pool, qwc-nodejs-pool, epic-nodejs-pool and rtm-nodejs-pool.
* The pool builds the blocks itself from `getblocktemplate` (`lib/blockBuilder.js`): a version 3 / type 5 coinbase (BIP34 height, extranonce, the pool's output, the smartnode / superblock / founder payments
  exactly as the template demands, the node's `coinbase_payload`), the merkle branch and the 80 byte header; a solved block is sent with `submitblock`.
* `lib/pool.js` speaks Bitcoin Stratum v1 as GhostRider miners parse it (prevhash with every 4 byte word reversed, version / ntime / nbits big endian, the nonce as the hex of the number, extranonce1 of
  4 bytes and extranonce2 of 4 bytes). Job ids are per miner (`<job>.<n>`) and carry the difficulty of that miner: the miner applies a new difficulty with its next job.
* `hasher/rthash` calls the node's own `HashGR`; it is linked against the built Bitoreum Core tree (`make -C hasher BTRM=...`). The algorithm itself has no coin-specific tweaks (same GhostRider as
  Raptoreum/FewBit), only the static library names/paths in the Makefile differ from rtm-nodejs-pool's (Bitoreum's build splits crypto/wallet/zmq into their own libraries and keeps BLS in `depends/`
  rather than a project-tree `dashbls/` directory) — verified by actually rebuilding `rthash` against a real synced Bitoreum node tree and re-checking real mainnet blocks (`test-real-blocks.js`).
* Payments and unlocker as in Bitcoin based pools (`sendmany`, `gettransaction`, coinbase maturity 100), base58 addresses (`B...`, `7...`). The smartnode/founder split (currently 20% smartnode, 5% founder,
  both height-tiered in the node's own consensus params) is read straight from the template/coinbase, never assumed.
* The variable difficulty of a worker is remembered across reconnects (`poolServer.diffMemoryMinutes`, default 15).
* Tests: address handling (against a real network address from a real block's coinbase), the GhostRider hash of real mainnet blocks, and a block built by the pool from a real, synchronised node's
  template validated by that node as a proposal (all three pass against the live network, see test/).
* Not yet checked on a block found on mainnet: the payout with the real wallet (`sendmany` with `subtractfeefrom`). Real shares are already accepted end to end by the live pool.
