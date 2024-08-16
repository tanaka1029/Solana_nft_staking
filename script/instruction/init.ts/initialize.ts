import { PublicKey } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import { ViridisStaking } from "../../../target/types/viridis_staking";

type InitializeProgramConfigAgrs = {
  accounts: {
    signer: PublicKey;
    mint: PublicKey;
    nftCollection: PublicKey;
  };
  program: Program<ViridisStaking>;
};

export function initializeInstruction({
  accounts,
  program,
}: InitializeProgramConfigAgrs) {
  return program.methods.initialize().accounts(accounts).instruction();
}
