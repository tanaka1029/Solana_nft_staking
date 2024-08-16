import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  TransactionConfirmationStrategy,
  TransactionMessage,
  VersionedTransaction,
  SendOptions,
} from "@solana/web3.js";
import { BN, Program, workspace } from "@coral-xyz/anchor";
import {
  createMint,
  mintTo,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { ViridisStaking } from "../target/types/viridis_staking";
import { d, getAddresses } from "./utils";
import { getCollectionAddress, getNftMetadataAddress } from "./metaplex";
import { DECIMALS, mintKeypair, userA } from "./const";
import { Metaplex, keypairIdentity } from "@metaplex-foundation/js";

async function createCollection(metaplex: Metaplex) {
  return metaplex.nfts().create({
    name: "My Amazing Collection",
    uri: "https://example.com/my-collection-metadata.json",
    sellerFeeBasisPoints: 0,
    isCollection: true,
  });
}
async function createNft(metaplex: Metaplex, collectionAddress: PublicKey) {
  return metaplex.nfts().create({
    name: `NFT`,
    uri: `https://example.com/nft-metadata.json`,
    sellerFeeBasisPoints: 0,
    collection: collectionAddress,
    collectionAuthority: userA,
    tokenOwner: userA.publicKey,
  });
}

async function createCollectionAndNFTs(metaplex: Metaplex) {
  const collectionOutput = await createCollection(metaplex);
  const nftOutput = await createNft(metaplex, collectionOutput.nft.address);

  return {
    collection: collectionOutput.nft.address,
    nft: nftOutput.nft.address,
  };
}

async function airdrop(
  pubkey: PublicKey,
  amount: number,
  connection: Connection
) {
  const airdropSignature = await connection.requestAirdrop(
    pubkey,
    amount * LAMPORTS_PER_SOL
  );

  await connection.confirmTransaction(
    { signature: airdropSignature } as TransactionConfirmationStrategy,
    "confirmed"
  );
}

async function sendAndConfirmVersionedTransaction(
  connection: Connection,
  transaction: VersionedTransaction,
  signers: Keypair[]
) {
  transaction.sign(signers);

  const sendOptions: SendOptions = {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  };

  const signature = await connection.sendTransaction(transaction, sendOptions);
  console.log("Transaction sent. Signature:", signature);

  const latestBlockhash = await connection.getLatestBlockhash();
  const confirmation = await connection.confirmTransaction({
    signature,
    ...latestBlockhash,
  });

  if (confirmation.value.err) {
    throw new Error(`Transaction failed: ${confirmation.value.err.toString()}`);
  }

  console.log("Transaction confirmed");
  return signature;
}

async function createAndSendVersionedTransaction(
  connection: Connection,
  payer: Keypair,
  instructions: any[],
  signers: Keypair[]
) {
  const latestBlockhash = await connection.getLatestBlockhash();
  const messageV0 = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: latestBlockhash.blockhash,
    instructions,
  }).compileToV0Message();

  const transaction = new VersionedTransaction(messageV0);
  return sendAndConfirmVersionedTransaction(connection, transaction, signers);
}

describe("staking program in the local node", () => {
  let connection: Connection;
  let program: Program<ViridisStaking>;
  let metaplex: Metaplex;
  let addresses: Awaited<ReturnType<typeof getAddresses>>;
  let payerTokenAccount: PublicKey;

  return;

  before(async () => {
    connection = new Connection("http://localhost:8899", "confirmed");
    program = workspace.ViridisStaking as Program<ViridisStaking>;
    metaplex = Metaplex.make(connection).use(keypairIdentity(userA));
  });

  beforeEach(async () => {
    await airdrop(userA.publicKey, 5, connection);

    await createMint(
      connection,
      userA,
      userA.publicKey,
      userA.publicKey,
      DECIMALS,
      mintKeypair
    );

    const { nft } = await createCollectionAndNFTs(metaplex);

    const metadataAddress = getNftMetadataAddress(nft);
    const metadataInfo = await connection.getAccountInfo(metadataAddress);
    const nftCollectionAddress = getCollectionAddress(
      metadataAddress,
      metadataInfo
    );

    addresses = getAddresses(
      program.programId,
      userA.publicKey,
      mintKeypair.publicKey,
      nft,
      nftCollectionAddress,
      metadataAddress
    );

    const payerTokenAccountInfo = await getOrCreateAssociatedTokenAccount(
      connection,
      userA,
      mintKeypair.publicKey,
      userA.publicKey
    );
    payerTokenAccount = payerTokenAccountInfo.address;
  });

  async function credit(dUserTokens: bigint, dVaultTokens: bigint) {
    await mintTo(
      connection,
      userA,
      mintKeypair.publicKey,
      addresses.tokenVault,
      userA,
      dVaultTokens
    );

    await mintTo(
      connection,
      userA,
      mintKeypair.publicKey,
      payerTokenAccount,
      userA,
      dUserTokens
    );
  }

  it("should run all instructions on a node to make sure there are no memory issues", async () => {
    const userTokens = 1_000_000;
    const vaultTokens = 10_000_000;
    const dUserTokens = d(userTokens);
    const dVaultTokens = d(vaultTokens);

    try {
      const initInstruction = await program.methods
        .initialize()
        .accounts({
          mint: mintKeypair.publicKey,
          nftCollection: addresses.nftCollection,
        })
        .signers([userA])
        .instruction();

      await createAndSendVersionedTransaction(
        connection,
        userA,
        [initInstruction],
        [userA]
      );

      await credit(dUserTokens, dVaultTokens);

      await program.methods
        .updateConfig({
          admin: null,
          baseLockDays: new BN(0),
          baseApy: null,
          maxNftRewardLamports: null,
          maxNftApyDurationDays: null,
        })
        .signers([userA])
        .rpc();

      await program.methods.initializeStakeInfo().signers([userA]).rpc();

      await program.methods
        .stake(new BN(dUserTokens / 4n))
        .accounts({
          mint: mintKeypair.publicKey,
        })
        .signers([userA])
        .rpc();

      await program.methods
        .stake(new BN(dUserTokens / 4n))
        .accounts({
          mint: mintKeypair.publicKey,
        })
        .signers([userA])
        .rpc();

      await program.methods
        .stake(new BN(dUserTokens / 4n))
        .accounts({
          mint: mintKeypair.publicKey,
        })
        .signers([userA])
        .rpc();

      await program.methods
        .stake(new BN(dUserTokens / 4n))
        .accounts({
          mint: mintKeypair.publicKey,
        })
        .signers([userA])
        .rpc();

      await program.methods
        .lockNft(new BN(0), new BN(30))
        .accounts({
          mint: addresses.nft,
        })
        .signers([userA])
        .rpc();

      await program.methods
        .claim(new BN(0))
        .accounts({
          mint: mintKeypair.publicKey,
        })
        .signers([userA])
        .rpc();

      await program.methods
        .restake(new BN(0))
        .accounts({
          mint: mintKeypair.publicKey,
        })
        .signers([userA])
        .rpc();

      // await program.methods
      //   .destake(new BN(0))
      //   .accounts({
      //     mint: mintKeypair.publicKey,
      //   })
      //   .signers([payer])
      //   .rpc();
    } catch (error: any) {
      console.error("Detailed error:", error);
      if (error.logs) {
        console.error("Program logs:", error.logs);
      }
      throw error;
    }
  });
});
