import { startAnchor, ProgramTestContext, Clock } from "solana-bankrun";
import { BankrunProvider } from "anchor-bankrun";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  TransactionConfirmationStrategy,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { Program, IdlAccounts, BN, workspace } from "@coral-xyz/anchor";
import { getKeypair } from "../utils";
import {
  airdropSol,
  createTokenAccountAndCredit,
  createToken,
  getTokenBalance,
  fetchAccounts,
  setSplToAccount,
  getAddresses,
} from "./utils";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { ViridisStaking } from "../target/types/viridis_staking";
import IDL from "../target/idl/viridis_staking.json";
import {
  createMint,
  getAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { TEST_NFT_ADDRESS, TOKEN_METADATA_PROGRAM_ID } from "../const";
import {
  deserializeMetaplexMetadata,
  getCollectionAddress,
  getNftMetadataAddress,
} from "./metaplex";
import Big from "big.js";
import { DECIMALS, mintKeypair, payer } from "./const";

chai.use(chaiAsPromised);
const { expect } = chai;

export async function airdrop(
  pubkey: PublicKey,
  amount: number,
  connection: Connection
) {
  const airdropSignature = await connection.requestAirdrop(
    pubkey,
    amount * LAMPORTS_PER_SOL
  );

  await connection.confirmTransaction(
    {
      signature: airdropSignature,
    } as TransactionConfirmationStrategy,
    "confirmed"
  );
}

export async function createSplToken(
  signer: Keypair,
  mintKeypair: Keypair,
  decimals: number,
  connection: Connection
) {
  return createMint(
    connection,
    signer,
    signer.publicKey,
    signer.publicKey,
    decimals,
    mintKeypair
  );
}

describe("staking program in the local node", () => {
  before(async () => {});
  beforeEach(async () => {});

  it("should run all instructions on a node to make sure there are no memory issues", async () => {
    const program = workspace.ViridisStaking as Program<ViridisStaking>;
    const connection = program.provider.connection;
    await airdrop(payer.publicKey, 5, connection);
    await createSplToken(payer, mintKeypair, DECIMALS, connection);
    const metadataAddress = getNftMetadataAddress(TEST_NFT_ADDRESS);
    const metadataInfo = await program.provider.connection.getAccountInfo(
      metadataAddress
    );

    const nftCollectionAddress = getCollectionAddress(
      metadataAddress,
      metadataInfo
    );

    const addresses: Awaited<ReturnType<typeof getAddresses>> = getAddresses(
      program.programId,
      payer.publicKey,
      mintKeypair.publicKey,
      TEST_NFT_ADDRESS,
      nftCollectionAddress,
      metadataAddress
    );

    await program.methods
      .initialize()
      .accounts({
        signer: payer.publicKey,
        mint: mintKeypair.publicKey,
        nftCollection: addresses.nftCollection,
      })
      .signers([payer])
      .rpc();
  });
});
