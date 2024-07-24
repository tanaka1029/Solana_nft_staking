use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("No tokens to stake")]
    NoTokens,
    #[msg("Invalid stake period")]
    InvalidStakePeriod,
    #[msg("Stake period not met")]
    StakePeriodNotMet,
    #[msg("Calculation error")]
    CalculationError,
    #[msg("No stakes found")]
    NoStakes,
    #[msg("Invalid stake index")]
    InvalidStakeIndex,
    #[msg("Stake has already been destaked")]
    AlreadyDestaked,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("Failed to reallocate account")]
    ReallocError,
    #[msg("NFT already locked")]
    NftAlreadyLocked,
    #[msg("Invalid NFT collection")]
    InvalidCollection,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Reward calculation failed")]
    RewardCalculationFailed,
    #[msg("Base lock period has not ended")]
    BaseLockPeriodNotEnded,
    #[msg("NFT lock period has not ended")]
    NftLockPeriodNotEnded,
    #[msg("Stake has not been destaked yet")]
    StakeNotDestaked,
    #[msg("No NFT is locked in this stake")]
    NoNftLocked,
    #[msg("Invalid NFT mint")]
    InvalidNftMint,
    #[msg("Exceeds maximum lock duration")]
    ExceedsMaxLockDuration,
    #[msg("Already restaked")]
    AlreadyRestaked,
    #[msg("Restake is only allowed before 1/3 of the NFT lock period has passed")]
    RestakeTooLate,
}
