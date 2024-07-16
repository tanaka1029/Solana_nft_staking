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
pub struct UnlockNft<'info> {
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
        mut,
        seeds = [NFT_SEED, signer.key().as_ref(), &stake_index.to_le_bytes()],
        bump,
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

pub fn unlock_nft(ctx: Context<UnlockNft>, stake_index: u64) -> Result<()> {
    let UnlockNft {
        config,
        metadata,
        user_nft_account,
        nft_lock_account,
        token_program,
        mint,
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

    require!(stake_entry.is_destaked, ErrorCode::StakeNotDestaked);

    require!(stake_entry.is_nft_locked(), ErrorCode::NoNftLocked);

    require!(nft_lock_account.mint == mint.key(), ErrorCode::InvalidNftMint);

    let clock = Clock::get()?;
    stake_entry.nft_unlock_time = Some(clock.unix_timestamp);

    transfer_tokens(
        nft_lock_account.to_account_info(),
        user_nft_account.to_account_info(),
        nft_lock_account.to_account_info(),
        1,
        token_program.to_account_info(),
        Some(
            &[
                &[
                    NFT_SEED,
                    ctx.accounts.signer.key.as_ref(),
                    &stake_index.to_le_bytes(),
                    &[ctx.bumps.nft_lock_account],
                ],
            ]
        )
    )?;

    Ok(())
}
