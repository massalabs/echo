//! # crypto-rng
//!
//! A minimal Rust library providing cryptographically secure random number generation.
//!
//! This crate provides a simple, safe interface to fill buffers with cryptographically
//! secure random bytes. It is designed to work across platforms including native targets
//! and WebAssembly (WASM) for in-browser execution.
//!
//! ## Features
//!
//! - **Cryptographically secure**: Uses the operating system's secure random source
//! - **WASM-compatible**: Works in browsers using the Web Crypto API
//! - **Simple API**: Single function to fill a buffer with random bytes
//! - **Zero dependencies on native**: Uses OS-provided entropy sources
//! - **Best practices**: Follows industry standards for secure randomness
//!
//! ## Platform Support
//!
//! - **Linux/Android**: Uses `getrandom()` system call
//! - **macOS/iOS**: Uses `getentropy()` or `SecRandomCopyBytes()`
//! - **Windows**: Uses `BCryptGenRandom()`
//! - **WASM/Browser**: Uses Web Crypto API (`crypto.getRandomValues()`)
//! - **WASM/Node.js**: Uses Node.js crypto module
//!
//! ## Security Notes
//!
//! - **Entropy quality**: This crate relies on the operating system or runtime environment
//!   to provide cryptographically secure entropy. The quality is as good as the platform's
//!   implementation.
//! - **Initialization**: On most platforms, the random number generator is properly
//!   seeded by the OS. No manual seeding is required or possible.
//! - **No predictability**: The random bytes generated are computationally infeasible to
//!   predict, making them suitable for cryptographic keys, nonces, IVs, and other
//!   security-critical randomness.
//! - **Thread-safe**: The underlying implementation is thread-safe and can be called
//!   from multiple threads simultaneously.
//!
//! ## Usage
//!
//! ```rust
//! use crypto_rng::fill_buffer;
//!
//! // Generate random bytes into a buffer
//! let mut random_bytes = [0u8; 32];
//! fill_buffer(&mut random_bytes);
//!
//! // The buffer is now filled with cryptographically secure random data
//! println!("Random bytes: {:?}", random_bytes);
//! ```
//!
//! ## Common Use Cases
//!
//! ### Generating a random encryption key
//!
//! ```rust
//! use crypto_rng::fill_buffer;
//!
//! const KEY_SIZE: usize = 32; // 256 bits
//! let mut key = [0u8; KEY_SIZE];
//! fill_buffer(&mut key);
//! // Use key for encryption...
//! ```
//!
//! ### Generating a random nonce
//!
//! ```rust
//! use crypto_rng::fill_buffer;
//!
//! const NONCE_SIZE: usize = 16; // 128 bits
//! let mut nonce = [0u8; NONCE_SIZE];
//! fill_buffer(&mut nonce);
//! // Use nonce with encryption...
//! ```
//!
//! ### Generating random data for testing
//!
//! ```rust
//! use crypto_rng::fill_buffer;
//!
//! let mut test_data = vec![0u8; 1024];
//! fill_buffer(&mut test_data);
//! // Use test_data for testing...
//! ```
//!
//! ## WASM Usage
//!
//! When compiled to WASM, this crate automatically uses the browser's Web Crypto API:
//!
//! ```rust,no_run
//! use crypto_rng::fill_buffer;
//!
//! // This works the same in WASM as on native platforms
//! let mut random_bytes = [0u8; 32];
//! fill_buffer(&mut random_bytes);
//! ```
//!
//! ## Error Handling
//!
//! The `fill_buffer` function will panic if the underlying random source fails.
//! This is intentional because:
//!
//! 1. Random source failures are extremely rare in practice
//! 2. Continuing without proper randomness would be a critical security failure
//! 3. Panicking ensures the application doesn't proceed in an insecure state
//!
//! If you need error recovery, you can catch the panic using `std::panic::catch_unwind`
//! (on platforms that support it), but this is generally not recommended for
//! cryptographic code.

/// Fills a buffer with cryptographically secure random bytes.
///
/// This function uses the operating system's secure random source to fill the
/// provided buffer with high-quality random data suitable for cryptographic
/// purposes.
///
/// # Arguments
///
/// * `buffer` - A mutable byte slice to be filled with random data
///
/// # Panics
///
/// This function will panic if the underlying random source fails. This is a
/// deliberate design choice to prevent continuing execution in an insecure state.
/// Random source failures are extremely rare and typically indicate a serious
/// system problem.
///
/// # Examples
///
/// Basic usage:
///
/// ```rust
/// use crypto_rng::fill_buffer;
///
/// let mut key = [0u8; 32];
/// fill_buffer(&mut key);
/// // key now contains 32 cryptographically secure random bytes
/// ```
///
/// Generating random data of different sizes:
///
/// ```rust
/// use crypto_rng::fill_buffer;
///
/// // Small buffer
/// let mut small = [0u8; 16];
/// fill_buffer(&mut small);
///
/// // Large buffer
/// let mut large = vec![0u8; 4096];
/// fill_buffer(&mut large);
/// ```
///
/// # Platform-Specific Behavior
///
/// - **Unix-like systems**: Uses `getrandom()` system call or reads from `/dev/urandom`
/// - **Windows**: Uses `BCryptGenRandom()` from the Windows CNG API
/// - **WASM**: Uses `crypto.getRandomValues()` from the Web Crypto API
/// - **Other platforms**: Falls back to appropriate platform-specific secure RNG
///
/// # Security
///
/// The random bytes generated are suitable for:
/// - Cryptographic keys
/// - Initialization vectors (IVs)
/// - Nonces
/// - Salts
/// - Session tokens
/// - Any other security-critical random data
pub fn fill_buffer(buffer: &mut [u8]) {
    getrandom::getrandom(buffer)
        .expect("Failed to generate random bytes: system random source unavailable");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fill_buffer_different_calls_produce_different_results() {
        let mut buffer1 = [0u8; 32];
        let mut buffer2 = [0u8; 32];

        fill_buffer(&mut buffer1);
        fill_buffer(&mut buffer2);

        // Two calls should produce different random data
        // (collision probability is astronomically low)
        assert_ne!(buffer1, buffer2);
    }

    #[test]
    fn test_fill_buffer_small_size() {
        let mut buffer = [0u8; 1];
        fill_buffer(&mut buffer);

        // Should work even with a single byte
        // (we can't really test randomness here, just that it doesn't panic)
    }

    #[test]
    fn test_fill_buffer_empty() {
        let mut buffer = [];
        fill_buffer(&mut buffer);

        // Empty buffer should not panic
    }

    #[test]
    fn test_fill_buffer_large_size() {
        let mut buffer = vec![0u8; 10000];
        let original = buffer.clone();

        fill_buffer(&mut buffer);

        // Large buffer should be filled and different from original
        assert_ne!(buffer, original);
    }

    #[test]
    fn test_fill_buffer_vector() {
        // Test with a dynamically allocated vector
        let mut buffer = vec![0u8; 100];
        let original = buffer.clone();

        fill_buffer(&mut buffer);

        assert_ne!(buffer, original);
    }

    #[test]
    fn test_fill_buffer_deterministic_failure_is_impossible() {
        // This test verifies that repeated calls always succeed
        // (i.e., the RNG doesn't have a failure mode we can trigger)
        for _ in 0..100 {
            let mut buffer = [0u8; 32];
            fill_buffer(&mut buffer);
        }
        // If we get here, all calls succeeded
    }
}
