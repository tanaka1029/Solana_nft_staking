use anchor_lang::prelude::*;
use anchor_spl::token::{ Mint, Token, TokenAccount };
use crate::utils::{ calculate_claimable_reward, resize_account, transfer_tokens };
use crate::{ constants::*, error::ErrorCode, state::* };

#[derive(Accounts)]
#[instruction(amount: u64)]
pub struct Restake<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump,
    )]
    pub config: Account<'info, Config>,

    #[account(mut, seeds = [VAULT_SEED], bump)]
    pub token_vault: Account<'info, TokenAccount>,

    #[account(mut, associated_token::mint = mint, associated_token::authority = signer)]
    pub user_token: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [STAKE_INFO_SEED, signer.key().as_ref()],
        bump,
    )]
    pub stake_info: Account<'info, StakeInfo>,

    pub mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn restake(ctx: Context<Restake>, stake_index: u64) -> Result<()> {
    let Restake { config, stake_info, token_vault, token_program, user_token, .. } = ctx.accounts;

    require!((stake_index as usize) < stake_info.stakes.len(), ErrorCode::InvalidStakeIndex);
    let stake_entry = &mut stake_info.stakes[stake_index as usize];
    require!(stake_entry.destake_time.is_none(), ErrorCode::AlreadyDestaked);
    require!(stake_entry.parent_stake_index.is_none(), ErrorCode::AlreadyRestaked);

    let current_time = Clock::get()?.unix_timestamp;

    stake_entry.restake_time = Some(current_time);
    stake_entry.destake_time = Some(current_time);
    stake_entry.nft_unlock_time = Some(current_time);

    let new_stake = &mut StakeEntry::new(
        stake_entry.amount,
        current_time,
        config.base_lock_days,
        stake_entry.base_apy,
        stake_entry.max_nft_reward_lamports,
        stake_entry.max_nft_apy_duration_days,
        Some(stake_index)
    );

    if
        let (Some(nft_lock_days), Some(nft), Some(nft_apy)) = (
            stake_entry.nft_lock_days,
            stake_entry.nft,
            stake_entry.nft_apy,
        )
    {
        new_stake.add_nft_info(nft, current_time, nft_lock_days, nft_apy);
    }

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

    resize_account(
        stake_info,
        &ctx.accounts.signer,
        &ctx.accounts.system_program,
        std::mem::size_of::<StakeEntry>()
    )?;
    stake_info.stakes.push(new_stake.clone());

    Ok(())
}
