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
import { Program, IdlAccounts, BN, LangErrorCode } from "@coral-xyz/anchor";
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
  expectErrorWitLog,
  calculateReward,
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
  userA,
  userB,
} from "./const";
import { StakeEntry } from "./types";
import {
  claimRpc,
  destakeRpc,
  initializeStakeInfoRpc,
  lockNftRpc,
  restakeRpc,
  stakeRpc,
  unlockNftRpc,
} from "./rpc";
import { TEST_NFT_ADDRESS_WRONG_COLLECTION } from "../const";

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
    await airdropSol(context, userA.publicKey, 1);
    await airdropSol(context, userB.publicKey, 1);
    await createToken(context.banksClient, userA, DECIMALS, mintKeypair);
    await program.methods
      .initialize()
      .accounts({
        signer: userA.publicKey,
        mint: mintKeypair.publicKey,
        nftCollection: addresses.nftCollection,
      })
      .signers([userA])
      .rpc();
  };

  async function fetchStakes(stakeInfoAddress: PublicKey) {
    const stakeInfo = await program.account.stakeInfo.fetch(stakeInfoAddress);
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
        signer: userA.publicKey,
        mint: mintKeypair.publicKey,
      })
      .instruction();
  };

  const getDestakeTokenInstruction = async (stakeIndex: number) => {
    return program.methods
      .destake(new BN(stakeIndex))
      .accounts({
        signer: userA.publicKey,
        mint: mintKeypair.publicKey,
      })
      .instruction();
  };

  const getInitializeStakeInfoInstruction = async () => {
    return await program.methods
      .initializeStakeInfo()
      .accounts({
        signer: userA.publicKey,
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
        signer: userA.publicKey,
        mint: addresses.nft,
      })
      .instruction();
  };

  async function getBalance(address: PublicKey) {
    return getTokenBalance(context, address);
  }

  const creditVault = async (amount: bigint) => {
    await setSplToAccount(
      context,
      mintKeypair.publicKey,
      addresses.tokenVault,
      addresses.tokenVault,
      amount
    );
  };

  const creditSpl = async (amount: bigint, address: PublicKey) => {
    await createTokenAccountAndCredit(
      context,
      mintKeypair.publicKey,
      address,
      amount
    );
  };

  const creditNft = async (address: PublicKey) => {
    await createTokenAccountAndCredit(context, addresses.nft, address, 1n);
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
      userA.publicKey,
      mintKeypair.publicKey
    );
    await setupEnvironment(context, program);
  });

  it("Stake 1bil tokens, lock NFT immediately for 90 days, wait for 1 year, claim, wait for 1 day destake", async () => {
    const {
      baseApy,
      baseLockDays,
      maxNftRewardLamports,
      maxNftApyDurationDays,
    } = await fetchConfig();

    const userTokens = d(1_000_000);
    const vaultTokens = d(5_000_000_000);

    await creditSpl(userTokens, userA.publicKey);
    await creditNft(userA.publicKey);
    await creditVault(vaultTokens);

    const nftLockPeriod = 90;
    const nftAPY = NFT_APY[nftLockPeriod];

    const instructions: TransactionInstruction[] = [
      await getInitializeStakeInfoInstruction(),
      await getStakeTokenInstruction(userTokens),
      await getLockNftInstruction(0, nftLockPeriod),
    ];

    const messageV0 = new TransactionMessage({
      payerKey: userA.publicKey,
      recentBlockhash: context.lastBlockhash,
      instructions,
    }).compileToV0Message();

    const tx = new VersionedTransaction(messageV0);
    tx.sign([userA]);

    const clockBeforeStaking = await context.banksClient.getClock();

    await context.banksClient.processTransaction(tx);

    const [stake] = await fetchStakes(addresses.getStakeInfo(userA.publicKey));

    const userBalanceAfterStaking = await getBalance(addresses.userToken);
    const userStakeBalance = await getBalance(addresses.userStake);

    expect(
      eq(userBalanceAfterStaking, 0),
      "updated user balance after staking should equal 0"
    ).true;

    expect(
      eq(userStakeBalance, userTokens),
      "user stake account should equal initial user balance"
    ).true;

    expect(
      eq(stake.amount, userTokens),
      "stake account should hold initial user balance"
    ).true;

    const expectedStakeAfterStaking: StakeEntry = {
      amount: new BN(userTokens),
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

    const expectedAnnualReward = calculateClaimableReward(stake, 365, nftAPY);

    await claimRpc(0, userA, mintKeypair.publicKey, program);

    const userBalanceAfterClaim = await getBalance(addresses.userToken);

    expect(
      eq(expectedAnnualReward, userBalanceAfterClaim),
      "user balance should have annual reward"
    ).true;

    const [stakeAfterClaim] = await fetchStakes(
      addresses.getStakeInfo(userA.publicKey)
    );

    const expectedStakeAfterClaim: StakeEntry = {
      ...expectedStakeAfterStaking,
      paidAmount: new BN(expectedAnnualReward.toString()),
    };

    assertDeepEqual(stakeAfterClaim, expectedStakeAfterClaim);

    await simulateTimePassage(ONE_DAY_SECONDS, context);

    const clockBeforeDestake = await context.banksClient.getClock();

    await destakeRpc(0, userA, mintKeypair.publicKey, program);

    const expectedRewardAfterDestake = calculateClaimableReward(
      stake,
      366,
      nftAPY
    );

    const userBalanceAfterDestake = await getBalance(addresses.userToken);

    expect(
      closeTo(
        userBalanceAfterDestake,
        userTokens + BigInt(expectedRewardAfterDestake)
      ),
      "user balance after destake should equal their initial balance and (365 + 1) days reward"
    ).true;

    const vaultBalanceAfterDestake = await getBalance(addresses.tokenVault);

    expect(
      closeTo(
        vaultBalanceAfterDestake,
        vaultTokens - BigInt(expectedRewardAfterDestake)
      ),
      "Vault after destake does not match"
    ).true;

    const [stakeAfterDestake] = await fetchStakes(
      addresses.getStakeInfo(userA.publicKey)
    );

    expect(
      eq(stakeAfterDestake.destakeTime, clockBeforeDestake.unixTimestamp),
      "stake should have destaked status"
    ).true;

    const clockAfterDestake = await context.banksClient.getClock();

    await program.methods
      .unlockNft(new BN(0))
      .accounts({
        signer: userA.publicKey,
        mint: addresses.nft,
      })
      .signers([userA])
      .rpc();

    const [stakeAfterNftUnlock] = await fetchStakes(
      addresses.getStakeInfo(userA.publicKey)
    );
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

  it("should successfully initialize stake info for a new user", async () => {
    await initializeStakeInfoRpc(userA, program);
    const stakes = await fetchStakes(addresses.getStakeInfo(userA.publicKey));
    expect(stakes).to.be.an("array").that.is.empty;
  });

  it("should fail on double initialization", async () => {
    const instructions: TransactionInstruction[] = [
      await getInitializeStakeInfoInstruction(),
    ];

    const messageV0 = new TransactionMessage({
      payerKey: userA.publicKey,
      recentBlockhash: context.lastBlockhash,
      instructions,
    }).compileToV0Message();

    const tx = new VersionedTransaction(messageV0);
    tx.sign([userA]);

    await context.banksClient.processTransaction(tx);

    await expectErrorWitLog(
      initializeStakeInfoRpc(userA, program),
      "custom program error: 0x0"
    );
  });

  it("should initialize for multiple users", async () => {
    await initializeStakeInfoRpc(userA, program);
    await initializeStakeInfoRpc(userB, program);
  });

  it("should fail when locking NFT with invalid lock period", async () => {
    await creditSpl(d(1_000_000), userA.publicKey);
    await creditNft(userA.publicKey);

    await initializeStakeInfoRpc(userA, program);
    await stakeRpc(d(1_000), userA, mintKeypair.publicKey, program);

    await expectErrorWitLog(
      lockNftRpc(0, 15, userA, addresses.nft, program),
      "Invalid stake period"
    );
  });

  it("should fail when locking locked NFT second time", async () => {
    let [stakeAmount1, stakeAmount2] = [d(50_000), d(30_000)];

    await creditSpl(d(1_000_000), userA.publicKey);
    await creditNft(userA.publicKey);

    await initializeStakeInfoRpc(userA, program);
    await stakeRpc(stakeAmount1, userA, mintKeypair.publicKey, program);
    await stakeRpc(stakeAmount2, userA, mintKeypair.publicKey, program);
    await lockNftRpc(0, 30, userA, addresses.nft, program);

    await expectErrorWitLog(
      lockNftRpc(1, 30, userA, addresses.nft, program),
      "Error: insufficient funds"
    );
  });

  it("should fail when locking NFT on a non-existent stake", async () => {
    await creditSpl(d(1_000_000), userA.publicKey);
    await creditNft(userA.publicKey);

    await initializeStakeInfoRpc(userA, program);
    await stakeRpc(d(10_000), userA, mintKeypair.publicKey, program);

    await expectErrorWitLog(
      lockNftRpc(1, 30, userA, addresses.nft, program),
      "Invalid stake index"
    );
  });

  it("should fail when locking NFT of a different collection", async () => {
    it;
    await creditSpl(d(1_000_000), userA.publicKey);
    await creditNft(userA.publicKey);

    await createTokenAccountAndCredit(
      context,
      TEST_NFT_ADDRESS_WRONG_COLLECTION,
      userA.publicKey,
      1n
    );

    await initializeStakeInfoRpc(userA, program);
    await stakeRpc(d(10_000), userA, mintKeypair.publicKey, program);

    await expectErrorWitLog(
      lockNftRpc(0, 30, userA, TEST_NFT_ADDRESS_WRONG_COLLECTION, program),
      "Invalid NFT collection"
    );
  });

  it("should fail to unlock NFT before stake is destaked", async () => {
    await creditSpl(d(1_000_000), userA.publicKey);
    await creditNft(userA.publicKey);

    await initializeStakeInfoRpc(userA, program);
    await stakeRpc(d(10_000), userA, mintKeypair.publicKey, program);
    await lockNftRpc(0, 30, userA, addresses.nft, program);

    await expectErrorWitLog(
      unlockNftRpc(0, userA, addresses.nft, program),
      "Stake has not been destaked yet"
    );
  });

  it("should fail to unlock NFT on a stake without locked NFT", async () => {
    await creditSpl(d(1_000_000), userA.publicKey);
    await creditNft(userA.publicKey);

    await initializeStakeInfoRpc(userA, program);
    await stakeRpc(d(10_000), userA, mintKeypair.publicKey, program);
    await lockNftRpc(0, 30, userA, addresses.nft, program);
    await stakeRpc(d(10_000), userA, mintKeypair.publicKey, program);

    await expectErrorWitLog(
      unlockNftRpc(1, userA, addresses.nft, program),
      "Invalid NFT mint"
    );
  });

  it("should fail to claim rewards on a non-existent stake", async () => {
    await creditSpl(d(1_000_000), userA.publicKey);

    await initializeStakeInfoRpc(userA, program);

    await expectErrorWitLog(
      claimRpc(0, userA, mintKeypair.publicKey, program),
      "Invalid stake index"
    );
  });

  it("should fail when claiming destaked stake", async () => {
    await creditSpl(d(1_000_000), userA.publicKey);
    await creditVault(d(1_000_000));

    await initializeStakeInfoRpc(userA, program);
    await stakeRpc(d(10_000), userA, mintKeypair.publicKey, program);

    await simulateTimePassage(ONE_DAY_SECONDS * 14, context);

    await destakeRpc(0, userA, mintKeypair.publicKey, program);

    await expectErrorWitLog(
      claimRpc(0, userA, mintKeypair.publicKey, program),
      "Stake has already been destaked"
    );
  });

  it("should fail to destake before base lock period", async () => {
    await creditSpl(d(1_000_000), userA.publicKey);
    await creditVault(d(1_000_000));

    await initializeStakeInfoRpc(userA, program);
    await stakeRpc(d(10_000), userA, mintKeypair.publicKey, program);

    await simulateTimePassage(ONE_DAY_SECONDS * 13, context);

    await expectErrorWitLog(
      destakeRpc(0, userA, mintKeypair.publicKey, program),
      "Base lock period has not ended"
    );
  });

  it("should fail to destake before nft lock period", async () => {
    await creditSpl(d(1_000_000), userA.publicKey);
    await creditVault(d(1_000_000));
    await creditNft(userA.publicKey);

    await initializeStakeInfoRpc(userA, program);
    await stakeRpc(d(10_000), userA, mintKeypair.publicKey, program);
    await lockNftRpc(0, 90, userA, addresses.nft, program);

    await simulateTimePassage(ONE_DAY_SECONDS * 89, context);

    await expectErrorWitLog(
      destakeRpc(0, userA, mintKeypair.publicKey, program),
      "NFT lock period has not ended"
    );
  });

  it("should fail to destake a non-existent stake", async () => {
    await creditSpl(d(1_000_000), userA.publicKey);
    await creditVault(d(1_000_000));

    await initializeStakeInfoRpc(userA, program);
    await stakeRpc(d(10_000), userA, mintKeypair.publicKey, program);

    await simulateTimePassage(ONE_DAY_SECONDS * 14, context);

    await expectErrorWitLog(
      destakeRpc(-1, userA, mintKeypair.publicKey, program),
      "Invalid stake index"
    );
  });

  it("should fail to restake a destaked stake", async () => {
    await creditSpl(d(1_000_000), userA.publicKey);
    await creditVault(d(1_000_000));

    await initializeStakeInfoRpc(userA, program);
    await stakeRpc(d(10_000), userA, mintKeypair.publicKey, program);

    await simulateTimePassage(ONE_DAY_SECONDS * 14, context);

    await destakeRpc(0, userA, mintKeypair.publicKey, program);

    await expectErrorWitLog(
      restakeRpc(0, userA, mintKeypair.publicKey, program),
      "Stake has already been destaked"
    );
  });

  it("should fail to restake a restaked stake", async () => {
    await creditSpl(d(1_000_000), userA.publicKey);
    await creditVault(d(1_000_000));

    await initializeStakeInfoRpc(userA, program);
    await stakeRpc(d(10_000), userA, mintKeypair.publicKey, program);

    await restakeRpc(0, userA, mintKeypair.publicKey, program);

    await expectErrorWitLog(
      restakeRpc(1, userA, mintKeypair.publicKey, program),
      "Already restaked"
    );
  });

  it("should fail to restake a non-existent stake", async () => {
    await creditSpl(d(1_000_000), userA.publicKey);
    await creditVault(d(1_000_000));

    await initializeStakeInfoRpc(userA, program);
    await stakeRpc(d(10_000), userA, mintKeypair.publicKey, program);

    await expectErrorWitLog(
      restakeRpc(1, userA, mintKeypair.publicKey, program),
      "Invalid stake index"
    );
  });

  it("should fail to destake restaked stake before base lock period", async () => {
    await creditSpl(d(1_000_000), userA.publicKey);
    await creditVault(d(1_000_000));

    await initializeStakeInfoRpc(userA, program);
    await stakeRpc(d(10_000), userA, mintKeypair.publicKey, program);

    await simulateTimePassage(ONE_DAY_SECONDS * 30, context);

    await restakeRpc(0, userA, mintKeypair.publicKey, program);

    await simulateTimePassage(ONE_DAY_SECONDS * 10, context);

    await expectErrorWitLog(
      destakeRpc(1, userA, mintKeypair.publicKey, program),
      "Base lock period has not ended"
    );
  });

  it("should fail to destake restaked stake before nft lock period", async () => {
    await creditSpl(d(1_000_000), userA.publicKey);
    await creditVault(d(1_000_000));
    await creditNft(userA.publicKey);

    await initializeStakeInfoRpc(userA, program);
    await stakeRpc(d(10_000), userA, mintKeypair.publicKey, program);
    await lockNftRpc(0, 90, userA, addresses.nft, program);

    await simulateTimePassage(ONE_DAY_SECONDS * 90, context);

    await restakeRpc(0, userA, mintKeypair.publicKey, program);

    await simulateTimePassage(ONE_DAY_SECONDS * 14, context);

    await expectErrorWitLog(
      destakeRpc(1, userA, mintKeypair.publicKey, program),
      "NFT lock period has not ended"
    );
  });

  it("should track days NFT has been locked for and successfully reuse previously locked NFT", async () => {
    await creditSpl(d(1_000_000), userA.publicKey);
    await creditVault(d(1_000_000));
    await creditNft(userA.publicKey);
    const daysToLock = 30;
    const extraDaysOverLockingPeriod = 1;

    await initializeStakeInfoRpc(userA, program);
    await stakeRpc(d(10_000), userA, mintKeypair.publicKey, program);
    await lockNftRpc(0, daysToLock, userA, addresses.nft, program);

    await simulateTimePassage(
      ONE_DAY_SECONDS * (daysToLock + extraDaysOverLockingPeriod),
      context
    );

    await destakeRpc(0, userA, mintKeypair.publicKey, program);

    await simulateTimePassage(ONE_DAY_SECONDS * 5, context);

    await unlockNftRpc(0, userA, addresses.nft, program);

    const nftInfo = await fetchNftInfo();

    expect(
      nftInfo.daysLocked,
      "NFT lock days should equal days before destake"
    ).to.eq(daysToLock + extraDaysOverLockingPeriod);

    const daysToLock2ndTime = 30;

    await stakeRpc(d(10_000), userA, mintKeypair.publicKey, program);
    await lockNftRpc(1, daysToLock2ndTime, userA, addresses.nft, program);

    await simulateTimePassage(ONE_DAY_SECONDS * daysToLock2ndTime, context);

    await destakeRpc(1, userA, mintKeypair.publicKey, program);

    await simulateTimePassage(ONE_DAY_SECONDS * 5, context);

    await unlockNftRpc(1, userA, addresses.nft, program);

    const nftInfoAfter2ndStake = await fetchNftInfo();

    expect(
      nftInfoAfter2ndStake.daysLocked,
      "NFT lock days should equal days before destake"
    ).to.eq(daysToLock + daysToLock2ndTime + extraDaysOverLockingPeriod);
  });

  it("should fail if NFT max staking period ended", async () => {
    await creditSpl(d(1_000_000), userA.publicKey);
    await creditVault(d(1_000_000));
    await creditNft(userA.publicKey);
    const daysToLock = 60;
    const extraDaysOverLockingPeriod = 1;

    await initializeStakeInfoRpc(userA, program);
    await stakeRpc(d(10_000), userA, mintKeypair.publicKey, program);
    await lockNftRpc(0, daysToLock, userA, addresses.nft, program);

    await simulateTimePassage(
      ONE_DAY_SECONDS * (daysToLock + extraDaysOverLockingPeriod),
      context
    );

    await destakeRpc(0, userA, mintKeypair.publicKey, program);

    await unlockNftRpc(0, userA, addresses.nft, program);

    const daysToLock2ndTime = 30;

    await stakeRpc(d(10_000), userA, mintKeypair.publicKey, program);

    await expectErrorWitLog(
      lockNftRpc(1, daysToLock2ndTime, userA, addresses.nft, program),
      "Exceeds maximum lock duration"
    );
  });

  it("should correctly reward user with NFT-boosted APY after 90-day locked staking period of 1,000,000 tokens", async () => {
    const daysToLock = 90;
    const userCoins = d(1_000_000);

    await creditSpl(userCoins, userA.publicKey);
    await creditVault(d(5_000_000));
    await creditNft(userA.publicKey);

    await initializeStakeInfoRpc(userA, program);
    await stakeRpc(userCoins, userA, mintKeypair.publicKey, program);
    await lockNftRpc(0, daysToLock, userA, addresses.nft, program);

    await simulateTimePassage(ONE_DAY_SECONDS * daysToLock, context);

    await destakeRpc(0, userA, mintKeypair.publicKey, program);

    const userBalance = await getBalance(addresses.userToken);

    const nftAPY = NFT_APY[daysToLock];
    const [stake] = await fetchStakes(addresses.getStakeInfo(userA.publicKey));

    const expectedReward = calculateClaimableReward(stake, daysToLock, nftAPY);

    expect(eq(userBalance, userCoins + BigInt(expectedReward))).true;
    expect(eq(userBalance, 1271232_876712328n)).true;
  });

  it("should correctly reward user with NFT-boosted APY after 90-day locked staking period of 5,000,000 tokens and NFT reward limited to 750,000", async () => {
    const daysToLock = 90;
    const userCoins = d(5_000_000);

    await creditSpl(userCoins, userA.publicKey);
    await creditVault(d(10_000_000));
    await creditNft(userA.publicKey);

    await initializeStakeInfoRpc(userA, program);
    await stakeRpc(userCoins, userA, mintKeypair.publicKey, program);
    await lockNftRpc(0, daysToLock, userA, addresses.nft, program);

    await simulateTimePassage(ONE_DAY_SECONDS * daysToLock, context);

    await destakeRpc(0, userA, mintKeypair.publicKey, program);

    const userBalance = await getBalance(addresses.userToken);

    const nftAPY = NFT_APY[daysToLock];
    const [stake] = await fetchStakes(addresses.getStakeInfo(userA.publicKey));

    const expectedReward = calculateClaimableReward(stake, daysToLock, nftAPY);

    expect(eq(userBalance, userCoins + BigInt(expectedReward))).true;
    expect(eq(userBalance, 5817808_219178082n)).true; //67k from base 750k from nft
  });

  it("should correctly reward user with NFT-boosted APY for a 90-day locked staking period, including a restake after 45 days, with initial stake of 500,000 tokens", async () => {
    const daysToLock = 90;
    const daysBeforeRestake = 45;
    const userCoins = d(500_000);

    await creditSpl(userCoins, userA.publicKey);
    await creditVault(d(10_000_000));
    await creditNft(userA.publicKey);

    await initializeStakeInfoRpc(userA, program);
    await stakeRpc(userCoins, userA, mintKeypair.publicKey, program);
    await lockNftRpc(0, daysToLock, userA, addresses.nft, program);

    await simulateTimePassage(ONE_DAY_SECONDS * daysBeforeRestake, context);

    await restakeRpc(0, userA, mintKeypair.publicKey, program);

    await simulateTimePassage(ONE_DAY_SECONDS * daysToLock, context);

    await destakeRpc(1, userA, mintKeypair.publicKey, program);

    const userBalance = await getBalance(addresses.userToken);

    const nftAPY = NFT_APY[daysToLock];
    const [stake1, stake2] = await fetchStakes(
      addresses.getStakeInfo(userA.publicKey)
    );

    const expectedStake1Reward = calculateClaimableReward(
      stake1,
      daysBeforeRestake,
      nftAPY
    );

    const expectedStake2Reward = calculateClaimableReward(
      stake2,
      daysToLock,
      nftAPY
    );

    expect(
      eq(
        userBalance,
        userCoins + BigInt(expectedStake1Reward + expectedStake2Reward)
      )
    ).true;
    expect(eq(userBalance, 703424_657534246n)).true;
  });

  it("should correctly reward user with NFT-boosted APY for two consecutive staking periods (30 and 60 days) with initial stake of 500,000 tokens, including NFT locking and unlocking", async () => {
    const userCoins = d(500_000);
    const stake1days = 30;
    const stake2days = 60;
    const stake1NftAPY = NFT_APY[stake1days];
    const stake2NftAPY = NFT_APY[stake2days];

    await creditSpl(userCoins, userA.publicKey);
    await creditVault(d(10_000_000));
    await creditNft(userA.publicKey);

    await initializeStakeInfoRpc(userA, program);
    await stakeRpc(userCoins, userA, mintKeypair.publicKey, program);
    await lockNftRpc(0, stake1days, userA, addresses.nft, program);

    await simulateTimePassage(ONE_DAY_SECONDS * stake1days, context);

    await destakeRpc(0, userA, mintKeypair.publicKey, program);
    await unlockNftRpc(0, userA, addresses.nft, program);

    await stakeRpc(userCoins, userA, mintKeypair.publicKey, program);
    await lockNftRpc(1, stake2days, userA, addresses.nft, program);

    await simulateTimePassage(ONE_DAY_SECONDS * stake2days, context);

    await destakeRpc(1, userA, mintKeypair.publicKey, program);
    await unlockNftRpc(1, userA, addresses.nft, program);

    const nftInfo = await fetchNftInfo();

    expect(nftInfo.daysLocked, "nft info should hold correct lock value").to.eq(
      stake1days + stake2days
    );

    const userBalance = await getBalance(addresses.userToken);

    const [stake1, stake2] = await fetchStakes(
      addresses.getStakeInfo(userA.publicKey)
    );

    const stake1Reward = calculateClaimableReward(
      stake1,
      stake1days,
      stake1NftAPY
    );

    const stake2Reward = calculateClaimableReward(
      stake2,
      stake2days,
      stake2NftAPY
    );

    expect(
      closeTo(userBalance, userCoins + BigInt(stake1Reward + stake2Reward), 2)
    ).true;
    expect(eq(userBalance, 567808_219178080n)).true;
  });

  it("should correctly reward user with NFT-boosted APY for a 30-day staking period and then prevent locking NFT for 90 days due to maximum lock duration", async () => {
    const userCoins = d(500_000);
    const stake1days = 30;
    const stake2days = 90;

    await creditSpl(userCoins, userA.publicKey);
    await creditVault(d(10_000_000));
    await creditNft(userA.publicKey);

    await initializeStakeInfoRpc(userA, program);
    await stakeRpc(userCoins, userA, mintKeypair.publicKey, program);
    await lockNftRpc(0, stake1days, userA, addresses.nft, program);

    await simulateTimePassage(ONE_DAY_SECONDS * stake1days, context);

    await destakeRpc(0, userA, mintKeypair.publicKey, program);
    await unlockNftRpc(0, userA, addresses.nft, program);

    await stakeRpc(userCoins, userA, mintKeypair.publicKey, program);

    await expectErrorWitLog(
      lockNftRpc(1, stake2days, userA, addresses.nft, program),
      "Exceeds maximum lock duration"
    );
  });

  it("should correctly reward user with NFT-boosted APY for three staking periods (30, 60, and 60 days) with initial stake of 500,000 tokens, including NFT locking, unlocking, and restaking", async () => {
    const userCoins = d(500_000);
    const stake1days = 30;
    const stake2days = 60;
    const stake1NftAPY = NFT_APY[stake1days];
    const stake2NftAPY = NFT_APY[stake2days];

    await creditSpl(userCoins, userA.publicKey);
    await creditVault(d(10_000_000));
    await creditNft(userA.publicKey);

    await initializeStakeInfoRpc(userA, program);
    await stakeRpc(userCoins, userA, mintKeypair.publicKey, program);
    await lockNftRpc(0, stake1days, userA, addresses.nft, program);

    await simulateTimePassage(ONE_DAY_SECONDS * stake1days, context);

    await destakeRpc(0, userA, mintKeypair.publicKey, program);
    await unlockNftRpc(0, userA, addresses.nft, program);

    await stakeRpc(userCoins, userA, mintKeypair.publicKey, program);
    await lockNftRpc(1, stake2days, userA, addresses.nft, program);

    await simulateTimePassage(ONE_DAY_SECONDS * stake2days, context);

    await restakeRpc(1, userA, mintKeypair.publicKey, program);

    await simulateTimePassage(ONE_DAY_SECONDS * stake2days, context);

    await destakeRpc(2, userA, mintKeypair.publicKey, program);
    await unlockNftRpc(2, userA, addresses.nft, program);

    const nftInfo = await fetchNftInfo();

    expect(nftInfo.daysLocked, "nft info should hold correct lock value").to.eq(
      stake1days + stake2days
    );

    const userBalance = await getBalance(addresses.userToken);

    const [stake1, stake2, stake3] = await fetchStakes(
      addresses.getStakeInfo(userA.publicKey)
    );

    const stake1Reward = calculateClaimableReward(
      stake1,
      stake1days,
      stake1NftAPY
    );

    const stake2Reward = calculateClaimableReward(
      stake2,
      stake2days,
      stake2NftAPY
    );

    const stake3Reward = calculateClaimableReward(
      stake3,
      stake2days,
      stake2NftAPY
    );

    expect(
      closeTo(
        userBalance,
        userCoins + BigInt(stake1Reward + stake2Reward + stake3Reward),
        3
      )
    ).true;
    expect(eq(userBalance, 621232_876712326n)).true;
  });

  it("should correctly reward user with NFT-boosted APY for a 30-day staking period and then prevent locking NFT for 90 days due to maximum lock duration", async () => {
    const userCoins = d(500_000);
    const stake1days = 30;

    await creditSpl(userCoins, userA.publicKey);
    await creditVault(d(10_000_000));
    await creditNft(userA.publicKey);

    await initializeStakeInfoRpc(userA, program);
    await stakeRpc(userCoins, userA, mintKeypair.publicKey, program);
    await lockNftRpc(0, stake1days, userA, addresses.nft, program);

    await simulateTimePassage(ONE_DAY_SECONDS * 13, context);

    await expectErrorWitLog(
      destakeRpc(0, userA, mintKeypair.publicKey, program),
      "Base lock period has not ended"
    );

    await simulateTimePassage(ONE_DAY_SECONDS, context);

    const instructions: TransactionInstruction[] = [
      await getDestakeTokenInstruction(0),
    ];

    const messageV0 = new TransactionMessage({
      payerKey: userA.publicKey,
      recentBlockhash: context.lastBlockhash,
      instructions,
    }).compileToV0Message();

    const tx = new VersionedTransaction(messageV0);
    tx.sign([userA]);

    const result = await context.banksClient.simulateTransaction(tx);

    expect(
      result.meta?.logMessages.some((log) =>
        log.includes("NFT lock period has not ended")
      )
    ).true;
  });
});
