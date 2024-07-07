use anchor_lang::prelude::*;
use anchor_spl::{ associated_token::AssociatedToken, token::{ Mint, Token, TokenAccount } };
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
    let stake_info = &mut ctx.accounts.stake_info_account;
    let clock = Clock::get()?;
    let current_time = clock.unix_timestamp as u64;

    require!(!stake_info.stakes.is_empty(), ErrorCode::NoStakes);
    require!((stake_index as usize) < stake_info.stakes.len(), ErrorCode::InvalidStakeIndex);

    let stake_entry = &mut stake_info.stakes[stake_index as usize];
    require!(!stake_entry.is_destaked, ErrorCode::AlreadyDestaked);

    let days_passed = calculate_days_passed(stake_entry.start_time, current_time);
    require!(days_passed >= u64::from(stake_entry.period), ErrorCode::StakePeriodNotMet);

    let apy: u64 = get_apy(stake_entry.period)?;
    let reward: u64 = calculate_reward(stake_entry.amount, apy, days_passed)?;
    let stake_amount = stake_entry.amount;

    stake_entry.is_destaked = true;

    transfer_stake(&ctx, stake_amount)?;
    transfer_reward(&ctx, reward)?;

    Ok(())
}

fn transfer_reward(ctx: &Context<Destake>, amount: u64) -> Result<()> {
    transfer_tokens(
        ctx.accounts.token_vault_account.to_account_info(),
        ctx.accounts.user_token_account.to_account_info(),
        ctx.accounts.token_vault_account.to_account_info(),
        amount,
        ctx.accounts.token_program.to_account_info(),
        Some(&[&[VAULT_SEED, &[ctx.bumps.token_vault_account]]])
    )?;

    Ok(())
}

fn transfer_stake<'info>(ctx: &Context<Destake>, amount: u64) -> Result<()> {
    transfer_tokens(
        ctx.accounts.stake_account.to_account_info(),
        ctx.accounts.user_token_account.to_account_info(),
        ctx.accounts.stake_account.to_account_info(),
        amount,
        ctx.accounts.token_program.to_account_info(),
        Some(&[&[TOKEN_SEED, ctx.accounts.signer.key.as_ref(), &[ctx.bumps.stake_account]]])
    )
}
