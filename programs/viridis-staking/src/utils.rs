use anchor_lang::prelude::*;
use crate::error::ErrorCode;
use crate::constants::STAKING_DAYS_APY;

pub fn get_apy(stake_period: u8) -> Result<u64> {
    STAKING_DAYS_APY.iter()
        .find(|&&(days, _)| days == stake_period)
        .map(|&(_, apy)| apy)
        .ok_or_else(|| ErrorCode::InvalidStakePeriod.into())
}

pub fn calculate_reward(stake_amount: u64, apy: u64, days_passed: u64) -> Result<u64> {
    stake_amount
        .checked_mul(apy)
        .and_then(|v| v.checked_div(100))
        .and_then(|v| v.checked_mul(days_passed))
        .and_then(|v| v.checked_div(365))
        .ok_or(ErrorCode::CalculationError.into())
}
