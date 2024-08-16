use anchor_lang::prelude::*;
use anchor_spl::{ metadata::{ Metadata, MetadataAccount }, token::{ Mint, Token, TokenAccount } };
use crate::utils::{ get_apy, transfer_tokens };
use crate::{ constants::*, error::ErrorCode, state::* };

#[derive(Accounts)]
#[instruction(stake_index: u64)]
pub struct LockNft<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump)]
    pub config: Box<Account<'info, Config>>,

    #[account(
        mut,
        seeds = [STAKE_INFO_SEED, signer.key().as_ref()],
        bump,
    )]
    pub stake_info: Box<Account<'info, StakeInfo>>,

    #[account(
        init_if_needed,
        payer = signer,
        space = 8 + 2,
        seeds = [NFT_INFO_SEED, mint.key().as_ref()],
        bump
    )]
    pub nft_info: Box<Account<'info, NftInfo>>,

    #[account(
        init_if_needed,
        seeds = [NFT_SEED, mint.key().as_ref()],
        bump,
        payer = signer,
        token::mint = mint,
        token::authority = nft_lock_account
    )]
    pub nft_lock_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = signer,
    )]
    pub user_nft_account: Box<Account<'info, TokenAccount>>,

    #[account(
        seeds = [METADATA_SEED, token_metadata_program.key().as_ref(), mint.key().as_ref()],
        seeds::program = token_metadata_program.key(),
        bump
    )]
    pub metadata: Box<Account<'info, MetadataAccount>>,

    pub mint: Box<Account<'info, Mint>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub token_metadata_program: Program<'info, Metadata>,
}

pub fn lock_nft(ctx: Context<LockNft>, stake_index: u64, lock_days: u16) -> Result<()> {
    let LockNft {
        config,
        metadata,
        user_nft_account,
        nft_lock_account,
        nft_info,
        stake_info,
        token_program,
        signer,
        mint,
        ..
    } = ctx.accounts;

    require!((stake_index as usize) < stake_info.stakes.len(), ErrorCode::InvalidStakeIndex);
    require!(
        metadata.collection.is_some() &&
            metadata.collection.as_ref().unwrap().key == config.nft_collection,
        ErrorCode::InvalidCollection
    );

    let stake_entry = &mut stake_info.stakes[stake_index as usize];

    require!(stake_entry.nft.is_none(), ErrorCode::NftAlreadyLocked);

    let apy = get_apy(lock_days, config.nft_days_apy)?;

    require!(
        nft_info.can_lock(lock_days, stake_entry.max_nft_apy_duration_days),
        ErrorCode::ExceedsMaxLockDuration
    );

    let lock_time = Clock::get()?.unix_timestamp;

    stake_entry.add_nft_info(mint.key(), lock_time, lock_days, apy);

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
