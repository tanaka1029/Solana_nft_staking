use anchor_lang::prelude::*;
use anchor_spl::{ associated_token::AssociatedToken, token::{ Mint, Token, TokenAccount } };
use crate::utils::{ resize_account, transfer_tokens };
use crate::{ constants::*, utils::get_apy, error::ErrorCode, state::* };

#[derive(Accounts)]
#[instruction(amount: u64, stake_period: u8)]
pub struct Stake<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [STAKE_INFO_SEED, signer.key().as_ref()],
        bump,
    )]
    pub stake_info: Account<'info, StakeInfo>,

    #[account(
        init_if_needed,
        seeds = [TOKEN_SEED, signer.key().as_ref()],
        bump,
        payer = signer,
        token::mint = mint,
        token::authority = stake_account
    )]
    pub stake_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = signer
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    pub mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn stake(ctx: Context<Stake>, amount: u64, stake_period: u8) -> Result<()> {
    require!(amount > 0, ErrorCode::NoTokens);
    get_apy(stake_period)?;

    let stake_info = &mut ctx.accounts.stake_info;
    let start_time = Clock::get()?.unix_timestamp as u64;
    let new_stake = StakeEntry::new(amount, stake_period, start_time);

    resize_account(
        stake_info,
        &ctx.accounts.signer,
        &ctx.accounts.system_program,
        StakeEntry::len()
    )?;
    stake_info.stakes.push(new_stake);

    transfer_tokens(
        ctx.accounts.user_token_account.to_account_info(),
        ctx.accounts.stake_account.to_account_info(),
        ctx.accounts.signer.to_account_info(),
        amount,
        ctx.accounts.token_program.to_account_info(),
        None
    )?;

    Ok(())
}
