use anchor_lang::prelude::*;
use crate::state::*;
use crate::constants::CONFIG_SEED;

#[derive(Clone, AnchorDeserialize, AnchorSerialize)]
pub struct UpdateConfigArgs {
    pub admin: Option<Pubkey>,
    pub base_lock_days: Option<u16>,
    pub base_apy: Option<u16>,
}

#[derive(Accounts)]
#[instruction(args: UpdateConfigArgs)]
pub struct UpdateConfig<'info> {
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump,
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        address = config.admin
    )]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn update_config(ctx: Context<UpdateConfig>, args: UpdateConfigArgs) -> Result<()> {
    let config = &mut ctx.accounts.config;

    if let Some(admin) = args.admin {
        config.admin = admin;
    }

    if let Some(base_lock_days) = args.base_lock_days {
        config.base_lock_days = base_lock_days;
    }

    if let Some(base_apy) = args.base_apy {
        config.base_apy = base_apy;
    }

    Ok(())
}
