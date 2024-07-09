use anchor_lang::{ prelude::*, system_program };
use crate::error::ErrorCode;
use crate::constants::NFT_DAYS_APY;
use anchor_spl::token::{ transfer, Transfer };

pub fn get_apy(lock_days: u16) -> Result<u16> {
    NFT_DAYS_APY.iter()
        .find(|&&(days, _)| days == lock_days)
        .map(|&(_, apy)| apy)
        .ok_or_else(|| ErrorCode::InvalidStakePeriod.into())
}

pub fn calculate_reward(stake_amount: u64, apy: u16, days_passed: u64) -> Result<u64> {
    stake_amount
        .checked_mul(apy as u64)
        .and_then(|v| v.checked_div(100))
        .and_then(|v| v.checked_mul(days_passed))
        .and_then(|v| v.checked_div(365))
        .ok_or(ErrorCode::CalculationError.into())
}

pub fn calculate_days_passed(start_time: i64, current_time: i64) -> i64 {
    current_time.saturating_sub(start_time) / 86400 // 86400 seconds in a day
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
