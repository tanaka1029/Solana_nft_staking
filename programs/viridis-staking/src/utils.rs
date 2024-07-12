use anchor_lang::{ prelude::*, system_program };
use rust_decimal::prelude::*;
use crate::{ constants::APY_DECIMALS, error::ErrorCode };
use crate::constants::NFT_DAYS_APY;
use anchor_spl::token::{ transfer, Transfer };

pub fn get_apy(lock_days: u16) -> Result<u16> {
    for (days, apy) in NFT_DAYS_APY {
        if days == lock_days {
            return Ok(apy);
        }
    }
    Err(ErrorCode::InvalidStakePeriod.into())
}

pub fn calculate_reward(amount: u64, apy: u16, days_passed: u64) -> Option<u64> {
    let d_amount = Decimal::from(amount);
    let d_apy = Decimal::new(apy as i64, APY_DECIMALS as u32);
    let d_days_passed = Decimal::from(days_passed);

    // Calculate daily rate
    let d_365 = Decimal::from(365);
    let daily_rate = d_apy.checked_div(d_365)?;

    let d_100 = Decimal::from(100);
    let daily_multiplier = daily_rate.checked_div(d_100)?;

    // Calculate reward
    let reward = d_amount.checked_mul(daily_multiplier)?.checked_mul(d_days_passed)?;

    let result = reward.to_u64();

    result
}

pub fn calculate_days_passed(start_time: i64, current_time: i64) -> i64 {
    const SECONDS_PER_DAY: i64 = 86400;

    current_time.saturating_sub(start_time).max(0) / SECONDS_PER_DAY
}

pub fn transfer_tokens<'info>(
    from: AccountInfo<'info>,
    to: AccountInfo<'info>,
    authority: AccountInfo<'info>,
    amount: u64,
    token_program: AccountInfo<'info>,
    signer_seeds: Option<&[&[&[u8]]]>
) -> Result<()> {
    let cpi_accounts: Transfer = Transfer {
        from,
        to,
        authority,
    };

    let cpi_context: CpiContext<Transfer> = if let Some(seeds) = signer_seeds {
        CpiContext::new_with_signer(token_program, cpi_accounts, seeds)
    } else {
        CpiContext::new(token_program, cpi_accounts)
    };

    transfer(cpi_context, amount)
}

pub fn resize_account<'info, T: AccountSerialize + AccountDeserialize + Owner + Clone>(
    account: &mut Account<'info, T>,
    payer: &Signer<'info>,
    system_program: &Program<'info, System>,
    additional_space: usize
) -> Result<()> {
    let account_info = account.to_account_info();
    let current_space = account_info.data_len();
    let new_space = current_space
        .checked_add(additional_space)
        .ok_or(ErrorCode::ArithmeticOverflow)?;

    let rent = Rent::get()?;
    let new_minimum_balance = rent.minimum_balance(new_space);
    let lamports_diff = new_minimum_balance.saturating_sub(account_info.lamports());

    if lamports_diff > 0 {
        system_program::transfer(
            CpiContext::new(system_program.to_account_info(), system_program::Transfer {
                from: payer.to_account_info(),
                to: account_info.clone(),
            }),
            lamports_diff
        )?;
    }

    account_info.realloc(new_space, false).map_err(|_| ErrorCode::ReallocError)?;

    Ok(())
}
