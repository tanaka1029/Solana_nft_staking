import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  getAccount,
  mintTo,
} from "@solana/spl-token";
import { ViridisStaking } from "../target/types/viridis_staking";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { createSplToken } from "./utils";

chai.use(chaiAsPromised);
const expect = chai.expect;

describe("staking-program", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const payer = provider.wallet as anchor.Wallet;
  const connection = new Connection("http://localhost:8899", "confirmed");
  const mintKeypair = Keypair.fromSecretKey(
    new Uint8Array([
      104, 111, 227, 68, 80, 198, 10, 155, 242, 12, 3, 96, 88, 98, 2, 227, 159,
      8, 187, 108, 44, 203, 127, 216, 107, 30, 74, 88, 213, 67, 221, 141, 148,
      233, 238, 76, 204, 72, 175, 20, 55, 185, 155, 29, 149, 76, 138, 216, 229,
      16, 200, 139, 34, 82, 69, 61, 141, 173, 111, 153, 170, 159, 45, 230,
    ])
  );
  const DECIMALS = 9;

  const program = anchor.workspace
    .ViridisStaking as anchor.Program<ViridisStaking>;

  before(async () => {
    await createSplToken(connection, payer, DECIMALS, mintKeypair);
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
      .rpc();
    console.log("Your transaction signature", tx);
  });

  it("should stake 1 token!", async () => {
    // return;
    const userTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      payer.payer,
      mintKeypair.publicKey,
      payer.publicKey
    );

    const amount = 1;
    const amountDecimals = BigInt(amount * Math.pow(10, DECIMALS));
    expect(userTokenAccount.amount, "User mint balance not zero").to.equal(0n);

    await mintTo(
      connection,
      payer.payer,
      mintKeypair.publicKey,
      userTokenAccount.address,
      payer.payer,
      amountDecimals
    );

    const updatedUserTokenAccount = await getAccount(
      connection,
      userTokenAccount.address
    );

    expect(
      updatedUserTokenAccount.amount,
      "Updated user mint balance incorrect"
    ).to.equal(amountDecimals);

    const [stakeInfoAddress] = PublicKey.findProgramAddressSync(
      [Buffer.from("stake_info"), payer.publicKey.toBuffer()],
      program.programId
    );

    const [stakeAccountAddress] = PublicKey.findProgramAddressSync(
      [Buffer.from("token"), payer.publicKey.toBuffer()],
      program.programId
    );

    const tx = await program.methods
      .stake(new anchor.BN(amount))
      .accounts({
        signer: payer.publicKey,
        mint: mintKeypair.publicKey,
        stakeInfoAccount: stakeInfoAddress,
        userTokenAccount: userTokenAccount.address,
        stakeAccount: stakeAccountAddress,
      })
      .transaction();

    const signature = await sendAndConfirmTransaction(connection, tx, [
      payer.payer,
    ]);

    const response = await connection.getTokenAccountBalance(
      stakeAccountAddress
    );

    expect(
      response.value.uiAmount,
      "Updated user stake account shoudn't be empty"
    ).to.equal(amount);

    console.log("Your transaction signature", signature);
  });
});
