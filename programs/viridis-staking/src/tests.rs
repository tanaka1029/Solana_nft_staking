#[cfg(test)]
mod tests {
    use crate::utils::*;
    use chrono::NaiveDateTime;

    #[test]
    fn test_calculate_reward() {
        let amount = 1000000000000000000;
        let apy = 11000;
        let days = 1;
        println!("\nTest case 0:");
        let result = calculate_reward(amount, apy, days);
        assert_eq!(result, Some(3013698630136986));

        // Test case 1: 1000 tokens, 10% APY, 365 days
        let amount = 1000;
        let apy = 1000; // 10.00% with 2 decimals
        let days = 365;
        println!("\nTest case 1:");
        let result = calculate_reward(amount, apy, days);
        assert_eq!(result, Some(100));

        // Test case 2: 10000 tokens, 5% APY, 30 days
        let amount = 10000;
        let apy = 500; // 5.00% with 2 decimals
        let days = 30;
        println!("\nTest case 2:");
        let result = calculate_reward(amount, apy, days);
        assert_eq!(result, Some(41));

        // Test case 3: 1000000 tokens, 1% APY, 1 day
        let amount = 1000000;
        let apy = 100; // 1.00% with 2 decimals
        let days = 1;
        println!("\nTest case 3:");
        let result = calculate_reward(amount, apy, days);
        assert_eq!(result, Some(27));

        // Test case 4: Very small amount, high APY, short period
        let amount = 1;
        let apy = 10000; // 100.00% APY
        let days = 1;
        println!("\nTest case 4:");
        let result = calculate_reward(amount, apy, days);
        assert_eq!(result, Some(0)); // Expect 0 due to rounding down

        // Test case 5: Large amount, very low APY, long period
        let amount = 1_000_000_000;
        let apy = 1; // 0.01% APY
        let days = 3650;
        println!("\nTest case 5:");
        let result = calculate_reward(amount, apy, days);
        assert_eq!(result, Some(1_000_000));

        // Test case 6: Realistic staking scenario
        let amount = 100_000;
        let apy = 750; // 7.50% APY
        let days = 90;
        println!("\nTest case 6:");
        let result = calculate_reward(amount, apy, days);
        assert_eq!(result, Some(1849));

        // Test case 7: Large amount, high APY (150%), 2 years
        let amount = 1_000_000_000; // 1 billion tokens
        let apy = 15000; // 150.00% APY
        let days = 730; // 2 years
        println!("\nTest case 7:");
        let result = calculate_reward(amount, apy, days);
        assert_eq!(result, Some(2_999_999_999)); // 3 billion (300% of original amount)

        // Test case 8: Medium amount, very high APY (200%), 1.5 years
        let amount = 10_000_000; // 10 million tokens
        let apy = 20000; // 200.00% APY
        let days = 547; // ~1.5 years
        println!("\nTest case 8:");
        let result = calculate_reward(amount, apy, days);
        assert_eq!(result, Some(29_972_602)); // 30 million (300% of original amount)

        // Test case 9: Larger amount, moderate APY (25%), 3 years
        let amount = 500_000_000; // 500 million tokens
        let apy = 2500; // 25.00% APY
        let days = 1095; // 3 years
        println!("\nTest case 9:");
        let result = calculate_reward(amount, apy, days);
        assert_eq!(result, Some(375_000_000)); // 375 million (75% of original amount)

        // Test case 10: Very large amount, low APY (3%), 5 years
        let amount = 10_000_000_000; // 10 billion tokens
        let apy = 300; // 3.00% APY
        let days = 1825; // 5 years
        println!("\nTest case 10:");
        let result = calculate_reward(amount, apy, days);
        assert_eq!(result, Some(1_500_000_000)); // 1.5 billion (15% of original amount)

        // Test case 11: Edge case - maximum safe amount, maximum APY, maximum safe period
        let amount = u64::MAX / 200; // To avoid overflow
        let apy = 20000; // 200.00% APY (maximum in our scale)
        let days = 365 * 100; // 100 years
        println!("\nTest case 11:");
        let result = calculate_reward(amount, apy, days);
        assert!(result.is_some()); // Just checking it doesn't overflow

        // Test case 12: Realistic long-term staking - moderate amount, 20% APY, 10 years
        let amount = 100_000_000; // 100 million tokens
        let apy = 2000; // 20.00% APY
        let days = 3650; // 10 years
        println!("\nTest case 12:");
        let result = calculate_reward(amount, apy, days);
        assert_eq!(result, Some(199_999_999)); // 200 million (200% of original amount)

        // Test case 13: Large amount, very high APY (200%), 1.5 years
        let amount = 1_000_000_000_000_000_000;
        let apy = 20000; // 200.00% APY
        let days = 547; // ~1.5 years
        println!("\nTest case 8:");
        let result = calculate_reward(amount, apy, days);
        assert_eq!(result, Some(2997260273972602739));
    }

