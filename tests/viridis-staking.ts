import { startAnchor, ProgramTestContext } from "solana-bankrun";
import { BankrunProvider } from "anchor-bankrun";
import {
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { BN, Program } from "@coral-xyz/anchor";
import { getKeypair } from "../utils";
import {
  airdropSol,
  createTokenAccountAndCredit,
  createToken,
  getTokenBalance,
  fetchAccounts,
  decodeAccount,
} from "./utils";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { ViridisStaking } from "../target/types/viridis_staking";
import IDL from "../target/idl/viridis_staking.json";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

import { TEST_NFT_ADDRESS, TOKEN_METADATA_PROGRAM_ID } from "../const";
import { deserializeMetaplexMetadata, getNftMetadataAddress } from "./metaplex";
import { Collection } from "@metaplex-foundation/mpl-token-metadata";

chai.use(chaiAsPromised);
const { expect } = chai;

function getNftLockAccount(
  stake_index: number,
  payer: PublicKey,
  programId: PublicKey
) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("nft"),
      payer.toBuffer(),
      Buffer.from(new Uint8Array(new BN(stake_index).toArray("le", 8))),
    ],
    programId
  )[0];
}

describe("viridis_staking", () => {
  const DECIMALS = 9;
  const payer = getKeypair(".private/id.json");
  const mintKeypair = Keypair.fromSecretKey(
    new Uint8Array([
      104, 111, 227, 68, 80, 198, 10, 155, 242, 12, 3, 96, 88, 98, 2, 227, 159,
      8, 187, 108, 44, 203, 127, 216, 107, 30, 74, 88, 213, 67, 221, 141, 148,
      233, 238, 76, 204, 72, 175, 20, 55, 185, 155, 29, 149, 76, 138, 216, 229,
      16, 200, 139, 34, 82, 69, 61, 141, 173, 111, 153, 170, 159, 45, 230,
    ])
  );
  const anotherKeypair = Keypair.fromSecretKey(
    new Uint8Array([
      181, 103, 170, 39, 106, 226, 238, 110, 158, 223, 26, 56, 169, 110, 196,
      158, 141, 149, 246, 209, 169, 135, 233, 80, 79, 254, 23, 174, 42, 202,
      144, 12, 20, 178, 0, 82, 247, 243, 184, 40, 119, 155, 24, 7, 236, 247,
      247, 32, 74, 227, 136, 16, 110, 61, 45, 68, 115, 1, 146, 159, 180, 219,
      55, 139,
    ])
  );

  let context: ProgramTestContext;
  let provider: BankrunProvider;
  let program: Program<ViridisStaking>;
  let addresses: {
    config: PublicKey;
    userStake: PublicKey;
    userToken: PublicKey;
    userNft: PublicKey;
    tokenVault: PublicKey;
    stakeInfo: PublicKey;
    nft: PublicKey;
    metadata: PublicKey;
    nftCollection: PublicKey;
  };

  const setupAddresses = async (programId: PublicKey) => {
    const metadataAddress = getNftMetadataAddress(TEST_NFT_ADDRESS);
    const metadataInfo = await context.banksClient.getAccount(metadataAddress);

    const metadata = deserializeMetaplexMetadata(metadataAddress, metadataInfo);
    let nftCollection: Collection;

    if (metadata.collection.__option === "Some" && metadata.collection.value) {
      nftCollection = metadata.collection.value;
    } else {
      throw new Error("NFT collection is missing or invalid");
    }

    const nftCollectionAddress = new PublicKey(nftCollection.key);

    return {
      config: PublicKey.findProgramAddressSync(
        [Buffer.from("config")],
        programId
      )[0],
      userStake: PublicKey.findProgramAddressSync(
        [Buffer.from("token"), payer.publicKey.toBuffer()],
        programId
      )[0],
      tokenVault: PublicKey.findProgramAddressSync(
        [Buffer.from("vault")],
        programId
      )[0],
      stakeInfo: PublicKey.findProgramAddressSync(
        [Buffer.from("stake_info"), payer.publicKey.toBuffer()],
        programId
      )[0],
      nft: TEST_NFT_ADDRESS,
      metadata: metadataAddress,
      nftCollection: nftCollectionAddress,
      userToken: getAssociatedTokenAddressSync(
        mintKeypair.publicKey,
        payer.publicKey
      ),
      userNft: getAssociatedTokenAddressSync(TEST_NFT_ADDRESS, payer.publicKey),
    };
  };

  const setupEnvironment = async (
    context: ProgramTestContext,
    program: Program<ViridisStaking>
  ) => {
    await airdropSol(context, payer.publicKey, 1);
    await createToken(context.banksClient, payer, DECIMALS, mintKeypair);

    const userTokens = 150_000;
    const userTokenDecimals = BigInt(userTokens * 10 ** DECIMALS);

    // credir 150_000 tokens to user
    await createTokenAccountAndCredit(
      context,
      mintKeypair.publicKey,
      payer.publicKey,
      userTokenDecimals
    );

    // credit 1 NFT to user
    await createTokenAccountAndCredit(
      context,
      addresses.nft,
      payer.publicKey,
      1n
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
  };

  async function getSeedAccounts() {
    const metadataAddress = getNftMetadataAddress(TEST_NFT_ADDRESS);

    return fetchAccounts([
      TOKEN_METADATA_PROGRAM_ID,
      TEST_NFT_ADDRESS,
      metadataAddress,
    ]);
  }

  beforeEach(async () => {
    const seedAccounts = await getSeedAccounts();
    context = await startAnchor("", [], seedAccounts);
    provider = new BankrunProvider(context);
    program = new Program<ViridisStaking>(IDL as ViridisStaking, provider);

    addresses = await setupAddresses(program.programId);
    await setupEnvironment(context, program);
  });

  const getStakeTokenInstruction = (amountDecimals: BN, periodDays: number) => {
    return program.methods
      .stake(amountDecimals)
      .accounts({
        signer: payer.publicKey,
        mint: mintKeypair.publicKey,
      })
      .instruction();
  };

  it("should stake tokens successfully", async () => {
    const stakes = [
      { amount: new BN(1_000 * 10 ** DECIMALS) },
      { amount: new BN(2_000 * 10 ** DECIMALS) },
      { amount: new BN(3_000 * 10 ** DECIMALS) },
      { amount: new BN(4_000 * 10 ** DECIMALS) },
      { amount: new BN(5_000 * 10 ** DECIMALS) },
      { amount: new BN(6_000 * 10 ** DECIMALS) },
      { amount: new BN(7_000 * 10 ** DECIMALS) },
    ];

    const initialBalance = await getTokenBalance(context, addresses.userToken);
    const totalStakedAmount = stakes.reduce(
      (sum, stake) => sum.add(stake.amount),
      new BN(0)
    );

    const instructions = [];

    const initInstruction = await program.methods
      .initializeStakeInfo()
      .accounts({
        signer: payer.publicKey,
        stakeInfo: addresses.stakeInfo,
      })
      .instruction();

    instructions.push(initInstruction);

    for (const stake of stakes) {
      const stakeInstruction = await getStakeTokenInstruction(
        stake.amount,
        stake.period
      );
      instructions.push(stakeInstruction);
    }

    const lockInstruction = await program.methods
      .lockNft(new BN(5), new BN(30))
      .accounts({
        signer: payer.publicKey,
        mint: addresses.nft,
      })
      .instruction();

    instructions.push(lockInstruction);

    const messageV0 = new TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: context.lastBlockhash,
      instructions,
    }).compileToV0Message();

    const tx = new VersionedTransaction(messageV0);
    tx.sign([payer]);

    await context.banksClient.processTransaction(tx);

    const stakeInfo = await program.account.stakeInfo.fetch(
      addresses.stakeInfo
    );
    const updatedBalance = await getTokenBalance(context, addresses.userToken);

    expect(updatedBalance).to.equal(
      initialBalance - BigInt(totalStakedAmount.toString()),
      "Updated user stake account should reflect the total staked amount"
    );

    console.log(stakeInfo);

    stakes.forEach((expectedStake, index) => {
      const actualStake = stakeInfo.stakes[index];

      expect(
        expectedStake.amount.eq(actualStake.amount),
        `Stake ${index} amount mismatch`
      ).to.be.true;
      expect(expectedStake.period).to.equal(
        actualStake.period,
        `Stake ${index} period mismatch`
      );
    });
  });
});
