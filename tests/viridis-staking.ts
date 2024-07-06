import * as anchor from "@coral-xyz/anchor";
import { startAnchor, ProgramTestContext } from "solana-bankrun";
import { BankrunProvider } from "anchor-bankrun";
import { Keypair, PublicKey } from "@solana/web3.js";
import { BN, Idl, Program } from "@coral-xyz/anchor";
import { getKeypair } from "../utils";
import {
  airdropSol,
  setTokenAccount,
  createSplToken,
  getTokenBalance,
} from "./utils";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";

import { ViridisStaking } from "../target/types/viridis_staking";
import IDL from "../target/idl/viridis_staking.json";
import { Account, getAssociatedTokenAddressSync } from "@solana/spl-token";

chai.use(chaiAsPromised);
const expect = chai.expect;

describe("viridis_staking", () => {
  let context: ProgramTestContext;
  let provider: BankrunProvider;
  let program: Program<ViridisStaking>;

  const payer = getKeypair(".private/id.json");
  const mintKeypair = Keypair.fromSecretKey(
    new Uint8Array([
      104, 111, 227, 68, 80, 198, 10, 155, 242, 12, 3, 96, 88, 98, 2, 227, 159,
      8, 187, 108, 44, 203, 127, 216, 107, 30, 74, 88, 213, 67, 221, 141, 148,
      233, 238, 76, 204, 72, 175, 20, 55, 185, 155, 29, 149, 76, 138, 216, 229,
      16, 200, 139, 34, 82, 69, 61, 141, 173, 111, 153, 170, 159, 45, 230,
    ])
  );
  const DECIMALS = 9;

  const userTokenAccount = getAssociatedTokenAddressSync(
    mintKeypair.publicKey,
    payer.publicKey
  );

  let stakeInfoAddress: PublicKey;
  let stakeAccountAddress: PublicKey;

  before(async () => {
    context = await startAnchor("", [], []);
    provider = new BankrunProvider(context);
    program = new Program<ViridisStaking>(IDL as ViridisStaking, provider);
    await airdropSol(context, payer.publicKey, 1);
    await createSplToken(context.banksClient, payer, DECIMALS, mintKeypair);

    stakeInfoAddress = PublicKey.findProgramAddressSync(
      [Buffer.from("stake_info"), payer.publicKey.toBuffer()],
      program.programId
    )[0];

    stakeAccountAddress = PublicKey.findProgramAddressSync(
      [Buffer.from("token"), payer.publicKey.toBuffer()],
      program.programId
    )[0];
  });

  beforeEach(async () => {
    const userTokens = 150_000;
    const userTokenDecimals = BigInt(userTokens * 10 ** DECIMALS);

    await setTokenAccount(
      context,
      mintKeypair.publicKey,
      payer.publicKey,
      userTokenDecimals
    );
  });

  it("should be initialized!", async () => {
    let [tokenVaultAddress] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault")],
      program.programId
    );

    const tx = await program.methods
      .initialize()
      .accounts({
        signer: payer.publicKey,
        mint: mintKeypair.publicKey,
        tokenVaultAccount: tokenVaultAddress,
      })
      .signers([payer])
      .rpc();
    console.log("Your transaction signature", tx);
  });

  it("should stake 1 token!", async () => {
    const periodDays = 30;
    const amount = 150_000;
    const amountDecimals = BigInt(amount * 10 ** DECIMALS);

    const balance = await getTokenBalance(context, userTokenAccount);

    console.log(balance);

    const tx = await program.methods
      .stake(new anchor.BN(amountDecimals.toString()), periodDays)
      .accounts({
        signer: payer.publicKey,
        mint: mintKeypair.publicKey,
        stakeInfoAccount: stakeInfoAddress,
        userTokenAccount: userTokenAccount,
        stakeAccount: stakeAccountAddress,
      })
      .signers([payer])
      .transaction();

    tx.recentBlockhash = context.lastBlockhash;
    tx.feePayer = payer.publicKey;
    tx.sign(payer);

    const signature = await context.banksClient.processTransaction(tx);
    const updatedBalance = await getTokenBalance(context, userTokenAccount);

    expect(
      updatedBalance,
      "Updated user stake account shoudn't be empty"
    ).to.equal(balance - amountDecimals);

    const stakeInfo = await program.account.stakeInfo.fetch(stakeInfoAddress);

    expect(stakeInfo.stakes.length, "User should have a single stake").to.equal(
      1
    );

    console.log("Your transaction signature", signature);
  });
});
