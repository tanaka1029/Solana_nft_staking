use anchor_lang::prelude::*;

use crate::{ constants::*, state::StakeInfo };

#[derive(Accounts)]
pub struct InitializeStakeInfo<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        init,
        payer = signer,
        space = 8 + 32 + 4,
        seeds = [STAKE_INFO_SEED, signer.key.as_ref()],
        bump
    )]
    pub stake_info: Account<'info, StakeInfo>,

    pub system_program: Program<'info, System>,
}

pub fn initialize_stake_info(ctx: Context<InitializeStakeInfo>) -> Result<()> {
    let stake_info = &mut ctx.accounts.stake_info;
    stake_info.address = ctx.accounts.signer.key();
    Ok(())
}
