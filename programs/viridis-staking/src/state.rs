use anchor_lang::prelude::*;

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
}

impl StakeEntry {
    pub const LEN: usize = 8 + 1 + 8 + 1;
}
