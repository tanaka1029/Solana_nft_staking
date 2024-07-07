use anchor_lang::prelude::*;

#[account]
pub struct Config {
    pub admin: Pubkey,
    pub nft_collection: Pubkey,
}

impl Config {
    pub fn len() -> usize {
        8 + 32 + 32
    }
}

#[account]
pub struct StakeInfo {
    pub stakes: Vec<StakeEntry>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct StakeEntry {
    pub amount: u64,
    pub period: u8,
    pub start_time: u64,
    pub is_destaked: bool,
    pub nft_lock_time: Option<i64>,
}

impl StakeEntry {
    pub fn new(amount: u64, period: u8, start_time: u64) -> Self {
        Self {
            amount,
            period,
            start_time,
            is_destaked: false,
            nft_lock_time: None,
        }
    }
}
