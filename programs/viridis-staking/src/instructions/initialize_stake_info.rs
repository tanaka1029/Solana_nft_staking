use anchor_lang::prelude::*;

use crate::{ constants::*, state::StakeInfo };

#[derive(Accounts)]
pub struct InitializeStakeInfo<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        init,
        payer = signer,
        space = 8 + 4,
        seeds = [STAKE_INFO_SEED, signer.key.as_ref()],
        bump
    )]
    pub stake_info: Account<'info, StakeInfo>,

    pub system_program: Program<'info, System>,
}

pub fn initialize_stake_info(_ctx: Context<InitializeStakeInfo>) -> Result<()> {
    Ok(())
}
