---
title: "How To: PostgreSQL (Locally)"
dateCreated: 2025-08-25
dateUpdated: 2025-12-08
---

## Preamble

### Aims

To document steps, commands, and flags that I primarily do and use when setting
up and interacting with PostgreSQL locally but forget when I haven't worked with
it in a while.

### Assumptions

- Arch Linux (btw)
- Use of the default host, localhost, and port, 5432.

### Caveat

You don't have to go through steps 1-6 every time. You likely only need to go
through a subset of them depending on your use case:

- When setting up PostgreSQL for the first time, you probably want to do: 1, 2,
  3, 4, 6.
- When you have a new project to set up, you may want to do: 2, 3, 4, 6.
- When you want to connect with a database via the command line, you can do: 2,
  5, 6.

## Steps

1. Initialize cluster:

   ```console
   sudo --user postgres initdb --pgdata <path>
   ```

   Or shorthand:

   ```console
   sudo -u postgres initdb -D <path>
   ```

   **Notes:**
   - This is the bare minimum command to initialize a cluster, which is fine
     locally, but you probably want to set the authentication method, the
     bootstrap superuser's password, etc. for remote systems.
   - `--pgdata` or `-D` can be omitted if the `PGDATA` environment variable is
     set.

2. Start server:

   ```console
   sudo --user postgres pg_ctl start --pgdata <path> --log <path>
   ```

   Or shorthand:

   ```console
   sudo -u postgres pg_ctl start -D <path> -l <path>
   ```

   **Notes:**
   - You may need to run `mkdir /run/postgresql` then
     `chown postgres:postgres /run/postgresql` once with root privileges before
     you can start the server.
   - `--pgdata` or `-D` can be omitted if the `PGDATA` environment variable is
     set.
   - `--log` or `-l` is optional but it's nice to have a logfile in case you
     need to check what happened.

3. Create user:

   ```console
   sudo --user postgres createuser --superuser <username>
   ```

   Or shorthand:

   ```console
   sudo -u postgres createuser -s <username>
   ```

   **Notes:**
   - This step is optional if you plan to use the default `postgres` superuser.
   - Passing `--superuser` or `-s` when creating local users is for convenience,
     you probably need to be more careful with what privileges a user is granted
     on remote systems.
   - Pass `--pwprompt` or `-P` to `createuser` if you want to set a password for
     the new user.
   - For ease of use in running subsequent commands, you can set `<username>` to
     be the same as the current system user.

4. Create database:

   If you created a superuser with the same username as the current system user
   and you want both the owner and database name to be the same:

   ```console
   createdb
   ```

   Else, if you want a different database name:

   ```console
   createdb <dbname>
   ```

   Else, you need to specify both the owner and database name:

   ```console
   sudo --user postgres createdb --owner <username> <dbname>
   ```

   Or shorthand:

   ```console
   sudo -u postgres createdb -O <username> <dbname>
   ```

   **Notes:**
   - `<dbname>` can also be omitted if the `PGDATABASE` environment variable is
     set, in which case, it will be the value used instead of the current system
     user's username.

5. Connect to database:

   If the current system user's username is the same as the database name and
   owner's username:

   ```console
   psql
   ```

   Else, you may need to pass one or both of the following:
   - `--dbname` or `-d` for the database name
   - `--username` or `-U` for the owner's username

   Once connected, you can do the rest with SQL.

   Some useful meta-commands:
   - `\du` to list users
   - `\l` to list databases
   - `\connect <dbname>` or `\c <dbname>` to connect to a different database
   - `\dt` to list tables in current database
   - `\quit` or `\q` to exit the shell

6. Stop server:

   ```console
   sudo --user postgres pg_ctl stop --pgdata <path>
   ```

   Or shorthand:

   ```console
   sudo -u postgres pg_ctl stop -D <path>
   ```

   **Notes:**
   - `--pgdata` or `-D` can be omitted if the `PGDATA` environment variable is
     set.

## References

- <https://man7.org/linux/man-pages/man8/sudo.8.html>
- <https://wiki.archlinux.org/title/PostgreSQL>
- <https://www.postgresql.org/docs/current/app-initdb.html>
- <https://www.postgresql.org/docs/current/app-pg-ctl.html>
- <https://www.postgresql.org/docs/current/app-postgres.html>
- <https://www.postgresql.org/docs/current/app-createuser.html>
- <https://www.postgresql.org/docs/current/app-createdb.html>
- <https://www.postgresql.org/docs/current/app-psql.html>

## Changelog

- December 08, 2025
  - Update title from "Cheatsheet: PostgreSQL" to "How To: PostgreSQL (Locally)"
  - Break down introductory paragraph into sections
