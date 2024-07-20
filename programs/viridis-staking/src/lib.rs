use anchor_lang::prelude::*;

mod instructions;
use instructions::*;

mod constants;
mod error;
mod state;
mod utils;

#[cfg(test)]
mod tests;

declare_id!("4Y3DWRxpDUHfkKfEqX2joWtcTbR2kyd4wNv94jY3eHLv");

#[program]
pub mod viridis_staking {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        instructions::initialize(ctx)
    }

    pub fn update_config(ctx: Context<UpdateConfig>, args: UpdateConfigArgs) -> Result<()> {
        instructions::update_config(ctx, args)
    }

    pub fn initialize_stake_info(ctx: Context<InitializeStakeInfo>) -> Result<()> {
        instructions::initialize_stake_info(ctx)
    }

    pub fn stake(ctx: Context<Stake>, amount: u64) -> Result<()> {
        instructions::stake(ctx, amount)
    }

    pub fn restake(ctx: Context<Restake>, stake_index: u16) -> Result<()> {
        instructions::restake(ctx, stake_index)
    }

    pub fn lock_nft(ctx: Context<LockNft>, stake_index: u64, lock_days: u16) -> Result<()> {
        instructions::lock_nft(ctx, stake_index, lock_days)
    }

    pub fn unlock_nft(ctx: Context<UnlockNft>, stake_index: u64) -> Result<()> {
        instructions::unlock_nft(ctx, stake_index)
    }

    pub fn claim(ctx: Context<Claim>, stake_index: u64) -> Result<()> {
        instructions::claim(ctx, stake_index)
    }

    pub fn destake(ctx: Context<Destake>, stake_index: u64) -> Result<()> {
        instructions::destake(ctx, stake_index)
    }
}
