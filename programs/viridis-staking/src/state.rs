use anchor_lang::prelude::*;

#[account]
pub struct Config {
    pub admin: Pubkey,
    pub nft_collection: Pubkey,
    pub max_nft_reward_lamports: u64,
    pub max_nft_apy_duration_days: u16,
    pub base_lock_days: u16,
    pub base_apy: u16,
}

impl Config {
    pub fn len() -> usize {
        8 + 32 + 32 + 8 + 2 + 2 + 2
    }
}

#[account]
pub struct StakeInfo {
    pub stakes: Vec<StakeEntry>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct StakeEntry {
    pub amount: u64,
    pub start_time: i64,
    pub stake_lock_days: u16,
    pub base_apy: u16,
    pub nft: Option<Pubkey>,
    pub nft_lock_time: Option<i64>,
    pub nft_lock_days: Option<u16>,
    pub nft_apy: Option<u16>,
    pub nft_unlock_time: Option<i64>,
    pub destake_time: Option<i64>,
    pub restake_time: Option<i64>,
    pub parent_stake_index: Option<u64>,
    pub paid_amount: u64,
    pub max_nft_reward_lamports: u64,
    pub max_nft_apy_duration_days: u16,
}

impl StakeEntry {
    pub fn new(
        amount: u64,
        start_time: i64,
        stake_lock_days: u16,
        base_apy: u16,
        max_nft_reward_lamports: u64,
        max_nft_apy_duration_days: u16
    ) -> Self {
        Self {
            amount,
            start_time,
            stake_lock_days,
            base_apy,
            nft: None,
            nft_lock_time: None,
            nft_lock_days: None,
            nft_apy: None,
            nft_unlock_time: None,
            destake_time: None,
            restake_time: None,
            parent_stake_index: None,
            paid_amount: 0,
            max_nft_reward_lamports,
            max_nft_apy_duration_days,
        }
    }

    pub fn add_nft_info(&mut self, nft: Pubkey, lock_time: i64, lock_days: u16, apy: u16) {
        self.nft = Some(nft);
        self.nft_lock_time = Some(lock_time);
        self.nft_lock_days = Some(lock_days);
        self.nft_apy = Some(apy);
    }

    pub fn add_payment(&mut self, payment: u64) {
        self.paid_amount = self.paid_amount.saturating_add(payment);
    }

    pub fn is_nft_locked(&self) -> bool {
        self.nft.is_some() && self.nft_lock_time.is_some() && self.nft_unlock_time.is_none()
    }
}

#[account]
pub struct NftInfo {
    pub days_locked: u16,
}

impl NftInfo {
    pub fn add_days(&mut self, days_to_add: u16) {
        self.days_locked = self.days_locked.saturating_add(days_to_add);
    }

    pub fn can_lock(&self, additional_days: u16, max_days: u16) -> bool {
        let total_lock_days = self.days_locked.saturating_add(additional_days);

        total_lock_days <= max_days
    }
}
