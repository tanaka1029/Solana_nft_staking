use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    metadata::{ Metadata, MetadataAccount },
    token::{ Mint, Token, TokenAccount },
};
use crate::utils::transfer_tokens;
use crate::{ constants::*, error::ErrorCode, state::* };

#[derive(Accounts)]
#[instruction(stake_index: u64)]
pub struct LockNft<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [STAKE_INFO_SEED, signer.key().as_ref()],
        bump,
    )]
    pub stake_info: Account<'info, StakeInfo>,

    #[account(
        init_if_needed,
        seeds = [NFT_SEED, signer.key().as_ref(), &stake_index.to_le_bytes()],
        bump,
        payer = signer,
        token::mint = mint,
        token::authority = nft_lock_account
    )]
    pub nft_lock_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = signer,
    )]
    pub user_nft_account: Account<'info, TokenAccount>,

    #[account(
        seeds = [METADATA_SEED, token_metadata_program.key().as_ref(), mint.key().as_ref()],
        seeds::program = token_metadata_program.key(),
        bump
    )]
    pub metadata: Account<'info, MetadataAccount>,

    pub mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub token_metadata_program: Program<'info, Metadata>,
}

pub fn lock_nft(ctx: Context<LockNft>, stake_index: u64) -> Result<()> {
    let LockNft {
        config,
        metadata,
        user_nft_account,
        nft_lock_account,
        token_program,
        signer,
        ..
    } = ctx.accounts;
    let stake_info = &mut ctx.accounts.stake_info;
    let nft_collection = config.nft_collection;

    require!((stake_index as usize) < stake_info.stakes.len(), ErrorCode::InvalidStakeIndex);
    require!(
        metadata.collection.is_some() &&
            metadata.collection.as_ref().unwrap().key == nft_collection,
        ErrorCode::InvalidCollection
    );

    let stake_entry = &mut stake_info.stakes[stake_index as usize];

    require!(stake_entry.nft_lock_time.is_none(), ErrorCode::NftAlreadyLocked);

    let clock = Clock::get()?;

    stake_entry.nft_lock_time = Some(clock.unix_timestamp);

    transfer_tokens(
        user_nft_account.to_account_info(),
        nft_lock_account.to_account_info(),
        signer.to_account_info(),
        1,
        token_program.to_account_info(),
        None
    )?;

    Ok(())
}
