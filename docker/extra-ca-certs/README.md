# Extra CA certificates baked into the Docker images

Some build/CI environments (e.g. the sandbox this app was developed in) route
all egress through a TLS-intercepting proxy. The proxy's CA certificates here
are appended to the system trust store during `docker build` so apt/rubygems/
npm work behind it.

They are public CA certificates — harmless elsewhere. If you don't want them
in your images, delete the `.crt` files; builds work without them on machines
with direct internet access.
