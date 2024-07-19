use anchor_lang::prelude::*;
use anchor_spl::metadata::Metadata;
use anchor_spl::token::{ Mint, Token, TokenAccount };
use crate::constants::*;
use crate::state::Config;
use crate::utils::to_lamports;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(init, seeds = [CONFIG_SEED], bump, payer = signer, space = Config::len())]
    pub config: Account<'info, Config>,

    #[account(
        init,
        seeds = [VAULT_SEED],
        bump,
        payer = signer,
        token::mint = mint,
        token::authority = token_vault_account
    )]
    pub token_vault_account: Account<'info, TokenAccount>,

    pub mint: Account<'info, Mint>,
    /// CHECK: NFT collection used to verify NFTs
    pub nft_collection: AccountInfo<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub token_metadata_program: Program<'info, Metadata>,
}

pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
    let Initialize { config, signer, nft_collection, mint, .. } = ctx.accounts;

    config.admin = signer.key();
    config.nft_collection = nft_collection.key();
    config.max_nft_reward_lamports = to_lamports(MAX_NFT_REWARD, mint.decimals)?;
    config.max_nft_apy_duration_days = MAX_NFT_APY_DURATION_DAYS;
    config.base_lock_days = STAKE_LOCK_DAYS;
    config.base_apy = BASE_APY;

    Ok(())
}
