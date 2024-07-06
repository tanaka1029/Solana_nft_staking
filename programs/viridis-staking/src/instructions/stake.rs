use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{ Mint, Token, TokenAccount, Transfer, transfer },
};
use crate::{ constants::*, utils::get_apy, error::ErrorCode, state::StakeInfo };

#[derive(Accounts)]
pub struct Stake<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        init_if_needed,
        seeds = [STAKE_INFO_SEED, signer.key.as_ref()],
        bump,
        payer = signer,
        space = 8 + std::mem::size_of::<StakeInfo>()
    )]
    pub stake_info_account: Account<'info, StakeInfo>,

    #[account(
        init_if_needed,
        seeds = [TOKEN_SEED, signer.key.as_ref()],
        bump,
        payer = signer,
        token::mint = mint,
        token::authority = stake_account
    )]
    pub stake_account: Account<'info, TokenAccount>,

    #[account(mut, associated_token::mint = mint, associated_token::authority = signer)]
    pub user_token_account: Account<'info, TokenAccount>,

    pub mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn stake(ctx: Context<Stake>, amount: u64, stake_period: u8) -> Result<()> {
    let stake_info = &mut ctx.accounts.stake_info_account;

    require!(!stake_info.is_staked, ErrorCode::IsStaked);
    require!(amount > 0, ErrorCode::NoTokens);
    get_apy(stake_period)?;

    stake_info.update_stake_info(Clock::get()?.unix_timestamp, stake_period);

    let stake_amount = amount
        .checked_mul((10u64).pow(ctx.accounts.mint.decimals as u32))
        .ok_or(ErrorCode::CalculationError)?;

    transfer(
        CpiContext::new(ctx.accounts.token_program.to_account_info(), Transfer {
            from: ctx.accounts.user_token_account.to_account_info(),
            to: ctx.accounts.stake_account.to_account_info(),
            authority: ctx.accounts.signer.to_account_info(),
        }),
        stake_amount
    )
}
