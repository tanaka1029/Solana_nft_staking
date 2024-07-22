import { startAnchor, ProgramTestContext, Clock } from "solana-bankrun";
import { BankrunProvider } from "anchor-bankrun";
import {
  AccountInfo,
  Keypair,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { Program, IdlAccounts, BN } from "@coral-xyz/anchor";
import {
  airdropSol,
  createTokenAccountAndCredit,
  createToken,
  getTokenBalance,
  setSplToAccount,
  d,
  assertDeepEqual,
  closeTo,
  simulateTimePassage,
  calculateClaimableReward,
  getSeedAccounts,
  setupAddresses,
  eq,
} from "./utils";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { ViridisStaking } from "../target/types/viridis_staking";
import IDL from "../target/idl/viridis_staking.json";
import {
  DECIMALS,
  mintKeypair,
  NFT_APY,
  ONE_DAY_SECONDS,
  ONE_YEAR_SECONDS,
  payer,
} from "./const";
import { StakeEntry } from "./types";

chai.use(chaiAsPromised);
const { expect } = chai;

describe("staking program in the solana-bankrun simulation", () => {
  type ProgramAccounts = IdlAccounts<ViridisStaking>;

  type Config = ProgramAccounts["config"];
  type StakeInfo = ProgramAccounts["stakeInfo"];

  let context: ProgramTestContext;
  let provider: BankrunProvider;
  let program: Program<ViridisStaking>;
  let addresses: Awaited<ReturnType<typeof setupAddresses>>;
  let seedAccounts: {
    address: PublicKey;
    info: AccountInfo<Buffer>;
  }[];

  const setupEnvironment = async (
    context: ProgramTestContext,
    program: Program<ViridisStaking>
  ) => {
    await airdropSol(context, payer.publicKey, 1);
    await createToken(context.banksClient, payer, DECIMALS, mintKeypair);
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

  async function fetchStakes() {
    const stakeInfo = await program.account.stakeInfo.fetch(
      addresses.stakeInfo
    );
    return stakeInfo.stakes;
  }

  async function fetchNftInfo() {
    return program.account.nftInfo.fetch(addresses.nftInfo);
  }

  async function fetchConfig() {
    return await program.account.config.fetch(addresses.config);
  }

  const getStakeTokenInstruction = async (amountDecimals: bigint) => {
    return program.methods
      .stake(new BN(amountDecimals))
      .accounts({
        signer: payer.publicKey,
        mint: mintKeypair.publicKey,
      })
      .instruction();
  };

  const getInitializeStakeInfoInstruction = async () => {
    return await program.methods
      .initializeStakeInfo()
      .accounts({
        signer: payer.publicKey,
        stakeInfo: addresses.stakeInfo,
      })
      .instruction();
  };

  const getLockNftInstruction = async (
    stakeIndex: number,
    lockPeriod: number
  ) => {
    return await program.methods
      .lockNft(new BN(stakeIndex), new BN(lockPeriod))
      .accounts({
        signer: payer.publicKey,
        mint: addresses.nft,
      })
      .instruction();
  };

  const claimRpc = async (stakeIndex: number) => {
    await program.methods
      .claim(new BN(stakeIndex))
      .accounts({
        signer: payer.publicKey,
        mint: mintKeypair.publicKey,
      })
      .signers([payer])
      .rpc();
  };

  const destakeRpc = async (stakeIndex: number) => {
    await program.methods
      .destake(new BN(stakeIndex))
      .accounts({
        signer: payer.publicKey,
        mint: mintKeypair.publicKey,
      })
      .signers([payer])
      .rpc();
  };

  async function getBalance(address: PublicKey) {
    return getTokenBalance(context, address);
  }

  const credit = async (
    tokenAmount: number | bigint,
    vaultAmount: number | bigint,
    nftAmount: number
  ) => {
    const dUserTokens = d(Number(tokenAmount));
    const dVaultTokens = d(Number(vaultAmount));
    if (tokenAmount) {
      await createTokenAccountAndCredit(
        context,
        mintKeypair.publicKey,
        payer.publicKey,
        dUserTokens
      );
    }
    if (nftAmount) {
      await createTokenAccountAndCredit(
        context,
        addresses.nft,
        payer.publicKey,
        BigInt(nftAmount)
      );
    }

    if (vaultAmount) {
      await setSplToAccount(
        context,
        mintKeypair.publicKey,
        addresses.tokenVault,
        addresses.tokenVault,
        dVaultTokens
      );
    }
  };

  beforeEach(async () => {
    seedAccounts = await getSeedAccounts();
  });

  beforeEach(async () => {
    context = await startAnchor("", [], seedAccounts);
    provider = new BankrunProvider(context);
    program = new Program<ViridisStaking>(IDL as ViridisStaking, provider);
    addresses = await setupAddresses(
      program.programId,
      context,
      payer.publicKey,
      mintKeypair.publicKey
    );
    await setupEnvironment(context, program);
  });

  // Tests
  it("Stake 1bil tokens, lock NFT immediately for 90 days, wait for 1 year, claim, wait for 1 day destake", async () => {
    const {
      baseApy,
      baseLockDays,
      maxNftRewardLamports,
      maxNftApyDurationDays,
    } = await fetchConfig();

    let userTokens = 1_000_000;
    let vaultTokens = 5_000_000_000;
    let userNftCount = 1;

    await credit(userTokens, vaultTokens, userNftCount);

    const nftLockPeriod = 90;
    const nftAPY = NFT_APY[nftLockPeriod];

    const dUserTokens = d(userTokens);
    const dVaultTokens = d(vaultTokens);

    const instructions: TransactionInstruction[] = [
      await getInitializeStakeInfoInstruction(),
      await getStakeTokenInstruction(dUserTokens),
      await getLockNftInstruction(0, nftLockPeriod),
    ];

    const messageV0 = new TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: context.lastBlockhash,
      instructions,
    }).compileToV0Message();

    const tx = new VersionedTransaction(messageV0);
    tx.sign([payer]);

    const clockBeforeStaking = await context.banksClient.getClock();

    await context.banksClient.processTransaction(tx);

    const [stake] = await fetchStakes();

    const userBalanceAfterStaking = await getBalance(addresses.userToken);
    const userStakeBalance = await getBalance(addresses.userStake);

    expect(
      eq(userBalanceAfterStaking, 0),
      "updated user balance after staking should equal 0"
    ).true;

    expect(
      eq(userStakeBalance, dUserTokens),
      "user stake account should equal initial user balance"
    ).true;

    expect(
      eq(stake.amount, dUserTokens),
      "stake account should hold initial user balance"
    ).true;

    const expectedStakeAfterStaking: StakeEntry = {
      amount: new BN(dUserTokens),
      startTime: new BN(clockBeforeStaking.unixTimestamp),
      stakeLockDays: baseLockDays,
      baseApy,
      nft: addresses.nft,
      nftLockTime: stake.startTime,
      nftLockDays: nftLockPeriod,
      nftApy: nftAPY,
      nftUnlockTime: null,
      destakeTime: null,
      restakeTime: null,
      parentStakeIndex: null,
      paidAmount: new BN(0),
      maxNftApyDurationDays: maxNftApyDurationDays,
      maxNftRewardLamports: maxNftRewardLamports,
    };

    assertDeepEqual(stake, expectedStakeAfterStaking);

    await simulateTimePassage(ONE_YEAR_SECONDS, context);

    const expectedAnnualReward = calculateClaimableReward(
      stake,
      365,
      nftAPY,
      maxNftRewardLamports,
      maxNftApyDurationDays
    );

    await claimRpc(0);

    const userBalanceAfterClaim = await getBalance(addresses.userToken);

    expect(
      eq(expectedAnnualReward, userBalanceAfterClaim),
      "user balance should have annual reward"
    ).true;

    const [stakeAfterClaim] = await fetchStakes();

    const expectedStakeAfterClaim: StakeEntry = {
      ...expectedStakeAfterStaking,
      paidAmount: new BN(expectedAnnualReward.toString()),
    };

    assertDeepEqual(stakeAfterClaim, expectedStakeAfterClaim);

    await simulateTimePassage(ONE_DAY_SECONDS, context);

    const clockBeforeDestake = await context.banksClient.getClock();

    await destakeRpc(0);

    const expectedRewardAfterDestake = calculateClaimableReward(
      stake,
      366,
      nftAPY,
      maxNftRewardLamports,
      maxNftApyDurationDays
    );

    const userBalanceAfterDestake = await getBalance(addresses.userToken);

    expect(
      closeTo(
        userBalanceAfterDestake,
        dUserTokens + BigInt(expectedRewardAfterDestake)
      ),
      "user balance after destake should equal their initial balance and (365 + 1) days reward"
    ).true;

    const vaultBalanceAfterDestake = await getBalance(addresses.tokenVault);

    expect(
      closeTo(
        vaultBalanceAfterDestake,
        dVaultTokens - BigInt(expectedRewardAfterDestake)
      ),
      "Vault after destake does not match"
    ).true;

    const [stakeAfterDestake] = await fetchStakes();

    expect(
      eq(stakeAfterDestake.destakeTime, clockBeforeDestake.unixTimestamp),
      "stake should have destaked status"
    ).true;

    const clockAfterDestake = await context.banksClient.getClock();

    await program.methods
      .unlockNft(new BN(0))
      .accounts({
        signer: payer.publicKey,
        mint: addresses.nft,
      })
      .signers([payer])
      .rpc();

    const [stakeAfterNftUnlock] = await fetchStakes();
    const nftInfo = await fetchNftInfo();

    expect(
      eq(nftInfo.daysLocked, 366),
      "nft info should have right amount of locked days"
    ).true;

    expect(
      eq(stakeAfterNftUnlock.nftUnlockTime, clockAfterDestake.unixTimestamp),
      "stake unlock time should equal current block timestamp"
    ).true;

    expect(
      closeTo(stakeAfterNftUnlock.paidAmount, expectedRewardAfterDestake),
      "stake paid amount should equal (365 + 1) days reward"
    ).true;
  });
});
