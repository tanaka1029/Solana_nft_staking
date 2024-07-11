pub const CONFIG_SEED: &[u8] = b"config";
pub const VAULT_SEED: &[u8] = b"vault";
pub const STAKE_INFO_SEED: &[u8] = b"stake_info";
pub const TOKEN_SEED: &[u8] = b"token";
pub const NFT_SEED: &[u8] = b"nft";

pub const METADATA_SEED: &[u8] = b"metadata";

pub const NFT_DAYS_APY: [(u16, u16); 3] = [
    (30, 2950),
    (60, 5950),
    (90, 10450),
];

pub const DEFAULT_STAKE_LOCK_DAYS: u16 = 14;
pub const DEFAULT_BASE_APY: u16 = 550;
pub const APY_DECIMALS: u8 = 2;
