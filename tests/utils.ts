import {
  ACCOUNT_SIZE,
  AccountLayout,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  createInitializeMint2Instruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { BanksClient, ProgramTestContext } from "solana-bankrun";

export async function createSplToken(
  banksClient: BanksClient,
  payer: Keypair,
  decimals: number,
  mintKeypair: Keypair
) {
  const rent = await banksClient.getRent();
  const rentExemptBalance = rent.minimumBalance(BigInt(MINT_SIZE));

  const transaction = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mintKeypair.publicKey,
      space: MINT_SIZE,
      lamports: Number(rentExemptBalance),
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMint2Instruction(
      mintKeypair.publicKey,
      decimals,
      payer.publicKey,
      payer.publicKey,
      TOKEN_PROGRAM_ID
    )
  );

  const blockhash = await banksClient.getLatestBlockhash();
  transaction.recentBlockhash = blockhash[0];
  transaction.feePayer = payer.publicKey;
  transaction.sign(payer, mintKeypair);
  await banksClient.processTransaction(transaction);

  return mintKeypair.publicKey;
}

export async function airdropSol(
  context: ProgramTestContext,
  address: PublicKey,
  amount: number
) {
  const lamports = amount * LAMPORTS_PER_SOL;

  const accountInfo = await context.banksClient.getAccount(address);

  const newBalance =
    BigInt(accountInfo ? accountInfo.lamports : 0) + BigInt(lamports);

  context.setAccount(address, {
    lamports: Number(newBalance),
    data: Buffer.alloc(0),
    owner: PublicKey.default,
    executable: false,
  });

  return newBalance;
}

export async function setTokenAccount(
  context: ProgramTestContext,
  mint: PublicKey,
  owner: PublicKey,
  amount: bigint
) {
  const ata = getAssociatedTokenAddressSync(mint, owner, true);

  const tokenAccData = Buffer.alloc(ACCOUNT_SIZE);
  AccountLayout.encode(
    {
      mint,
      owner,
      amount,
      delegateOption: 0,
      delegate: PublicKey.default,
      delegatedAmount: 0n,
      state: 1,
      isNativeOption: 0,
      isNative: 0n,
      closeAuthorityOption: 0,
      closeAuthority: PublicKey.default,
    },
    tokenAccData
  );

  context.setAccount(ata, {
    lamports: 1_000_000_000,
    data: tokenAccData,
    owner: TOKEN_PROGRAM_ID,
    executable: false,
  });

  return ata;
}

export async function getTokenBalance(
  context: ProgramTestContext,
  tokenAccount: PublicKey
): Promise<bigint> {
  const account = await context.banksClient.getAccount(tokenAccount);

  if (!account) {
    throw new Error("Token account not found");
  }

  const accountInfo = AccountLayout.decode(account.data);
  return accountInfo.amount;
}
