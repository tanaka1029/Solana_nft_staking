import {
  Connection,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { getKeypair } from "../utils";
import { getInitializeIx } from "./instruction/initialize";
import {
  CLUSTER_URL,
  COLLECTION_MINT,
  SIGNER_KEY_PATH,
  SPL_MINT,
} from "../const";
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import { ViridisStaking } from "../target/types/viridis_staking";
import IDL from "../target/idl/viridis_staking.json";
import { getUpdateConfigIx } from "./instruction/update-config";

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

async function updateConfig() {
  const connection = await getConnection();
  const singer = getKeypair(SIGNER_KEY_PATH);
  const wallet = new Wallet(singer);
  const program = getProgram(connection, wallet);

  const ix = await getUpdateConfigIx({
    accounts: {
      admin: singer.publicKey,
    },
    program,
  });
  const tx = new Transaction();

  tx.add(ix);
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  await sendAndConfirmTransaction(connection, tx, [singer]);
}

updateConfig();
