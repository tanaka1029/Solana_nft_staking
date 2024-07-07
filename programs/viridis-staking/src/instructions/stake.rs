use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{ Mint, Token, TokenAccount, Transfer, transfer },
};
use crate::{ constants::*, utils::get_apy, error::ErrorCode, state::* };

#[derive(Accounts)]
pub struct Stake<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [STAKE_INFO_SEED, signer.key.as_ref()],
        bump,
    )]
    pub stake_info: Account<'info, StakeInfo>,

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
    require!(amount > 0, ErrorCode::NoTokens);
    get_apy(stake_period)?;

    let stake_info = &mut ctx.accounts.stake_info;

    // Calculate new account size needed
    let new_size = 8 + 4 + (stake_info.stakes.len() + 1) * StakeEntry::LEN;

    // If reallocation is needed
    if new_size > stake_info.to_account_info().data_len() {
        // Calculate required rent for the new size
        let rent = Rent::get()?;
        let new_minimum_balance = rent.minimum_balance(new_size);
        let lamports_diff = new_minimum_balance.saturating_sub(
            stake_info.to_account_info().lamports()
        );

        if lamports_diff > 0 {
            let cpi_context = CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.signer.to_account_info(),
                    to: stake_info.to_account_info(),
                }
            );
            system_program::transfer(cpi_context, lamports_diff)?;
        }

        // Perform reallocation
        stake_info.to_account_info().realloc(new_size, false)?;
    }

    let clock = Clock::get()?;
    let current_time = clock.unix_timestamp as u64;

    let stake_entry = StakeEntry {
        amount,
        period: stake_period,
        start_time: current_time,
        is_destaked: false,
    };

    ctx.accounts.stake_info.stakes.push(stake_entry);

    let cpi_accounts = Transfer {
        from: ctx.accounts.user_token_account.to_account_info(),
        to: ctx.accounts.stake_account.to_account_info(),
        authority: ctx.accounts.signer.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

    transfer(cpi_ctx, amount)?;

    Ok(())
}
