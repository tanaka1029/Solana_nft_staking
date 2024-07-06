use anchor_lang::prelude::*;

#[account]
pub struct StakeInfo {
    pub stakes: Vec<StakeEntry>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct StakeEntry {
    pub amount: u64,
    pub stake_period: u8,
    pub start_time: u64,
}
