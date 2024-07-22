import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

export type StakeEntry = {
  amount: BN;
  startTime: BN;
  stakeLockDays: number;
  baseApy: number;
  nft: PublicKey | null;
  nftLockTime: BN | null;
  nftLockDays: number | null;
  nftApy: number | null;
  nftUnlockTime: BN | null;
  restakeTime: BN | null;
  destakeTime: BN | null;
  paidAmount: BN;
  maxNftRewardLamports: BN;
  maxNftApyDurationDays: BN;
  parentStakeIndex: BN | null;
};
