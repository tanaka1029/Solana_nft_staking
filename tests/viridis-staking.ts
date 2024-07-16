import { startAnchor, ProgramTestContext, Clock } from "solana-bankrun";
import { BankrunProvider } from "anchor-bankrun";
import {
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { BN, Program, workspace } from "@coral-xyz/anchor";
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
import { Collection } from "@metaplex-foundation/mpl-token-metadata";
import Big from "big.js";

chai.use(chaiAsPromised);
const { expect } = chai;

const getNftLockAccount = (
  stakeIndex: number,
  payer: PublicKey,
  programId: PublicKey
): PublicKey => {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("nft"),
      payer.toBuffer(),
      Buffer.from(new Uint8Array(new BN(stakeIndex).toArray("le", 8))),
    ],
    programId
  )[0];
};

describe("viridis_staking", () => {
  const APY_DECIMALS = 2;
  const DECIMALS = 9;
  const NFT_APY = { 30: 2950, 60: 5950, 90: 10450 };
  const ONE_DAY_SECONDS = 24 * 60 * 60;
  const ONE_YEAR_SECONDS = ONE_DAY_SECONDS * 365;

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

  beforeEach(async () => {
    const seedAccounts = await getSeedAccounts();
    context = await startAnchor("", [], seedAccounts);
    provider = new BankrunProvider(context);
    program = new Program<ViridisStaking>(IDL as ViridisStaking, provider);
    addresses = await setupAddresses(program.programId);
    await setupEnvironment(context, program);
  });

  const calculateReward = (
    amount: number,
    apy: number,
    daysPassed: number
  ): number | null => {
    try {
      const bAmount = new Big(amount);
      const bApy = new Big(apy).div(Big(10).pow(APY_DECIMALS));
      const bDaysPassed = new Big(daysPassed);
      const dailyRate = bApy.div(new Big(365));
      const dailyMultiplier = dailyRate.div(new Big(100));
      const reward = bAmount.mul(dailyMultiplier).mul(bDaysPassed);
      return reward.round(undefined, 0).toNumber();
    } catch (error) {
      console.error("Error in calculateReward:", error);
      return null;
    }
  };

  const getStakeTokenInstruction = async (amountDecimals: BN) => {
    return program.methods
      .stake(amountDecimals)
      .accounts({
        signer: payer.publicKey,
        mint: mintKeypair.publicKey,
      })
      .instruction();
  };

  const d_ = (amount: number): bigint => BigInt(amount * 10 ** DECIMALS);

  const credit = async (tokenAmount: number | bigint, nftAmount: number) => {
    const userTokenDecimals = d_(Number(tokenAmount));
    if (tokenAmount) {
      await createTokenAccountAndCredit(
        context,
        mintKeypair.publicKey,
        payer.publicKey,
        userTokenDecimals
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
  };

  it("Stake 1bil tokens, lock NFT immediately for 90 days, wait for 1 year, claim, wait for 1 day destake", async () => {
    const config = await program.account.config.fetch(addresses.config);

    const userTokens = 1_000_000_000;
    const vaultTokens = 5_000_000_000;
    const d_userTokens = d_(userTokens);
    const d_vaultTokens = d_(vaultTokens);
    const userNftCount = 1;
    const nftLockPeriod = 90;
    const nftAPY = NFT_APY[nftLockPeriod];

    await credit(userTokens, userNftCount);
    await setSplToAccount(
      context,
      mintKeypair.publicKey,
      addresses.tokenVault,
      addresses.tokenVault,
      d_vaultTokens
    );

    const instructions = [
      await program.methods
        .initializeStakeInfo()
        .accounts({
          signer: payer.publicKey,
          stakeInfo: addresses.stakeInfo,
        })
        .instruction(),
      await getStakeTokenInstruction(new BN(d_userTokens.toString())),
      await program.methods
        .lockNft(new BN(0), new BN(nftLockPeriod))
        .accounts({
          signer: payer.publicKey,
          mint: addresses.nft,
        })
        .instruction(),
    ];

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
    const [stake] = stakeInfo.stakes;
    const userBalanceAfterStaking = await getTokenBalance(
      context,
      addresses.userToken
    );
    const userStakeBalance = await getTokenBalance(
      context,
      addresses.userStake
    );

    expect(userBalanceAfterStaking).to.equal(
      0n,
      "updated user balance after staking should equal 0"
    );
    expect(userStakeBalance).to.equal(
      d_userTokens,
      "user stake account should equal initial user balance"
    );
    expect(BigInt(stake.amount.toString())).to.equal(
      d_userTokens,
      "stake account should hold initial user balance"
    );
    expect(stake.baseApy).to.equal(
      config.baseApy,
      "stake base apy should equal config base apy"
    );
    expect(stake.stakeLockDays).to.equal(
      config.baseLockDays,
      "stake lock days should equal config lock days"
    );
    expect(stake.isDestaked).to.equal(false, "stake shouldnt be destaked");
    expect(stake.nftLockDays).to.equal(
      nftLockPeriod,
      "nft lock days should equal nftLockPeriod param"
    );
    expect(stake.nftApy).to.equal(
      nftAPY,
      "nft apy should equal APY from the constant"
    );
    expect(stake.nftUnlockTime).to.equal(
      null,
      "stake unlock time should equal null"
    );
    expect(stake.paidAmount.toNumber()).to.equal(
      0,
      "stake paid amount should be zero"
    );
    expect(stake.nftLockTime.toNumber()).to.equal(
      stake.startTime.toNumber(),
      "stake start time and nft lock time should be the same"
    );
    expect(stake.startTime).to.not.equal(
      null,
      "stake start time shouldnt be null"
    );
    expect(stake.nftLockTime).to.not.equal(
      null,
      "stake nft lock time shouldnt be null"
    );

    const currentClock = await context.banksClient.getClock();
    const oneYearFromNow =
      currentClock.unixTimestamp + BigInt(ONE_YEAR_SECONDS);
    context.setClock(
      new Clock(
        currentClock.slot,
        currentClock.epochStartTimestamp,
        currentClock.epoch,
        currentClock.leaderScheduleEpoch,
        oneYearFromNow
      )
    );

    const baseAPY = stake.baseApy;
    const totalAPY = baseAPY + nftAPY;
    const yearInDays = 365;
    const expectedAnnualReward = calculateReward(
      stake.amount,
      totalAPY,
      yearInDays
    );

    await program.methods
      .claim(new BN(0))
      .accounts({
        signer: payer.publicKey,
        mint: mintKeypair.publicKey,
      })
      .signers([payer])
      .rpc();

    const userBalanceAfterClaim = await getTokenBalance(
      context,
      addresses.userToken
    );
    expect(BigInt(expectedAnnualReward)).to.equal(
      userBalanceAfterClaim,
      "User balance should have expected reward"
    );

    const stakeInfoAfterClaim = await program.account.stakeInfo.fetch(
      addresses.stakeInfo
    );
    const [stakeAfterClaim] = stakeInfoAfterClaim.stakes;
    expect(BigInt(expectedAnnualReward)).to.equal(
      BigInt(stakeAfterClaim.paidAmount),
      "Paid amount should equal expected reward"
    );

    const clockAfterClaim = await context.banksClient.getClock();
    const oneDayAfterClaim =
      clockAfterClaim.unixTimestamp + BigInt(ONE_DAY_SECONDS);
    context.setClock(
      new Clock(
        clockAfterClaim.slot,
        clockAfterClaim.epochStartTimestamp,
        clockAfterClaim.epoch,
        clockAfterClaim.leaderScheduleEpoch,
        oneDayAfterClaim
      )
    );

    await program.methods
      .destake(new BN(0))
      .accounts({
        signer: payer.publicKey,
        mint: mintKeypair.publicKey,
      })
      .signers([payer])
      .rpc();

    const expectedSingleDayBaseReward = calculateReward(
      stake.amount,
      baseAPY,
      1
    );
    const expectedSingleDayNftReward = calculateReward(stake.amount, nftAPY, 1);
    const userBalanceAfterDestake = await getTokenBalance(
      context,
      addresses.userToken
    );
    const expectedDailyReward =
      expectedSingleDayBaseReward + expectedSingleDayNftReward;

    expect(BigInt(userBalanceAfterDestake)).to.equal(
      BigInt(expectedAnnualReward) + d_userTokens + BigInt(expectedDailyReward),
      "User balance after destake should equal the sum of expectedAnnualReward + d_userTokens + expectedDailyReward"
    );

    const vaultBalanceAfterDestake = await getTokenBalance(
      context,
      addresses.tokenVault
    );

    expect(BigInt(vaultBalanceAfterDestake)).to.equal(
      d_vaultTokens -
        BigInt(expectedAnnualReward) -
        BigInt(expectedDailyReward),
      "Vault after destake should equal the sum of all paid rewards"
    );

    const stakeInfoAfterDestake = await program.account.stakeInfo.fetch(
      addresses.stakeInfo
    );

    const [stakeAfterDestake] = stakeInfoAfterDestake.stakes;

    expect(stakeAfterDestake.isDestaked).to.equal(
      true,
      "stake should have destaked status"
    );

    const clockAfterDestake = await context.banksClient.getClock();

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
  });
});
