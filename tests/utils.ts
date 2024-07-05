import { Wallet } from "@coral-xyz/anchor";
import { createMint } from "@solana/spl-token";
import { Connection, Keypair } from "@solana/web3.js";

export async function createSplToken(
  connection: Connection,
  payer: Wallet,
  decimals: number,
  mintKeypair: Keypair
) {
  return createMint(
    connection,
    payer.payer,
    payer.publicKey,
    payer.publicKey,
    decimals,
    mintKeypair
  );
}
