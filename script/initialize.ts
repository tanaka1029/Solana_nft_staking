import {
  Connection,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { getKeypair } from "../utils";
import { initializeInstruction } from "./instruction/init.ts/initialize";
import {
  CLUSTER_URL,
  COLLECTION_MINT,
  SIGNER_KEY_PATH,
  SPL_MINT,
} from "../const";
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import { ViridisStaking } from "../target/types/viridis_staking";
import IDL from "../target/idl/viridis_staking.json";

export const getConnection = () => {
  return new Connection(CLUSTER_URL, "confirmed");
};

export const getProvider = (connection: Connection, wallet: Wallet) => {
  return new AnchorProvider(connection, wallet, {
    preflightCommitment: "confirmed",
  });
};

export const getProgram = (connection: Connection, wallet: Wallet) => {
  return new Program<ViridisStaking>(
    IDL as ViridisStaking,
    getProvider(connection, wallet)
  );
};

async function initialize() {
  const connection = await getConnection();
  const singer = getKeypair(SIGNER_KEY_PATH);
  const wallet = new Wallet(singer);
  const program = getProgram(connection, wallet);

  const ix = await initializeInstruction({
    accounts: {
      signer: singer.publicKey,
      mint: SPL_MINT,
      nftCollection: COLLECTION_MINT,
    },
    program,
  });
  const tx = new Transaction();

  tx.add(ix);
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  await sendAndConfirmTransaction(connection, tx, [singer]);
}

initialize();
