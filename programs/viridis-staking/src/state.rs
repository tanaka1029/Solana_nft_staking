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
    pub fn new(amount: u64, period: u8, start_time: u64) -> Self {
        Self {
            amount,
            period,
            start_time,
            is_destaked: false,
        }
    }

    pub fn len() -> usize {
        std::mem::size_of::<Self>()
    }
}
