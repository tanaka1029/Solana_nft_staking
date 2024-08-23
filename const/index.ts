import { PublicKey } from "@solana/web3.js";
import assert from "assert";

import "dotenv/config";

const CLUSTER = process.env.CLUSTER!;
assert(CLUSTER, "no cluster env");

export const SIGNER_KEY_PATH = process.env.SIGNER_KEY_PATH!;
assert(SIGNER_KEY_PATH, "no signer env");

export const DEVNET_RPC = "https://api.devnet.solana.com";
export const MAINNET_RPC =
  "https://solana-mainnet.g.alchemy.com/v2/C96naB2lO7_tKdBmq08Y4k7JGNyaI7Zl";

export const CLUSTER_URL =
  CLUSTER === "mainnet-beta" ? MAINNET_RPC : DEVNET_RPC;

export const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);

export const TEST_NFT_ADDRESS = new PublicKey(
  "7FTdQdMqkk5Xc2oFsYR88BuJt2yyCPReTpqr3viH6b6C"
);

export const TEST_NFT_ADDRESS_WRONG_COLLECTION = new PublicKey(
  "213WoxA2j1vX6SGERSXE1DYFng3wPLWWLJDbCqjUBXCu"
);

export const SPL_MINT = new PublicKey(
  "H2nzjtvs3ZgZfxwYpxiDaTjAHw7eUCH2URsbJP3efw5G"
);
export const COLLECTION_MINT = new PublicKey(
  "BRdbA1LZwnpFkiQgBWSSeGABw2LhpZRZXHy1vjkbgVsw"
);
