import { Keypair } from "@solana/web3.js";
import { getKeypair } from "../utils";

export const APY_DECIMALS = 2;

export const DECIMALS = 9;
export const NFT_APY = { 30: 2950, 60: 5950, 90: 10450 };
export const ONE_DAY_SECONDS = 24 * 60 * 60;
export const ONE_YEAR_SECONDS = ONE_DAY_SECONDS * 365;

export const payer = getKeypair(".private/id.json");
export const mintKeypair = Keypair.fromSecretKey(
  new Uint8Array([
    104, 111, 227, 68, 80, 198, 10, 155, 242, 12, 3, 96, 88, 98, 2, 227, 159, 8,
    187, 108, 44, 203, 127, 216, 107, 30, 74, 88, 213, 67, 221, 141, 148, 233,
    238, 76, 204, 72, 175, 20, 55, 185, 155, 29, 149, 76, 138, 216, 229, 16,
    200, 139, 34, 82, 69, 61, 141, 173, 111, 153, 170, 159, 45, 230,
  ])
);
export const anotherKeypair = Keypair.fromSecretKey(
  new Uint8Array([
    181, 103, 170, 39, 106, 226, 238, 110, 158, 223, 26, 56, 169, 110, 196, 158,
    141, 149, 246, 209, 169, 135, 233, 80, 79, 254, 23, 174, 42, 202, 144, 12,
    20, 178, 0, 82, 247, 243, 184, 40, 119, 155, 24, 7, 236, 247, 247, 32, 74,
    227, 136, 16, 110, 61, 45, 68, 115, 1, 146, 159, 180, 219, 55, 139,
  ])
);
