# Solana Program Local Testing

1. Start the local Solana validator with the Metaplex Token Metadata program:

   ```bash
   solana-test-validator -r \
     --bpf-program metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s dumps/metadata.so
   ```

This command starts a local Solana validator, resets it (-r flag), and loads the Metaplex Token Metadata program.

2. Airdrop some SOL to your wallet:

   ```bash
   solana airdrop 5 H6B8Qo82EW2jK7HDgEj5EUwv5gq8TSMbGLkXfFmQhmJg
   ```

   Replace `H6B8Qo82EW2jK7HDgEj5EUwv5gq8TSMbGLkXfFmQhmJg` with your wallet address if different.

3. Run Anchor tests:

   ```bash
   anchor test --skip-local-validator
   ```

   This command runs your Anchor tests without starting a new local validator (since we've already started one in step 1).

## Notes

- Ensure that your `Anchor.toml` file and program ID in your Rust code (`lib.rs`) match the deployed program ID.
- If you encounter any "Program ID mismatch" errors, double-check that your program is correctly deployed to the local validator.
- The `dumps/metadata.so` file should contain the compiled Metaplex Token Metadata program. Ensure this file exists in the specified path.
