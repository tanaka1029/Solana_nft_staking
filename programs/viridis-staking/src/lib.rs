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

    pub fn stake(ctx: Context<Stake>, amount: u64, stake_period: u8) -> Result<()> {
        instructions::stake(ctx, amount, stake_period)
    }

    // pub fn destake(ctx: Context<Destake>) -> Result<()> {
    //     instructions::destake(ctx)
    // }
}
