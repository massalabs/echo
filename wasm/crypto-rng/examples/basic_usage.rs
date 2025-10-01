//! Basic usage example for crypto-rng
//!
//! This example demonstrates how to use the crypto-rng crate to generate
//! cryptographically secure random bytes for various use cases.

use crypto_rng::fill_buffer;

fn main() {
    println!("crypto-rng - Cryptographically Secure Random Number Generator\n");

    // Example 1: Generate a random encryption key
    println!("Example 1: Generating a 256-bit encryption key");
    const KEY_SIZE: usize = 32; // 256 bits
    let mut key = [0u8; KEY_SIZE];
    fill_buffer(&mut key);
    println!("Random key (hex): {}", hex_encode(&key));
    println!();

    // Example 2: Generate a random nonce/IV
    println!("Example 2: Generating a 128-bit nonce");
    const NONCE_SIZE: usize = 16; // 128 bits
    let mut nonce = [0u8; NONCE_SIZE];
    fill_buffer(&mut nonce);
    println!("Random nonce (hex): {}", hex_encode(&nonce));
    println!();

    // Example 3: Generate random data for a salt
    println!("Example 3: Generating a 16-byte salt");
    let mut salt = [0u8; 16];
    fill_buffer(&mut salt);
    println!("Random salt (hex): {}", hex_encode(&salt));
    println!();

    // Example 4: Generate random data for a session token
    println!("Example 4: Generating a 32-byte session token");
    let mut token = [0u8; 32];
    fill_buffer(&mut token);
    println!("Random token (hex): {}", hex_encode(&token));
    println!();

    // Example 5: Generate random data into a vector
    println!("Example 5: Generating random data into a vector");
    let mut random_data = vec![0u8; 64];
    fill_buffer(&mut random_data);
    println!(
        "Random data (first 32 bytes, hex): {}",
        hex_encode(&random_data[..32])
    );
    println!();

    // Example 6: Fill only part of a buffer
    println!("Example 6: Filling only part of a buffer");
    let mut buffer = [0u8; 64];
    fill_buffer(&mut buffer[16..48]); // Fill middle 32 bytes only
    println!(
        "Buffer (first 16 bytes - should be zero): {}",
        hex_encode(&buffer[..16])
    );
    println!(
        "Buffer (middle 32 bytes - random): {}",
        hex_encode(&buffer[16..48])
    );
    println!(
        "Buffer (last 16 bytes - should be zero): {}",
        hex_encode(&buffer[48..])
    );
}

// Helper function to encode bytes as hex string
fn hex_encode(bytes: &[u8]) -> String {
    bytes
        .iter()
        .map(|b| format!("{:02x}", b))
        .collect::<String>()
}
