pub const METADATA_SEED: &[u8] = b"metadata";
pub const CONFIG_SEED: &[u8] = b"config";
pub const VAULT_SEED: &[u8] = b"vault";
pub const STAKE_INFO_SEED: &[u8] = b"stake_info";
pub const TOKEN_SEED: &[u8] = b"token";
pub const NFT_SEED: &[u8] = b"nft";

pub const STAKING_DAYS_APY: [(u8, u64); 3] = [
    (30, 110),
    (60, 140),
    (90, 200),
];
