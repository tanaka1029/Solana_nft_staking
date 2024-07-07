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
  setTokenAccount,
  createToken,
  getTokenBalance,
  fetchAccounts,
} from "./utils";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { ViridisStaking } from "../target/types/viridis_staking";
import IDL from "../target/idl/viridis_staking.json";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

import { TOKEN_METADATA_PROGRAM_ID } from "../const";
import { deserializeMetaplexMetadata, getNftMetadataAddress } from "./metaplex";

chai.use(chaiAsPromised);
const { expect } = chai;

const nftAddress = new PublicKey(
  "7FTdQdMqkk5Xc2oFsYR88BuJt2yyCPReTpqr3viH6b6C"
);

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
  const nftKeypair = Keypair.fromSecretKey(
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
  let accounts: {
    userTokenAccount: PublicKey;
    tokenVaultAddress: PublicKey;
    stakeInfoAddress: PublicKey;
    stakeAccountAddress: PublicKey;
  };

  const setupAccounts = (programId: PublicKey) => ({
    userTokenAccount: getAssociatedTokenAddressSync(
      mintKeypair.publicKey,
      payer.publicKey
    ),
    tokenVaultAddress: PublicKey.findProgramAddressSync(
      [Buffer.from("vault")],
      programId
    )[0],
    stakeInfoAddress: PublicKey.findProgramAddressSync(
      [Buffer.from("stake_info"), payer.publicKey.toBuffer()],
      programId
    )[0],
    stakeAccountAddress: PublicKey.findProgramAddressSync(
      [Buffer.from("token"), payer.publicKey.toBuffer()],
      programId
    )[0],
  });

  const setupEnvironment = async (
    context: ProgramTestContext,
    program: Program<ViridisStaking>
  ) => {
    await airdropSol(context, payer.publicKey, 1);
    await createToken(context.banksClient, payer, DECIMALS, mintKeypair);

    const userTokens = 150_000;
    const userTokenDecimals = BigInt(userTokens * 10 ** DECIMALS);

    await setTokenAccount(
      context,
      mintKeypair.publicKey,
      payer.publicKey,
      userTokenDecimals
    );

    await program.methods
      .initialize()
      .accounts({
        signer: payer.publicKey,
        mint: mintKeypair.publicKey,
      })
      .signers([payer])
      .rpc();
  };

  async function getSeedAccounts() {
    const metadataAddress = getNftMetadataAddress(nftAddress);

    return fetchAccounts([
      TOKEN_METADATA_PROGRAM_ID,
      nftAddress,
      metadataAddress,
    ]);
  }

  beforeEach(async () => {
    const seedAccounts = await getSeedAccounts();
    context = await startAnchor("", [], seedAccounts);
    provider = new BankrunProvider(context);
    program = new Program<ViridisStaking>(IDL as ViridisStaking, provider);

    accounts = setupAccounts(program.programId);
    await setupEnvironment(context, program);

    const metadataAddress = getNftMetadataAddress(nftAddress);
    const metadataAccount = await context.banksClient.getAccount(
      metadataAddress
    );

    console.log(deserializeMetaplexMetadata(metadataAddress, metadataAccount));
  });

  const getStakeTokenInstruction = (amountDecimals: BN, periodDays: number) => {
    return program.methods
      .stake(amountDecimals, periodDays)
      .accounts({
        signer: payer.publicKey,
        mint: mintKeypair.publicKey,
        stakeInfoAccount: accounts.stakeInfoAddress,
        userTokenAccount: accounts.userTokenAccount,
        stakeAccount: accounts.stakeAccountAddress,
      })
      .instruction();
  };

  it("should stake tokens successfully", async () => {
    const stakes = [
      { period: 30, amount: new BN(1_000 * 10 ** DECIMALS) },
      // { period: 60, amount: new BN(2_000 * 10 ** DECIMALS) },
      // { period: 60, amount: new BN(3_000 * 10 ** DECIMALS) },
      // { period: 60, amount: new BN(4_000 * 10 ** DECIMALS) },
      // { period: 60, amount: new BN(5_000 * 10 ** DECIMALS) },
      // { period: 30, amount: new BN(6_000 * 10 ** DECIMALS) },
      // { period: 90, amount: new BN(7_000 * 10 ** DECIMALS) },
    ];

    const initialBalance = await getTokenBalance(
      context,
      accounts.userTokenAccount
    );
    const totalStakedAmount = stakes.reduce(
      (sum, stake) => sum.add(stake.amount),
      new BN(0)
    );

    const instructions = [];

    const initInstruction = await program.methods
      .initializeStakeInfo()
      .accounts({
        signer: payer.publicKey,
        stakeInfo: accounts.stakeInfoAddress,
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

    const messageV0 = new TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: context.lastBlockhash,
      instructions,
    }).compileToV0Message();

    const tx = new VersionedTransaction(messageV0);
    tx.sign([payer]);

    await context.banksClient.processTransaction(tx);

    const stakeInfo = await program.account.stakeInfo.fetch(
      accounts.stakeInfoAddress
    );
    const updatedBalance = await getTokenBalance(
      context,
      accounts.userTokenAccount
    );

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
