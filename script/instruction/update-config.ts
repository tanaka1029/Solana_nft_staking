import { PublicKey } from "@solana/web3.js";
import { BN, Program } from "@coral-xyz/anchor";
import { ViridisStaking } from "../../target/types/viridis_staking";

type InitializeProgramConfigAgrs = {
  accounts: {
    admin: PublicKey;
  };
  program: Program<ViridisStaking>;
};

export function getUpdateConfigIx({
  accounts,
  program,
}: InitializeProgramConfigAgrs) {
  const updateArgs = {
    admin: null,
    baseLockDays: 0,
    maxNftApyDurationDays: null,
    baseApy: 350,
    maxNftRewardLamports: null,
    nftDaysApy: [
      { days: 45, apy: 1650 },
      { days: 80, apy: 4650 },
      { days: 90, apy: 10650 },
    ],
  };

  return program.methods
    .updateConfig(updateArgs)
    .accounts(accounts)
    .instruction();
}
