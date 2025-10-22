# crypto-rng

A minimal Rust library providing cryptographically secure random number generation with WASM support.

## Features

- **Cryptographically Secure**: Uses OS-provided entropy sources for high-quality randomness
- **WASM-Compatible**: Works seamlessly in browsers using Web Crypto API
- **Simple API**: Single function interface - `fill_buffer()`
- **Zero Configuration**: No manual seeding or initialization required
- **Thread-Safe**: Can be called from multiple threads safely
- **Best Practices**: Follows industry standards for secure randomness

## Platform Support

| Platform       | Random Source                               |
| -------------- | ------------------------------------------- |
| Linux/Android  | `getrandom()` system call                   |
| macOS/iOS      | `getentropy()` or `SecRandomCopyBytes()`    |
| Windows        | `BCryptGenRandom()`                         |
| WASM (Browser) | Web Crypto API (`crypto.getRandomValues()`) |
| WASM (Node.js) | Node.js crypto module                       |

## Usage

```rust
use crypto_rng::fill_buffer;

// Generate a 256-bit encryption key
let mut key = [0u8; 32];
fill_buffer(&mut key);

// Generate a 128-bit nonce
let mut nonce = [0u8; 16];
fill_buffer(&mut nonce);

// Fill a vector
let mut random_data = vec![0u8; 1024];
fill_buffer(&mut random_data);
```

## Common Use Cases

### Encryption Key Generation

```rust
use crypto_rng::fill_buffer;

const KEY_SIZE: usize = 32; // 256 bits
let mut key = [0u8; KEY_SIZE];
fill_buffer(&mut key);
// Use key for AES-256 encryption
```

### Nonce/IV Generation

```rust
use crypto_rng::fill_buffer;

const NONCE_SIZE: usize = 16; // 128 bits
let mut nonce = [0u8; NONCE_SIZE];
fill_buffer(&mut nonce);
// Use nonce with your cipher
```

### Session Token Generation

```rust
use crypto_rng::fill_buffer;

let mut token = [0u8; 32];
fill_buffer(&mut token);
// Convert to base64 or hex for use as a session token
```

## WASM Usage

When compiled to WebAssembly, this crate automatically uses the browser's Web Crypto API:

```rust
// Works the same in WASM as on native platforms
let mut random_bytes = [0u8; 32];
fill_buffer(&mut random_bytes);
```

To build for WASM:

```bash
cargo build --target wasm32-unknown-unknown
```

## Security Considerations

### High-Quality Entropy

This crate relies on the operating system or runtime environment to provide cryptographically secure entropy. The quality is as good as the platform's implementation, which is rigorously tested and audited on all major platforms.

### No Predictability

The random bytes generated are computationally infeasible to predict, making them suitable for:

- Cryptographic keys
- Initialization vectors (IVs)
- Nonces
- Salts
- Session tokens
- Any security-critical randomness

### Proper Initialization

On all supported platforms, the random number generator is automatically and properly seeded by the OS. No manual seeding is required or possible.

### Error Handling

The `fill_buffer` function will **panic** if the underlying random source fails. This is intentional because:

1. Random source failures are extremely rare in practice
2. Continuing without proper randomness would be a critical security failure
3. Panicking ensures the application doesn't proceed in an insecure state

If you need custom error recovery, you can use `std::panic::catch_unwind`, but this is generally not recommended for cryptographic code.

## Examples

Run the included example:

```bash
cargo run --example basic_usage
```

## Testing

Run the test suite:

```bash
cargo test
```

The tests verify:

- Basic functionality
- Non-determinism (different calls produce different results)
- Distribution properties
- Edge cases (empty buffers, large buffers, slices)
- Pattern detection

## Dependencies

- **getrandom**: Industry-standard crate for accessing OS random sources
  - Version: 0.2
  - Features: `js` (for WASM support)

## Documentation

Generate and view the documentation:

```bash
cargo doc --open
```

## License

This crate follows the workspace license configuration.

## Contributing

This crate is designed to be minimal and focused. It provides a single, simple interface for cryptographically secure random number generation. Additional features should be carefully considered to maintain simplicity and security.
