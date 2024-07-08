import {
  ACCOUNT_SIZE,
  AccountLayout,
  MINT_SIZE,
  RawAccount,
  MintLayout,
  TOKEN_PROGRAM_ID,
  createInitializeMint2Instruction,
  getAssociatedTokenAddressSync,
  RawMint,
} from "@solana/spl-token";
import {
  AccountInfo,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { BanksClient, ProgramTestContext } from "solana-bankrun";
import { MAINNET_RPC } from "../const";

export async function createToken(
  banksClient: BanksClient,
  payer: Keypair,
  decimals: number,
  mintKeypair: Keypair
): Promise<PublicKey> {
  const rentExemptBalance = await banksClient
    .getRent()
    .then((rent) => rent.minimumBalance(BigInt(MINT_SIZE)));

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

  const [recentBlockhash] = await banksClient.getLatestBlockhash();
  transaction.recentBlockhash = recentBlockhash;
  transaction.feePayer = payer.publicKey;
  transaction.sign(payer, mintKeypair);
  await banksClient.processTransaction(transaction);

  return mintKeypair.publicKey;
}

export async function airdropSol(
  context: ProgramTestContext,
  address: PublicKey,
  amount: number
): Promise<number> {
  const lamports = amount * LAMPORTS_PER_SOL;
  const accountInfo = await context.banksClient.getAccount(address);
  const currentBalance = accountInfo ? accountInfo.lamports : 0;
  const newBalance = currentBalance + lamports;

  context.setAccount(address, {
    lamports: newBalance,
    data: Buffer.alloc(0),
    owner: PublicKey.default,
    executable: false,
  });

  return newBalance;
}

export async function createTokenAccountAndCredit(
  context: ProgramTestContext,
  mint: PublicKey,
  owner: PublicKey,
  amount: bigint
): Promise<PublicKey> {
  const ata = getAssociatedTokenAddressSync(mint, owner);

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

export const decodeAccount = async <T extends "mint" | "account">(
  context: ProgramTestContext,
  address: PublicKey,
  accountType: T
): Promise<T extends "mint" ? RawMint : RawAccount> =>
  (accountType === "mint" ? MintLayout : AccountLayout).decode(
    (await context.banksClient.getAccount(address))?.data ??
      (() => {
        throw new Error("Account not found");
      })()
  ) as T extends "mint" ? RawMint : RawAccount;

export async function getTokenBalance(
  context: ProgramTestContext,
  tokenAccount: PublicKey
): Promise<bigint> {
  const account = await decodeAccount(context, tokenAccount, "account");
  return account.amount;
}

export function fetchAccounts(addresses: PublicKey[]) {
  const connection = new Connection(MAINNET_RPC);
  return Promise.all(
    addresses.map((address) => fetchAccount(address, connection))
  );
}

async function fetchAccount(
  address: PublicKey,
  connection: Connection
): Promise<{
  address: PublicKey;
  info: AccountInfo<Buffer>;
}> {
  const info = await connection.getAccountInfo(address);

  if (info) {
    return {
      address,
      info,
    };
  } else {
    throw Error(`Cant find an account with address: ${address}`);
  }
}