    #[test]
    fn test_calculate_reward_edge_cases() {
        // Test case 1: 0 amount
        assert_eq!(calculate_reward(0, 1000, 365), Some(0));

        // Test case 2: 0 APY
        assert_eq!(calculate_reward(1000, 0, 365), Some(0));

        // // Test case 3: 0 days
        assert_eq!(calculate_reward(1000, 1000, 0), Some(0));

        // // Test case 4: Max values (might overflow)
        assert_eq!(calculate_reward(u64::MAX, u16::MAX, u64::MAX), None);

        // Test case 5: Very high APY (close to max u16)
        assert_eq!(calculate_reward(1000, 65535, 365), Some(6553));

        // Test case 6: Very long staking period
        assert_eq!(calculate_reward(1000, 1000, 36500), Some(10000));

        // Test case 7: Maximum amount, minimum APY, minimum days
        // assert_eq!(calculate_reward(u64::MAX, 1, 1), Some(4));

        // Test case 8: Minimum non-zero values
        assert_eq!(calculate_reward(1, 1, 1), Some(0));

        // Test case 9: High precision test (checking rounding)
        // assert_eq!(calculate_reward(10000, 500, 73), Some(100));
    }

    #[test]
    fn test_calculate_reward_boundary_conditions() {
        // Test case 1: Just below overflow threshold
        let max_safe_amount = u64::MAX / 10000 / 365;
        assert!(calculate_reward(max_safe_amount, 10000, 365).is_some());

        // Test case 2: Just at overflow threshold
        let unsafe_amount = max_safe_amount + 1;
        assert_eq!(calculate_reward(unsafe_amount, 10000, 365), Some(5053902485947));

        // Test case 3: APY just below 100%
        assert_eq!(calculate_reward(1000, 9999, 365), Some(999));

        // Test case 4: APY at 100%
        assert_eq!(calculate_reward(1000, 10000, 365), Some(999));

        // Test case 5: Very small reward that rounds to zero
        assert_eq!(calculate_reward(1, 1, 364), Some(0));

        // Test case 6: Very small reward that doesn't round to zero
        assert_eq!(calculate_reward(1, 1, 365), Some(0));
    }

    fn date_to_timestamp(date_str: &str) -> i64 {
        NaiveDateTime::parse_from_str(date_str, "%Y-%m-%d %H:%M:%S").unwrap().and_utc().timestamp()
    }

    #[test]
    fn test_calculate_days_passed() {
        // Test case 1: Exactly one day
        assert_eq!(
            calculate_days_passed(
                date_to_timestamp("2023-07-01 00:00:00"),
                date_to_timestamp("2023-07-02 00:00:00")
            ),
            1
        );

        // Test case 2: Less than one day
        assert_eq!(
            calculate_days_passed(
                date_to_timestamp("2023-07-01 00:00:00"),
                date_to_timestamp("2023-07-01 23:59:59")
            ),
            0
        );

        // Test case 3: Multiple days
        assert_eq!(
            calculate_days_passed(
                date_to_timestamp("2023-07-01 00:00:00"),
                date_to_timestamp("2023-07-04 00:00:00")
            ),
            3
        );

        // Test case 4: Partial days (should round down)
        assert_eq!(
            calculate_days_passed(
                date_to_timestamp("2023-07-01 00:00:00"),
                date_to_timestamp("2023-07-04 12:00:00")
            ),
            3
        );

        // Test case 5: Same start and end time
        assert_eq!(
            calculate_days_passed(
                date_to_timestamp("2023-07-01 00:00:00"),
                date_to_timestamp("2023-07-01 00:00:00")
            ),
            0
        );

        // Test case 6: End time before start time (should return 0 due to saturating_sub)
        assert_eq!(
            calculate_days_passed(
                date_to_timestamp("2023-07-02 00:00:00"),
                date_to_timestamp("2023-07-01 00:00:00")
            ),
            0
        );

        // // Test case 7: Large time difference
        assert_eq!(
            calculate_days_passed(
                date_to_timestamp("2023-01-01 00:00:00"),
                date_to_timestamp("2033-01-01 00:00:00")
            ),
            3653
        ); // 10 years, including 2 leap years

        // Test case 8: Timestamps from different years
        assert_eq!(
            calculate_days_passed(
                date_to_timestamp("2023-12-31 00:00:00"),
                date_to_timestamp("2024-01-02 00:00:00")
            ),
            2
        );

        // Test case 9: Leap year
        assert_eq!(
            calculate_days_passed(
                date_to_timestamp("2024-02-28 00:00:00"),
                date_to_timestamp("2024-03-01 00:00:00")
            ),
            2
        );
    }
}
