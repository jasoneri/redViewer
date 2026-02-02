fn main() {
    #[cfg(windows)]
    embed_resource::compile("resources.rc");
}