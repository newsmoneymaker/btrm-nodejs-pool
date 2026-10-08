# Installing a Bitoreum pool

Paths below are examples: the pool in `/opt/btrm-nodejs-pool`, the node and its data in `/opt/btrm`, all run by the user `btrmpool`
(the systemd templates in `deployment/systemd/` use these paths).

## 1. Bitoreum node and wallet

The original `bitoreum/btm` repository (tag `v2.5.1`) is abandoned: its DNS seeds (`bitoreum.org`) are dead and the chain has moved on several
years of consensus changes since. The real, actively maintained client is `https://github.com/Nikovash/bitoreum` (MIT, "Crystal Bitoreum"), a
Dash based node, tag `v4.1.0.1`. The releases page ships Linux binaries, but they are built against a newer glibc than Debian 10's (`GLIBC_2.33+`
not found) — build from source, same as the pool's own GhostRider helper needs the static libraries of a from-source build anyway.
The source uses its own `depends` system (boost 1.70, OpenSSL, libevent, GMP for the BLS/relic library...) and builds fine with GCC 12 on an
otherwise-GCC-8 host (an isolated GCC 12 + CMake 4 toolchain, e.g. via micromamba, matched to the host's own glibc so the resulting binary still
runs natively — no chroot needed). One real source patch was required: `src/undo.h`'s `TxInUndoSerializer::Serialize` passes an `unsigned int`
expression to a `VARINT(..., VarIntMode::NONNEGATIVE_SIGNED)`, which fails a `static_assert` under GCC 12 (GCC 8 let it through); casting the
expression to `(int64_t)` fixes it with no behaviour change (this undo-file format is local-only, never sent over the network).

```
git clone --branch v4.1.0.1 https://github.com/Nikovash/bitoreum.git && cd bitoreum
# build dependencies: curl build-essential libtool autotools-dev automake pkg-config python3 bsdmainutils patch bison cmake xz-utils unzip
make -C depends NO_QT=1 -j2
./autogen.sh
CONFIG_SITE=$PWD/depends/x86_64-pc-linux-gnu/share/config.site ./configure --disable-tests --disable-bench --without-gui --disable-man
make -j2                                                    # src/bitoreumd, src/bitoreum-cli
```

`/opt/btrm/data/bitoreum.conf` (mainnet default ports from `src/chainparamsbase.cpp`/`chainparams.cpp`: RPC 10225, P2P 15168 — **the RPC port
collides with Raptoreum's own default 10225 if you run both on the same host; pick a different `rpcport`**, e.g. 15167, used below):

```
server=1
listen=1
rpcuser=btrmpool
rpcpassword=<a long random password>
rpcbind=127.0.0.1
rpcallowip=127.0.0.1
rpcport=15167
```

**DNS seeds are dead, use `addnode`.** Neither the old domain's seeds (`bitoreum.org`) nor the current one's (`seed01.bitoreum.cc`) resolve.
The binary does carry a handful of real hardcoded fixed-seed IPs (`src/chainparamsseeds.h`, `pnSeed6_main`) that the node tries on its own after
a while, but getting a peer immediately is faster with an explicit `addnode` (decode the IPv4-mapped IPv6 bytes, or just connect once and let the
node remember them in `peers.dat`):

```
addnode=170.9.9.199:15168
addnode=146.235.232.125:15168
addnode=158.101.9.160:16168
addnode=129.146.193.93:15168
```

**Use the project's `powcache.dat` for a usable sync time.** Validating the chain from genesis recomputes the GhostRider hash of every historical
header; without help this ran at ~15 blocks/min (~50 days for the full chain on this hardware). The `v4.1.0.1` GitHub release carries a
`powcache.dat` (a cache of already-computed PoW hashes) — stop the node, drop it into the data directory (overwriting the one the node builds
itself), start again: the rate jumped to ~430 blocks/min (about 2 days for ~1.15M blocks at the time of writing), because most of the chain no
longer needs the hash recomputed, only looked up.

The default wallet of the node is the pool wallet:

```
bitoreum-cli getnewaddress "pool"          # B... (or 7... for a P2SH address): the pool address (poolServer.poolAddress)
bitoreum-cli backupwallet /safe/place/btrm-wallet-backup.dat   # keep it offline, chmod 600
```

The wallet is a plain (non HD) wallet with a key pool: back it up again after new addresses were handed out.

## 2. GhostRider helper

The helper is a tiny program around the node's own `HashGR`; it is linked against the static libraries of the node build (so the hash is exactly
the node's). The algorithm itself has no coin-specific tweaks, but Bitoreum's build lays out its static libraries differently from
rtm-nodejs-pool's Makefile (separate `libbitoreum_wallet.a`/`libbitoreum_zmq.a`, crypto variants named `_base`/`_sse41`/`_avx2`/`_shani`, BLS
linked from `depends/` rather than a project-tree `dashbls/` directory) — `hasher/Makefile` here already matches Bitoreum's real layout
(verified by actually building it and re-checking real mainnet blocks).

