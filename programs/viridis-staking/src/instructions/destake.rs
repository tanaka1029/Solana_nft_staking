use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{ Token, TokenAccount, Mint };

use crate::constants::*;
use crate::state::*;
use crate::error::ErrorCode;
use crate::utils::{ calculate_days_passed, calculate_reward, transfer_tokens };

#[derive(Accounts)]
#[instruction(stake_index: u64)]
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

pub fn destake(ctx: Context<Destake>, stake_index: u64) -> Result<()> {
    let stake_info = &mut ctx.accounts.stake_info_account;
    require!((stake_index as usize) < stake_info.stakes.len(), ErrorCode::InvalidStakeIndex);

    let stake_entry = &mut stake_info.stakes[stake_index as usize];
    require!(!stake_entry.is_destaked, ErrorCode::AlreadyDestaked);

    let current_time = Clock::get()?.unix_timestamp;

    let base_days_passed = calculate_days_passed(stake_entry.start_time, current_time);
    require!(
        base_days_passed >= (stake_entry.stake_lock_days as i64),
        ErrorCode::BaseLockPeriodNotEnded
    );

    let base_reward = calculate_reward(
        stake_entry.amount,
        stake_entry.base_apy,
        base_days_passed as u64
    ).ok_or(ErrorCode::RewardCalculationFailed)?;

    let mut total_reward = base_reward;
    msg!("paid amount {}", base_reward);

    if
        let (Some(nft_lock_time), Some(nft_lock_days), Some(nft_apy)) = (
            stake_entry.nft_lock_time,
            stake_entry.nft_lock_days,
            stake_entry.nft_apy,
        )
    {
        let nft_days_passed = calculate_days_passed(nft_lock_time, current_time);
        require!(nft_days_passed >= (nft_lock_days as i64), ErrorCode::NftLockPeriodNotEnded);
        let nft_reward = calculate_reward(
            stake_entry.amount,
            nft_apy,
            nft_days_passed as u64
        ).ok_or(ErrorCode::RewardCalculationFailed)?;
        total_reward += nft_reward;
        msg!("paid amount {}", nft_reward);
    }

    let claimable_reward = total_reward.saturating_sub(stake_entry.paid_amount);
    stake_entry.is_destaked = true;

    msg!("paid amount {}", stake_entry.paid_amount);

    transfer_tokens(
        ctx.accounts.stake_account.to_account_info(),
        ctx.accounts.user_token_account.to_account_info(),
        ctx.accounts.stake_account.to_account_info(),
        stake_entry.amount,
        ctx.accounts.token_program.to_account_info(),
        Some(&[&[TOKEN_SEED, ctx.accounts.signer.key.as_ref(), &[ctx.bumps.stake_account]]])
    )?;

    if claimable_reward > 0 {
        stake_entry.add_payment(claimable_reward);

        msg!("paid amount {}", stake_entry.paid_amount);

        transfer_tokens(
            ctx.accounts.token_vault_account.to_account_info(),
            ctx.accounts.user_token_account.to_account_info(),
            ctx.accounts.token_vault_account.to_account_info(),
            claimable_reward,
            ctx.accounts.token_program.to_account_info(),
            Some(&[&[VAULT_SEED, &[ctx.bumps.token_vault_account]]])
        )?;
    }
    Ok(())
}
