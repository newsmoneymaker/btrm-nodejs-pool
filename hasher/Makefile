# rthash needs the Bitoreum Core source tree that was built (headers plus the static libraries of its build) and its
# depends prefix (for BLS, which Bitoreum links from depends/, not from a project-tree dashbls/ directory):
#   BTRM=/path/to/bitoreum make        (default /root/btrm-src, HOST default x86_64-pc-linux-gnu)
# STATIC=-static makes a binary that runs on any Linux (build it where the node is built).
BTRM ?= /root/btrm-src
HOST ?= x86_64-pc-linux-gnu
DEPS = $(BTRM)/depends/$(HOST)
CXX ?= g++
STATIC ?=
SRC = $(BTRM)/src
LIBS = $(SRC)/libbitoreum_server.a $(SRC)/libbitoreum_wallet.a $(SRC)/libbitoreum_common.a $(SRC)/libbitoreum_util.a $(SRC)/libbitoreum_zmq.a $(SRC)/libbitoreum_consensus.a \
  $(SRC)/crypto/libbitoreum_crypto_base.a $(SRC)/crypto/libbitoreum_crypto_sse41.a $(SRC)/crypto/libbitoreum_crypto_avx2.a $(SRC)/crypto/libbitoreum_crypto_shani.a \
  $(SRC)/leveldb/libleveldb.a $(SRC)/leveldb/libleveldb_sse42.a $(SRC)/leveldb/libmemenv.a $(SRC)/secp256k1/.libs/libsecp256k1.a $(SRC)/univalue/.libs/libunivalue.a \
  $(DEPS)/lib/libbls-dash.a
rthash: rthash.cpp
	$(CXX) -O2 -std=c++17 $(STATIC) -I$(SRC) -I$(SRC)/config -I$(DEPS)/include -o $@ $< -Wl,--start-group $(LIBS) -Wl,--end-group \
	  -L$(DEPS)/lib -lboost_system-mt-x64 -lboost_filesystem-mt-x64 -lboost_thread-mt-x64 -lssl -lcrypto -levent_pthreads -levent -lgmp -ldb_cxx -lzmq -lbacktrace -lpthread -ldl
clean:
	rm -f rthash
