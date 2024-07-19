use anchor_spl::token::{ Token, TokenAccount, Mint };
use anchor_spl::associated_token::AssociatedToken;
use anchor_lang::prelude::*;

use crate::state::*;
use crate::utils::*;
use crate::constants::*;
use crate::error::ErrorCode;

#[derive(Accounts)]
#[instruction(stake_index: u64)]
pub struct Destake<'info> {
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

    #[account(
        mut,
        seeds = [TOKEN_SEED, signer.key.as_ref()],
        bump,
    )]
    pub stake_account: Account<'info, TokenAccount>,

    #[account(mut, associated_token::mint = mint, associated_token::authority = signer)]
    pub user_token: Account<'info, TokenAccount>,

    pub mint: Account<'info, Mint>,

    #[account(seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn destake(ctx: Context<Destake>, stake_index: u64) -> Result<()> {
    let Destake { config, token_program, stake_info, token_vault, user_token, stake_account, .. } =
        ctx.accounts;

    require!((stake_index as usize) < stake_info.stakes.len(), ErrorCode::InvalidStakeIndex);

    let stake_entry = &mut stake_info.stakes[stake_index as usize];
    require!(stake_entry.destake_time.is_none(), ErrorCode::AlreadyDestaked);

    let current_time = Clock::get()?.unix_timestamp;
    stake_entry.destake_time = Some(current_time);

    let base_days_passed = calculate_days_passed(stake_entry.start_time, current_time);
    require!(
        base_days_passed >= (stake_entry.stake_lock_days as i64),
        ErrorCode::BaseLockPeriodNotEnded
    );

    if
        let (Some(nft_lock_time), Some(nft_lock_days)) = (
            stake_entry.nft_lock_time,
            stake_entry.nft_lock_days,
        )
    {
        let nft_days_passed = calculate_days_passed(nft_lock_time, current_time);
        require!(nft_days_passed >= (nft_lock_days as i64), ErrorCode::NftLockPeriodNotEnded);
    }

    let claimable_reward = calculate_claimable_reward(
        stake_entry,
        config.max_nft_reward_lamports,
        current_time
    )?;

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

    if stake_entry.restake_time.is_none() {
        transfer_tokens(
            stake_account.to_account_info(),
            user_token.to_account_info(),
            stake_account.to_account_info(),
            stake_entry.amount,
            token_program.to_account_info(),
            Some(&[&[TOKEN_SEED, ctx.accounts.signer.key.as_ref(), &[ctx.bumps.stake_account]]])
        )?;
    }

    Ok(())
}