```
cd /opt/btrm-nodejs-pool/hasher && make BTRM=/path/to/bitoreum            # the build tree from step 1
# a static binary that runs on any Linux (build it where the node is built): make BTRM=... STATIC=-static
```

Check it against the chain: `node test/test-real-blocks.js`. A hash takes about 15 ms; `hasher.threads` helper processes work in parallel (each share is one hash).

## 3. Redis

Use a dedicated instance with a password and AOF (`deployment/redis-pool.conf.example`, unit `btrm-pool-redis`, port 6397).

## 4. The pool

```
cd /opt/btrm-nodejs-pool && npm install --production
cp config_examples/btrm.json config.json      # then edit it
```

Edit `config.json`: `poolHost`, `poolServer.poolAddress` (the wallet address of step 1), the ports and the certificate for TLS (`poolServer.sslCert/sslKey`), `redis`, `api.password`,
`node.password` or `node.passwordFile` (and `node.port` — match whatever `rpcport` you picked in step 1), `blockUnlocker.poolFee` and `donations`, `payments`. **Keep `payments.dryRun: true` until the rehearsal below.**

```
cp deployment/systemd/*.service /etc/systemd/system/ && systemctl daemon-reload
systemctl enable --now btrm-pool-redis btrm-node
systemctl enable --now btrm-pool btrm-pool-api btrm-pool-unlocker btrm-pool-payments btrm-pool-charts
node test/test-btrm-proposal.js config.json        # the node itself validates a block built by the pool (needs the synchronised node)
```

The pool runs as separate modules (`init.js -module=pool|api|unlocker|payments|chartsDataCollector`), each in its own unit. Until payouts are proven, restrict the stratum ports with `poolServer.allowIPs`.
Point a miner at it: `poolpayminer -a gr -o your.pool:4900 -u <a B... address> -p x`.

## 5. Website

Copy `website_example/` to the web root, set `poolHost`, the contact and links in `config.js`, and proxy `/api` to the pool API on 127.0.0.1:8140 (`deployment/apache-vhost.conf.example` exposes only the
read-only methods).

## 6. Rehearse the payments

1. `payments.dryRun: true`: the log of `btrm-pool-payments` shows what would be paid.
2. Fund the pool wallet with a few coins (or wait for the first block), credit a small balance in Redis to your own test addresses (`<coin>:workers:<address>`, field `balance`), set `payments.onlyAccounts`
   to them, `dryRun: false`, and watch the payout confirm.
3. Remove the test accounts from Redis and set `onlyAccounts` to `[]`.

Good to know: block rewards can be spent after 100 blocks (COINBASE_MATURITY, about 3.3 hours at the 2 minute block time); `deployment/pause-payments.sh` stops new payouts at once; the wallet must stay
unlocked and online for the payouts (leave the pool wallet unencrypted with only small balances in it). Of a block the pool only gets what is left after the smartnode (20%, once ≥10 smartnodes are
registered; 0% below that) and founder (5% forever) payments the template demands — read live from the real coinbase outputs, never assumed; the subsidy itself steps down in irregular increments every
21262 blocks (see `GetBlockSubsidy` in `src/validation.cpp`), not a simple halving.
