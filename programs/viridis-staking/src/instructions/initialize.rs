use anchor_lang::prelude::*;
use anchor_spl::metadata::Metadata;
use anchor_spl::token::{ Mint, Token, TokenAccount };
use crate::constants::*;
use crate::state::Config;

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
    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.signer.key();
    config.nft_collection = ctx.accounts.nft_collection.key();

    Ok(())
}
