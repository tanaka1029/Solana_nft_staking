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

pub fn destake(ctx: Context<Destake>) -> Result<()> {
    let stake_info = &ctx.accounts.stake_info_account;
    let stake_period = stake_info.period;
    let stake_amount = ctx.accounts.stake_account.amount;
    let is_staked = stake_info.is_staked;

    // Perform checks and calculations
    require!(is_staked, ErrorCode::NotStaked);

    let clock = Clock::get()?;
    let days_passed = stake_info.calculate_days_passed(clock.unix_timestamp);

    require!(days_passed >= u64::from(stake_period), ErrorCode::StakePeriodNotMet);

    let apy = get_apy(stake_period)?;
    let reward = calculate_reward(stake_amount, apy, days_passed)?;

    // Perform transfers
    transfer_reward(&ctx, reward)?;
    transfer_stake(&ctx, stake_amount)?;

    // Perform mutable operations last
    let stake_info = &mut ctx.accounts.stake_info_account;
    stake_info.reset_stake_info();

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
