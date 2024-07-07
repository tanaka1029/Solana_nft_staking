use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{ Mint, Token, TokenAccount, Transfer, transfer },
};
use crate::{ constants::*, error::ErrorCode, state::StakeInfo, utils::* };

#[derive(Accounts)]
pub struct Destake<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(mut, seeds = [VAULT_SEED], bump)]
    pub token_vault_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [STAKE_INFO_SEED, signer.key.as_ref()],
        bump,
    )]
    pub stake_info_account: Account<'info, StakeInfo>,

    #[account(
        mut,
        seeds = [TOKEN_SEED, signer.key.as_ref()],
        bump,
    )]
    pub stake_account: Account<'info, TokenAccount>,

    #[account(mut, associated_token::mint = mint, associated_token::authority = signer)]
    pub user_token_account: Account<'info, TokenAccount>,

    pub mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn destake(ctx: Context<Destake>, stake_index: u8) -> Result<()> {
    // Extract necessary information
    let stake_info = &mut ctx.accounts.stake_info_account;
    let clock = Clock::get()?;
    let current_time = clock.unix_timestamp as u64;

    // Validations
    require!(!stake_info.stakes.is_empty(), ErrorCode::NoStakes);
    require!((stake_index as usize) < stake_info.stakes.len(), ErrorCode::InvalidStakeIndex);

    let stake_entry = &mut stake_info.stakes[stake_index as usize];
    require!(!stake_entry.is_destaked, ErrorCode::AlreadyDestaked);

    let days_passed = calculate_days_passed(stake_entry.start_time, current_time);
    require!(days_passed >= u64::from(stake_entry.period), ErrorCode::StakePeriodNotMet);

    // Calculations
    let apy: u64 = get_apy(stake_entry.period)?;
    let reward: u64 = calculate_reward(stake_entry.amount, apy, days_passed)?;
    let stake_amount = stake_entry.amount;

    // Mark as destaked
    stake_entry.is_destaked = true;

    // Transfers
    transfer_stake(&ctx, stake_amount)?;
    transfer_reward(&ctx, reward)?;

    Ok(())
}

fn transfer_reward(ctx: &Context<Destake>, amount: u64) -> Result<()> {
    transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.token_vault_account.to_account_info(),
                to: ctx.accounts.user_token_account.to_account_info(),
                authority: ctx.accounts.token_vault_account.to_account_info(),
            },
            &[&[VAULT_SEED, &[ctx.bumps.token_vault_account]]]
        ),
        amount
    )
}

fn transfer_stake(ctx: &Context<Destake>, amount: u64) -> Result<()> {
    transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.stake_account.to_account_info(),
                to: ctx.accounts.user_token_account.to_account_info(),
                authority: ctx.accounts.stake_account.to_account_info(),
            },
            &[&[TOKEN_SEED, ctx.accounts.signer.key.as_ref(), &[ctx.bumps.stake_account]]]
        ),
        amount
    )
}
