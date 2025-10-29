pub(crate) fn timestamp_millis() -> u128 {
    // web_time provides a std::time-compatible API that uses JS Date on wasm32
    // and std::time on native platforms automatically
    web_time::SystemTime::now()
        .duration_since(web_time::UNIX_EPOCH)
        .expect("Failed to get timestamp")
        .as_millis()
}
