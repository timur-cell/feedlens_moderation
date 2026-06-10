# Production image for the FeedLens Rails app.
#
# Built on ubuntu:24.04 with the prebuilt Ruby from ruby/ruby-builder (the same
# binaries GitHub Actions' setup-ruby uses) instead of the official ruby:slim
# image: some restricted networks (like the sandbox this was developed in)
# block deb.debian.org but allow archive.ubuntu.com and github.com.
#
# Build from the REPO ROOT (the compose file does this):
#   docker build -t feedlens -f rails/Dockerfile .
ARG BASE_REGISTRY=mirror.gcr.io
ARG RUBY_VERSION=3.3.6

FROM ${BASE_REGISTRY}/library/ubuntu:24.04 AS base
ARG RUBY_VERSION

# Rails app lives here
WORKDIR /rails

# Runtime packages + optional extra CA certs for TLS-intercepting proxies
# (docker/extra-ca-certs/README.md; inert on machines with direct egress).
COPY docker/extra-ca-certs/*.crt /tmp/extra-ca/
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y \
      ca-certificates curl libjemalloc2 libpq5 libyaml-0-2 postgresql-client tzdata && \
    (cp /tmp/extra-ca/*.crt /usr/local/share/ca-certificates/ 2>/dev/null || true) && \
    update-ca-certificates && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives

# Prebuilt Ruby (ruby/ruby-builder toolcache tarball). Its binstub shebangs
# are baked to the GitHub Actions toolcache prefix, so extract it there.
RUN mkdir -p "/opt/hostedtoolcache/Ruby/${RUBY_VERSION}" && \
    curl -fsSL -o /tmp/ruby.tar.gz \
      "https://github.com/ruby/ruby-builder/releases/download/toolcache/ruby-${RUBY_VERSION}-ubuntu-24.04.tar.gz" && \
    tar -xzf /tmp/ruby.tar.gz -C "/opt/hostedtoolcache/Ruby/${RUBY_VERSION}" && \
    ln -s "/opt/hostedtoolcache/Ruby/${RUBY_VERSION}/x64" /opt/ruby && \
    rm /tmp/ruby.tar.gz

# Set production environment variables and enable jemalloc for reduced memory usage and latency.
ENV PATH="/opt/ruby/bin:${PATH}" \
    RAILS_ENV="production" \
    BUNDLE_DEPLOYMENT="1" \
    BUNDLE_PATH="/usr/local/bundle" \
    BUNDLE_WITHOUT="development:test" \
    LD_PRELOAD="/usr/lib/x86_64-linux-gnu/libjemalloc.so.2"

# Throw-away build stage to reduce size of final image
FROM base AS build

# Install packages needed to build gems
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential git libpq-dev libyaml-dev pkg-config && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives

# Install application gems
COPY rails/Gemfile rails/Gemfile.lock ./

RUN bundle install && \
    rm -rf ~/.bundle/ "${BUNDLE_PATH}"/ruby/*/cache "${BUNDLE_PATH}"/ruby/*/bundler/gems/*/.git && \
    bundle exec bootsnap precompile -j 1 --gemfile

# Copy application code
COPY rails/ .

# Precompile bootsnap code for faster boot times.
RUN bundle exec bootsnap precompile -j 1 app/ lib/

# Final stage for app image
FROM base

# Run and own only the runtime files as a non-root user for security
# (ubuntu:24.04 already ships an "ubuntu" user with uid 1000, so use 1001)
RUN groupadd --system --gid 1001 rails && \
    useradd rails --uid 1001 --gid 1001 --create-home --shell /bin/bash
USER 1001:1001

# Copy built artifacts: gems, application
COPY --chown=rails:rails --from=build "${BUNDLE_PATH}" "${BUNDLE_PATH}"
COPY --chown=rails:rails --from=build /rails /rails

# Entrypoint prepares the database.
ENTRYPOINT ["/rails/bin/docker-entrypoint"]

# Start server via Thruster by default, this can be overwritten at runtime
EXPOSE 80
CMD ["./bin/thrust", "./bin/rails", "server"]
