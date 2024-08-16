use crate::state::NftApy;

pub const CONFIG_SEED: &[u8] = b"config";
pub const VAULT_SEED: &[u8] = b"vault";
pub const STAKE_INFO_SEED: &[u8] = b"stake_info";
pub const TOKEN_SEED: &[u8] = b"token";
pub const NFT_SEED: &[u8] = b"nft";
pub const NFT_INFO_SEED: &[u8] = b"nft_info";

pub const METADATA_SEED: &[u8] = b"metadata";

pub const DEFAULT_NFT_DAYS_APY: [NftApy; 3] = [
    NftApy { days: 30, apy: 2950 },
    NftApy { days: 60, apy: 5950 },
    NftApy { days: 90, apy: 10450 },
];

pub const STAKE_LOCK_DAYS: u16 = 14;
pub const BASE_APY: u16 = 550;
pub const MAX_NFT_REWARD: u64 = 750_000;
pub const MAX_NFT_APY_DURATION_DAYS: u16 = 90;
pub const APY_DECIMALS: u8 = 2;
