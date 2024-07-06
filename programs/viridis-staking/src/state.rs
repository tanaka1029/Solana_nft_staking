use anchor_lang::prelude::*;

#[account]
pub struct StakeInfo {
    pub start_time: i64,
    pub period: u8,
    pub is_staked: bool,
}

impl StakeInfo {
    pub fn update_stake_info(&mut self, start_time: i64, period: u8) {
        self.start_time = start_time;
        self.period = period;
        self.is_staked = true;
    }

    pub fn reset_stake_info(&mut self) {
        self.start_time = 0;
        self.period = 0;
        self.is_staked = false;
    }

    pub fn calculate_days_passed(&self, current_time: i64) -> u64 {
        ((current_time - self.start_time) / 86400) as u64
    }
}
