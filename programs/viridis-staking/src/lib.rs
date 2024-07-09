use anchor_lang::prelude::*;

mod instructions;
use instructions::*;

mod constants;
mod error;
mod state;
mod utils;

declare_id!("FnHTgNPMBPPQqk3WhCB9vkreh4qoQ3n6ns6EBoCFaxpF");

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

    pub fn lock_nft(ctx: Context<LockNft>, stake_index: u64, lock_days: u16) -> Result<()> {
        instructions::lock_nft(ctx, stake_index, lock_days)
    }

    pub fn destake(ctx: Context<Destake>, stake_index: u8) -> Result<()> {
        instructions::destake(ctx, stake_index)
    }
}
