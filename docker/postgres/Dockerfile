# PostgreSQL with PostGIS and pgvector
FROM postgis/postgis:16-3.4

# Install pgvector extension
# PGDG moved Debian bullseye packages to its archive mirror; the base image still points at the live repo.
RUN sed -i 's#apt.postgresql.org/pub/repos/apt#apt-archive.postgresql.org/pub/repos/apt#' /etc/apt/sources.list.d/*.list && \
    apt-get update && \
    apt-get install -y postgresql-16-pgvector && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*
