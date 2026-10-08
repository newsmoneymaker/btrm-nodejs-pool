# btrm-nodejs-pool

Mining pool software for **Bitoreum (BTRM)** written in Node.js: a stratum server for Bitoreum's **GhostRider** (the standard Bitcoin Stratum protocol), share checking, block building from the
node's block template (Dash style coinbase with the smartnode and founder payments and the node's payload), block accounting through the pool wallet, and batch payouts. It is a fork of
[cryptonote-nodejs-pool](https://github.com/dvandal/cryptonote-nodejs-pool) by Dvandal (GNU GPL v2) and of its adaptations
[scash-nodejs-pool](https://github.com/newsmoneymaker/scash-nodejs-pool), [veil-nodejs-pool](https://github.com/newsmoneymaker/veil-nodejs-pool),
[qwc-nodejs-pool](https://github.com/newsmoneymaker/qwc-nodejs-pool) and [c64-nodejs-pool](https://github.com/newsmoneymaker/c64-nodejs-pool), written for the Dash/Bitoreum based node and
wallet RPC of Bitoreum. Live example: <https://btrm.pool-pay.com>.

## What it does

* **Stratum server** (plain TCP and TLS ports, Bitcoin Stratum v1 in the form GhostRider miners such as [poolpayminer](https://github.com/newsmoneymaker/poolpayminer), XMRig and cpuminer-gr use):
  the pool asks the node for a block template (`getblocktemplate`), **builds the block itself** (a version 3 / type 5 coinbase with the BIP34 height, the extranonce, the pool's output, the payments
  the template demands for smartnodes, superblocks and the founder, and the node's coinbase payload; the merkle branch; the 80 byte header) and sends every miner `mining.notify` with a share
  difficulty that follows the miner's hashrate (vardiff, remembered across reconnects). It checks every share itself with a small C++ helper (`hasher/rthash`): the GhostRider hash of the header,
  computed by the node's own `HashGR`. A share that meets the network target is submitted to the node as a whole block with `submitblock`.
* **Bitoreum proof of work:** GhostRider (15 hash functions and three CryptoNight variants, order chosen by the previous block hash) over the 80 byte header; the hash as a little endian number
  must not be above the target. Block time 2 minutes; the subsidy steps down in irregular increments every 21262 blocks (`GetBlockSubsidy`, not a simple halving), of which the smartnodes and the
  founder (5% forever) take their share inside the coinbase.
* **Accounts** are Bitoreum addresses (`B...` P2PKH, or `7...` P2SH; base58check verified), optionally `.worker` or `+worker`, with a reward mode prefix `prop:` (shared, default) or `solo:`.
* **Rewards:** PROP with time weighting (slush) or SOLO.
* **Block unlocker:** a block is settled after `depth` blocks (coinbase maturity is 100). The reward is what the pool wallet received in the block's coinbase transaction (`gettransaction`);
  a block that is no longer on the chain is marked orphaned and nothing is credited.
* **Payment processor:** everyone who is due is paid in **one `sendmany` transaction per round**. The balance is debited before sending; a batch whose outcome is unknown (crash, timeout) is found
  again in the wallet by its comment and never sent twice; refused or stuck batches go back to the balances. Dry-run mode, a whitelist for rehearsals and an emergency brake (`deployment/pause-payments.sh`).
* **Website and API:** a ready website (`website_example/`) with the dashboard and its graphs, blocks, payments, top miners, worker statistics, a "Getting started" page with a config generator,
  and the public read-only JSON API.
* **Protection against connection floods:** limits per IP, a login deadline, an optional IP allow list, banning of miners with many invalid shares.
* **Tests** (`test/`): address handling, the GhostRider helper against **real Bitoreum mainnet blocks** (`test-real-blocks.js`), and `test-btrm-proposal.js`, which builds a block from the template of a
  **real, synchronised node** and lets the node validate it as a block proposal (payments, payload, merkle root: the node answers `null`), and refuses a block that pays one atom too much.

## Developer donation

The pool can take a **developer donation** from the reward of every block it finds, before the miners' shares are computed (`blockUnlocker.donations`, a table `Bitoreum address -> percent`, up to 10% per
entry; **empty by default in `config_examples/btrm.json`**). It is your pool and the license is the GPL: set what you want and tell your miners the truth about the fees of your pool. This has nothing to do
with the miner poolpayminer (a separate project with its own fee).

## Installation

See [docs/INSTALL.md](docs/INSTALL.md): the Bitoreum node and wallet (build from source, or the project's release binaries and bootstrap), the GhostRider helper, Redis, the pool services (systemd templates in
`deployment/`), the website and the first payout rehearsal.

Requirements: Linux, Node.js 18 or newer, Redis, a Bitoreum node (`bitoreumd`, v4.1.x) synchronised with the network, a C++ compiler for the helper and the node's build tree, a web server for the website and a
TLS certificate for the TLS stratum ports.

## Miners

[poolpayminer](https://github.com/newsmoneymaker/poolpayminer) (Windows and Linux, free, has its own fee) knows GhostRider as `-a gr`.
Example: `poolpayminer -a gr --tls -o btrm.pool-pay.com:4901 -u BYourAddress+rigname -p x -k`.

## Tests

```
npm install
node test/test-account.js                  # address handling, needs nothing else
make -C hasher BTRM=/path/to/built/bitoreum    # see docs/INSTALL.md
node test/test-real-blocks.js              # the hash of real mainnet blocks, needs only the helper
node test/test-btrm-proposal.js config.json   # needs a running synchronised bitoreumd (config.node) and poolServer.poolAddress from its wallet
```

## Money warning

The payment processor moves real coins. Rehearse first: `"dryRun": true`, then a whitelist (`onlyAccounts`) with a few small payouts of your own, then enable it. A transaction that has been sent to the
network can not be cancelled. Keep the wallet backup (`dumpwallet` / `backupwallet`) and the RPC password private.

## License and credits

GNU GPL v2 (see LICENSE), like the original. Based on cryptonote-nodejs-pool by Dvandal and contributors. The block builder, the Bitcoin Stratum server, the GhostRider helper and the Bitoreum adaptation are
part of this project.
