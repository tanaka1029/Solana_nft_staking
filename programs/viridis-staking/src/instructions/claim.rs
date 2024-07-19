use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{ Token, TokenAccount, Mint };

use crate::constants::*;
use crate::state::*;
use crate::error::ErrorCode;
use crate::utils::{ calculate_claimable_reward, transfer_tokens };

#[derive(Accounts)]
#[instruction(stake_index: u64)]
pub struct Claim<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(mut, seeds = [VAULT_SEED], bump)]
    pub token_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [STAKE_INFO_SEED, signer.key.as_ref()],
        bump,
    )]
    pub stake_info: Account<'info, StakeInfo>,

    #[account(mut, associated_token::mint = mint, associated_token::authority = signer)]
    pub user_token: Account<'info, TokenAccount>,

    pub mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn claim(ctx: Context<Claim>, stake_index: u64) -> Result<()> {
    let Claim { token_program, stake_info, token_vault, user_token, .. } = ctx.accounts;

    require!((stake_index as usize) < stake_info.stakes.len(), ErrorCode::InvalidStakeIndex);

    let stake_entry = &mut stake_info.stakes[stake_index as usize];
    require!(stake_entry.destake_time.is_none(), ErrorCode::AlreadyDestaked);

    let current_time = Clock::get()?.unix_timestamp;

    let claimable_reward = calculate_claimable_reward(stake_entry, current_time)?;

    if claimable_reward > 0 {
        stake_entry.add_payment(claimable_reward);

        transfer_tokens(
            token_vault.to_account_info(),
            user_token.to_account_info(),
            token_vault.to_account_info(),
            claimable_reward,
            token_program.to_account_info(),
            Some(&[&[VAULT_SEED, &[ctx.bumps.token_vault]]])
        )?;
    }

    Ok(())
}
