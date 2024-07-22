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
import { BanksClient, ProgramTestContext, Clock } from "solana-bankrun";
import {
  MAINNET_RPC,
  TEST_NFT_ADDRESS,
  TEST_NFT_ADDRESS_WRONG_COLLECTION,
  TOKEN_METADATA_PROGRAM_ID,
} from "../const";
import { getCollectionAddress, getNftMetadataAddress } from "./metaplex";
import { APY_DECIMALS, DECIMALS } from "./const";
import { BN } from "@coral-xyz/anchor";

import chai from "chai";
import Big from "big.js";
import { StakeEntry } from "./types";

const { expect } = chai;

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

export async function setSplToAccount(
  context: ProgramTestContext,
  mint: PublicKey,
  owner: PublicKey,
  ata: PublicKey,
  amount: bigint
) {
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
}

export async function createTokenAccountAndCredit(
  context: ProgramTestContext,
  mint: PublicKey,
  owner: PublicKey,
  amount: bigint
): Promise<PublicKey> {
  const ata = getAssociatedTokenAddressSync(mint, owner, true);

  setSplToAccount(context, mint, owner, ata, amount);

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

export const getAddresses = (
  programId: PublicKey,
  payer: PublicKey,
  mint: PublicKey,
  nft: PublicKey,
  nftCollection: PublicKey,
  metadata: PublicKey
) => {
  return {
    config: PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      programId
    )[0],
    userStake: PublicKey.findProgramAddressSync(
      [Buffer.from("token"), payer.toBuffer()],
      programId
    )[0],
    tokenVault: PublicKey.findProgramAddressSync(
      [Buffer.from("vault")],
      programId
    )[0],
    stakeInfo: PublicKey.findProgramAddressSync(
      [Buffer.from("stake_info"), payer.toBuffer()],
      programId
    )[0],
    nftInfo: PublicKey.findProgramAddressSync(
      [Buffer.from("nft_info"), nft.toBuffer()],
      programId
    )[0],
    nft,
    metadata,
    nftCollection,
    getStakeInfo: (address: PublicKey) => getStakeInfo(address, programId),
    userToken: getAssociatedTokenAddressSync(mint, payer),
    userNft: getAssociatedTokenAddressSync(nft, payer),
  };
};

export const getStakeInfo = (address: PublicKey, programId: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("stake_info"), address.toBuffer()],
    programId
  )[0];

export const d = (amount: number): bigint => BigInt(amount * 10 ** DECIMALS);

export function assertDeepEqual<T extends Record<string, any>>(
  actual: T,
  expected: T,
  path: string = "",
  tolerance: BN = new BN(1)
) {
  Object.entries(expected).forEach(([key, expectedValue]) => {
    const actualValue = actual[key];
    const currentPath = path ? `${path}.${key}` : key;

    if (BN.isBN(expectedValue)) {
      const difference = expectedValue.sub(actualValue).abs();
      expect(
        closeTo(actualValue, expectedValue),
        `${currentPath} mismatch. Expected: ${expectedValue}, Actual: ${actualValue}, Difference: ${difference}, Tolerance: ${tolerance}`
      ).to.be.true;
    } else if (typeof expectedValue === "object" && expectedValue !== null) {
      assertDeepEqual(actualValue, expectedValue, currentPath, tolerance);
    } else {
      expect(
        actualValue,
        `${currentPath} mismatch. Expected: ${expectedValue}, Actual: ${actualValue}`
      ).to.equal(expectedValue);
    }
  });
}

type Number = bigint | number | BN;

export function eq(n1: Number, n2: Number): boolean {
  return closeTo(n1, n2, 0);
}

export function closeTo(
  actual: Number,
  expected: Number,
  tolerance: Number = new BN(1)
) {
  const difference = new BN(`${expected}`).sub(new BN(`${actual}`)).abs();

  return difference.lte(new BN(`${tolerance}`));
}

export async function simulateTimePassage(
  secondsToAdd: number,
  context: ProgramTestContext
): Promise<[currentClock: Clock, futureTimestamp: bigint]> {
  const currentClock = await context.banksClient.getClock();
  const newTimestamp = currentClock.unixTimestamp + BigInt(secondsToAdd);

  const newClock = new Clock(
    currentClock.slot,
    currentClock.epochStartTimestamp,
    currentClock.epoch,
    currentClock.leaderScheduleEpoch,
    newTimestamp
  );

  context.setClock(newClock);

  return [currentClock, newTimestamp];
}

export function calculateClaimableReward(
  stake: StakeEntry,
  daysPassed: number,
  nftAPY: number,
  maxNftRewardLamports: number,
  maxNftApyDays: number
) {
  const annualBaseReward = calculateReward(
    stake.amount,
    stake.baseApy,
    daysPassed
  );

  const nftEffectiveDays = Math.min(daysPassed, maxNftApyDays);
  const annualNftReward = calculateReward(
    stake.amount,
    nftAPY,
    nftEffectiveDays
  );

  const limitedAnnualNftReward = Math.min(
    annualNftReward,
    maxNftRewardLamports
  );

  return annualBaseReward + limitedAnnualNftReward;
}

const calculateReward = (
  amount: number,
  apy: number,
  daysPassed: number
): number => {
  try {
    const bAmount = new Big(amount);
    const bApy = new Big(apy).div(Big(10).pow(APY_DECIMALS));
    const bDaysPassed = new Big(daysPassed);
    const dailyRate = bApy.div(new Big(365));
    const dailyMultiplier = dailyRate.div(new Big(100));
    const reward = bAmount.mul(dailyMultiplier).mul(bDaysPassed);
    return reward.round().toNumber();
  } catch (error) {
    console.error("Error in calculateReward:", error);
    throw error;
  }
};

export const getSeedAccounts = async () => {
  return fetchAccounts([
    TOKEN_METADATA_PROGRAM_ID,
    TEST_NFT_ADDRESS_WRONG_COLLECTION,
    TEST_NFT_ADDRESS,
    getNftMetadataAddress(TEST_NFT_ADDRESS),
    getNftMetadataAddress(TEST_NFT_ADDRESS_WRONG_COLLECTION),
  ]);
};

export const setupAddresses = async (
  programId: PublicKey,
  context: ProgramTestContext,
  payer: PublicKey,
  mint: PublicKey
) => {
  const metadataAddress = getNftMetadataAddress(TEST_NFT_ADDRESS);
  const metadataInfo = await context.banksClient.getAccount(metadataAddress);
  const nftCollectionAddress = getCollectionAddress(
    metadataAddress,
    metadataInfo
  );

  return getAddresses(
    programId,
    payer,
    mint,
    TEST_NFT_ADDRESS,
    nftCollectionAddress,
    metadataAddress
  );
};

export async function expectErrorWitLog(
  promise: Promise<any>,
  errorMessage: string
) {
  await expect(promise)
    .to.be.rejectedWith()
    .then((e) => {
      expect(
        e.logs.some((log: string) => log.includes(errorMessage)),
        errorMessage
      ).to.be.true;
    });
}
