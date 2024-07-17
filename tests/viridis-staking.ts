import { startAnchor, ProgramTestContext, Clock } from "solana-bankrun";
import { BankrunProvider } from "anchor-bankrun";
import {
  Keypair,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { Program, IdlAccounts, BN } from "@coral-xyz/anchor";
import { getKeypair } from "../utils";
import {
  airdropSol,
  createTokenAccountAndCredit,
  createToken,
  getTokenBalance,
  fetchAccounts,
  setSplToAccount,
} from "./utils";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { ViridisStaking } from "../target/types/viridis_staking";
import IDL from "../target/idl/viridis_staking.json";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { TEST_NFT_ADDRESS, TOKEN_METADATA_PROGRAM_ID } from "../const";
import { deserializeMetaplexMetadata, getNftMetadataAddress } from "./metaplex";
import Big from "big.js";

chai.use(chaiAsPromised);
const { expect } = chai;

describe("viridis_staking", () => {
  // Constants
  const APY_DECIMALS = 2;

  const DECIMALS = 9;
  const NFT_APY = { 30: 2950, 60: 5950, 90: 10450 };
  const ONE_DAY_SECONDS = 24 * 60 * 60;
  const ONE_YEAR_SECONDS = ONE_DAY_SECONDS * 365;

  // Test setup
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

  type ProgramAccounts = IdlAccounts<ViridisStaking>;

  type Config = ProgramAccounts["config"];
  type StakeInfo = ProgramAccounts["stakeInfo"];
  type StakeEntry = {
    amount: BN;
    startTime: BN;
    stakeLockDays: number;
    baseApy: number;
    nft: PublicKey | null;
    nftLockTime: BN | null;
    nftLockDays: number | null;
    nftApy: number | null;
    nftUnlockTime: BN | null;
    isDestaked: boolean;
    paidAmount: BN;
  };

  let context: ProgramTestContext;
  let provider: BankrunProvider;
  let program: Program<ViridisStaking>;
  let addresses: Awaited<ReturnType<typeof setupAddresses>>;

  // Helper functions
  const setupAddresses = async (programId: PublicKey) => {
    const metadataAddress = getNftMetadataAddress(TEST_NFT_ADDRESS);
    const metadataInfo = await context.banksClient.getAccount(metadataAddress);

    if (metadataInfo === null) {
      throw new Error("Metadata info is null");
    }

    const metadata = deserializeMetaplexMetadata(metadataAddress, metadataInfo);

    const nftCollection =
      metadata.collection.__option === "Some" && metadata.collection.value
        ? metadata.collection.value
        : (() => {
            throw new Error("NFT collection is missing or invalid");
          })();

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

  const getSeedAccounts = async () => {
    const metadataAddress = getNftMetadataAddress(TEST_NFT_ADDRESS);
    return fetchAccounts([
      TOKEN_METADATA_PROGRAM_ID,
      TEST_NFT_ADDRESS,
      metadataAddress,
    ]);
  };

  // Function to simulate time passage
  async function simulateTimePassage(
    secondsToAdd: number
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

  const d = (amount: number): bigint => BigInt(amount * 10 ** DECIMALS);

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

  function assertDeepEqual<T extends Record<string, any>>(
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

  function closeTo(
    actual: BN | bigint | number,
    expected: BN | bigint | number,
    tolerance: BN | bigint | number = new BN(1)
  ) {
    const difference = new BN(`${expected}`).sub(new BN(`${actual}`)).abs();

    return difference.lte(new BN(`${tolerance}`));
  }

  function calculateClaimableReward(
    stake: StakeEntry,
    daysPassed: number,
    nftAPY: number,
    maxNftRewardLamports: number
  ) {
    const annualBaseReward = calculateReward(
      stake.amount,
      stake.baseApy,
      daysPassed
    );
    const annualNftReward = calculateReward(stake.amount, nftAPY, daysPassed);
    const limitedAnnualNftReward = Math.min(
      annualNftReward,
      maxNftRewardLamports
    );

    return annualBaseReward + limitedAnnualNftReward;
  }

  // Test setup
  beforeEach(async () => {
    const seedAccounts = await getSeedAccounts();
    context = await startAnchor("", [], seedAccounts);
    provider = new BankrunProvider(context);
    program = new Program<ViridisStaking>(IDL as ViridisStaking, provider);
    addresses = await setupAddresses(program.programId);
    await setupEnvironment(context, program);
  });

  // Tests
  it("Stake 1bil tokens, lock NFT immediately for 90 days, wait for 1 year, claim, wait for 1 day destake", async () => {
    const { baseApy, baseLockDays, maxNftRewardLamports } =
      await program.account.config.fetch(addresses.config);

    let userTokens;
    let vaultTokens;
    let userNftCount;

    await credit(
      (userTokens = 1_000_000_000),
      (vaultTokens = 5_000_000_000),
      (userNftCount = 1)
    );

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

    const stakeInfo = await program.account.stakeInfo.fetch(
      addresses.stakeInfo
    );
    const [stake] = stakeInfo.stakes;

    const userBalanceAfterStaking = await getBalance(addresses.userToken);
    const userStakeBalance = await getBalance(addresses.userStake);

    // Assertions for initial staking
    expect(userBalanceAfterStaking).to.equal(
      0n,
      "updated user balance after staking should equal 0"
    );
    expect(userStakeBalance).to.equal(
      dUserTokens,
      "user stake account should equal initial user balance"
    );

    expect(BigInt(stake.amount.toString())).to.equal(
      dUserTokens,
      "stake account should hold initial user balance"
    );

    const expectedStakeAfterStaking: StakeEntry = {
      amount: new BN(dUserTokens),
      baseApy: baseApy,
      stakeLockDays: baseLockDays,
      nft: addresses.nft,
      nftApy: nftAPY,
      nftLockDays: nftLockPeriod,
      startTime: new BN(clockBeforeStaking.unixTimestamp),
      nftLockTime: stake.startTime,
      nftUnlockTime: null,
      paidAmount: new BN(0),
      isDestaked: false,
    };

    assertDeepEqual(stake, expectedStakeAfterStaking);

    await simulateTimePassage(ONE_YEAR_SECONDS);

    const expectedAnnualReward = calculateClaimableReward(
      stake,
      365,
      nftAPY,
      maxNftRewardLamports
    );

    // Claim rewards
    await claimRpc(0);

    const userBalanceAfterClaim = await getBalance(addresses.userToken);
    expect(BigInt(expectedAnnualReward)).to.equal(
      userBalanceAfterClaim,
      "user balance should have annual reward"
    );

    const stakeInfoAfterClaim = await program.account.stakeInfo.fetch(
      addresses.stakeInfo
    );
    const [stakeAfterClaim] = stakeInfoAfterClaim.stakes;

    const expectedStakeAfterClaim: StakeEntry = {
      ...expectedStakeAfterStaking,
      paidAmount: new BN(expectedAnnualReward.toString()),
    };

    assertDeepEqual(stakeAfterClaim, expectedStakeAfterClaim);

    await simulateTimePassage(ONE_DAY_SECONDS);

    // Destake
    await destakeRpc(0);

    const expectedRewardAfterDestake = calculateClaimableReward(
      stake,
      366,
      nftAPY,
      maxNftRewardLamports
    );

    const userBalanceAfterDestake = await getTokenBalance(
      context,
      addresses.userToken
    );

    expect(
      closeTo(
        userBalanceAfterDestake,
        dUserTokens + BigInt(expectedRewardAfterDestake)
      ),
      "user balance after destake should equal their initial balance and (365 + 1)days reward"
    ).true;

    const vaultBalanceAfterDestake = await getTokenBalance(
      context,
      addresses.tokenVault
    );

    expect(
      closeTo(
        vaultBalanceAfterDestake,
        dVaultTokens - BigInt(expectedRewardAfterDestake)
      ),
      "Vault after destake does not match"
    ).true;

    const stakeInfoAfterDestake = await program.account.stakeInfo.fetch(
      addresses.stakeInfo
    );
    const [stakeAfterDestake] = stakeInfoAfterDestake.stakes;

    expect(stakeAfterDestake.isDestaked).to.equal(
      true,
      "stake should have destaked status"
    );

    const clockAfterDestake = await context.banksClient.getClock();

    // Unlock NFT
    await program.methods
      .unlockNft(new BN(0))
      .accounts({
        signer: payer.publicKey,
        mint: addresses.nft,
      })
      .signers([payer])
      .rpc();

    const stakeInfoAfterNftUnlock = await program.account.stakeInfo.fetch(
      addresses.stakeInfo
    );
    const [stakeAfterNftUnlock] = stakeInfoAfterNftUnlock.stakes;

    expect(BigInt(stakeAfterNftUnlock.nftUnlockTime)).to.equal(
      clockAfterDestake.unixTimestamp,
      "stake unlock time should equal current block timestamp"
    );

    expect(
      closeTo(stakeAfterNftUnlock.paidAmount, expectedRewardAfterDestake),
      "stake paid amount should equal (365 + 1)days reward"
    ).true;
  });
});
