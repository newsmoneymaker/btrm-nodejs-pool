// rthash: share validation helper of the Raptoreum pool.
// Reads commands on stdin, writes answers on stdout (one line each):
//   H <id> <160 hex>    the 80 byte block header (version, previous hash, merkle root, time, bits, nonce, as serialized);
//                       answers "H <id> <64 hex>": the GhostRider hash, 32 bytes as computed (a little endian number), or "H <id> err"
//   Q                   quit
// It calls the node's own HashGR (hash.h), the algorithm order comes from the previous block hash inside the header.
// Built against the Raptoreum Core source tree that was compiled (see Makefile).
#include <hash.h>
#include <uint256.h>
#include <cstdio>
#include <cstring>
#include <iostream>
#include <string>

static int hexval(int c)
{
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return -1;
}

static bool fromHex(const std::string& s, unsigned char* out, size_t n)
{
    if (s.size() != n * 2) return false;
    for (size_t i = 0; i < n; i++) {
        int a = hexval(s[2 * i]), b = hexval(s[2 * i + 1]);
        if (a < 0 || b < 0) return false;
        out[i] = (unsigned char)(a * 16 + b);
    }
    return true;
}

static std::string grHex(const unsigned char* header)
{
    uint256 prev;
    memcpy(prev.begin(), header + 4, 32);
    uint256 h = HashGR(header, header + 80, prev);
    static const char d[] = "0123456789abcdef";
    std::string out;
    for (int i = 0; i < 32; i++) {
        out.push_back(d[h.begin()[i] >> 4]);
        out.push_back(d[h.begin()[i] & 15]);
    }
    return out;
}

int main(int argc, char** argv)
{
    unsigned char header[80];
    if (argc == 3 && std::string(argv[1]) == "--hash") {
        if (!fromHex(argv[2], header, 80)) { fprintf(stderr, "need 160 hex chars\n"); return 1; }
        puts(grHex(header).c_str());
        return 0;
    }

    std::string cmd, id, data;
    while (std::cin >> cmd) {
        if (cmd == "Q") break;
        if (cmd != "H") continue;
        std::cin >> id >> data;
        if (!fromHex(data, header, 80)) {
            printf("H %s err\n", id.c_str());
        } else {
            printf("H %s %s\n", id.c_str(), grHex(header).c_str());
        }
        fflush(stdout);
    }
    return 0;
}
