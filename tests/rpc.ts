import { BN, Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { ViridisStaking } from "../target/types/viridis_staking";
import { getStakeInfo } from "./utils";

export const stakeRpc = async (
  amountDecimals: bigint,
  signer: Keypair,
  mint: PublicKey,
  program: Program<ViridisStaking>
) => {
  return program.methods
    .stake(new BN(amountDecimals))
    .accounts({
      signer: signer.publicKey,
      mint,
    })
    .signers([signer])
    .rpc();
};

export const lockNftRpc = async (
  stakeIndex: number,
  lockPeriod: number,
  signer: Keypair,
  mint: PublicKey,
  program: Program<ViridisStaking>
) => {
  return await program.methods
    .lockNft(new BN(stakeIndex), new BN(lockPeriod))
    .accounts({
      signer: signer.publicKey,
      mint,
    })
    .signers([signer])
    .rpc();
};

export const restakeRpc = async (
  stakeIndex: number,
  signer: Keypair,
  mint: PublicKey,
  program: Program<ViridisStaking>
) => {
  await program.methods
    .restake(new BN(stakeIndex))
    .accounts({
      signer: signer.publicKey,
      mint,
    })
    .signers([signer])
    .rpc();
};

export const initializeStakeInfoRpc = async (
  signer: Keypair,
  program: Program<ViridisStaking>
) => {
  return await program.methods
    .initializeStakeInfo()
    .accounts({
      signer: signer.publicKey,
      stakeInfo: getStakeInfo(signer.publicKey, program.programId),
    })
    .signers([signer])
    .rpc();
};

export const unlockNftRpc = async (
  stakeIndex: number,
  signer: Keypair,
  nft: PublicKey,
  program: Program<ViridisStaking>
) => {
  return await program.methods
    .unlockNft(new BN(stakeIndex))
    .accounts({
      signer: signer.publicKey,
      mint: nft,
    })
    .signers([signer])
    .rpc();
};

export const claimRpc = async (
  stakeIndex: number,
  signer: Keypair,
  mint: PublicKey,
  program: Program<ViridisStaking>
) => {
  await program.methods
    .claim(new BN(stakeIndex))
    .accounts({
      signer: signer.publicKey,
      mint,
    })
    .signers([signer])
    .rpc();
};

export const destakeRpc = async (
  stakeIndex: number,
  signer: Keypair,
  mint: PublicKey,
  program: Program<ViridisStaking>
) => {
  await program.methods
    .destake(new BN(stakeIndex))
    .accounts({
      signer: signer.publicKey,
      mint,
    })
    .signers([signer])
    .rpc();
};
