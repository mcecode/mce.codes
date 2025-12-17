---
title: "How To: Caddy (on OpenBSD)"
dateCreated: 2025-12-17
dateUpdated: 2025-12-17
---

## Preamble

### Aims

To document the steps I recently took to set up Caddy on an OpenBSD server, so I
don't end up forgetting them.

The steps outlined below specifically show how to host a single static site
under one domain. However, in general, whether you're using Caddy to serve
multiple static sites, your PHP app, or an API as a reverse proxy, most of these
steps are more or less the same steps you'd take.

### Assumptions

- Familiarity with Unix-like operating systems and web servers
- Some understanding of networking
- An already setup OpenBSD server
- Static assets go in `/var/www/htdocs` and web server logs go in
  `/var/www/logs`

### Caveats

I'm pretty new to OpenBSD and Caddy, so there may be errors in this document.
You should consider this a resource, not an ultimate source of truth. When in
doubt, the official documentation and man pages referenced below are your
friends.

As an aside, base OpenBSD already comes with an HTTP server, httpd, and a proxy,
relayd, so you might not even want to use Caddy on OpenBSD to begin with.

## Steps

1. Install Caddy:

   ```console
   pkg_add caddy
   ```

2. Put static assets on server:

   Below are some commands you can run to transfer local files to your server.
   They assume you're using an admin user, not root.

   Use SCP to transfer the files:

   ```console
   scp -r /path/to/files/source <username>@<ip>:/path/to/files/destination
   ```

   Once on the server, move them to `/var/www/htdocs`:

   ```console
   doas mv /path/to/files /var/www/htdocs/<domain>
   ```

   Then, follow `/var/www/htdocs` conventions by transferring ownership to root:

   ```console
   doas chown -R root:wheel /var/www/htdocs/<domain>
   ```

   Lastly, make sure that they're readable but not writable by other users:

   ```console
   doas chmod -R g+rX-w,o+rX-w /var/www/htdocs/<domain>
   ```

   **Note:** These are only example commands, maybe you want to transfer the
   files using rsync or you may want to automate the whole thing via CI/CD, you
   do you.

3. Create log directory for Caddy:

   ```console
   doas mkdir /var/www/logs/<domain>
   ```

4. Transfer ownership of log directory to Caddy:

   ```console
   doas chown _caddy:_caddy /var/www/logs/<domain>
   ```

5. Support `configtest` action:

   ```console
   doas vi `/etc/rc.d/caddy`
   ```

   Then, add the following before the `rc_start` function:

   ```shell
   rc_configtest() {
     rc_exec "${daemon} validate ${daemon_flags}"
   }
   ```

   **Note:** This is optional but `configtest` is useful when making sure that
   your config is valid before starting or reloading Caddy.

6. Update Caddy config:

   ```console
   doas vi /etc/caddy/Caddyfile
   ```

   Then, update the contents to something like below:

   ```text
   {
     # Bind to server's IP
     default_bind <ip>

     # Use custom ports since non-root users can't bind to ports below 1024
     # Standard ports will be exposed publicly
     # Custom ports will only be used internally
     # PF will handle standard to custom ports translation
     http_port <http-port>
     https_port <https-port>

     # Use of private custom ports require HTTPS redirection to be done manually
     auto_https disable_redirects

     # Limit admin endpoint access by using Unix socket instead of localhost
     admin unix//var/caddy/admin.sock|0220

     # Caddy doesn't support installing internal CA on OpenBSD
     skip_install_trust

     # Configure global log file
     log {
       output file /var/www/logs/<domain>/default.log
     }
   }

   # Configure HTTP requests to log and redirect to HTTPS
   <domain>:<http-port> {
     log

     # Redirect client to standard port since PF will handle port translation
     redir https://<domain>{uri} permanent
   }

   # Configure HTTPS requests to log and serve files
   <domain>:<https-port> {
     log

     root * /var/www/htdocs/<domain>
     file_server
   }
   ```

   **Note:** This is a minimal config, as such, you may want to extend it by
   handling www redirections, having a catchall handler, or logging to different
   log files instead of just one. The sky's the limit.

7. Verify Caddy config validity:

   ```console
   rcctl configtest caddy
   ```

   **Note:** This will only work if you did step 5, therefore it is also
   optional.

8. Set environment variables for Caddy:

   ```console
   doas vi /etc/login.conf.d/caddy
   ```

   Then, put the following Caddy class:

   ```text
   caddy:\
     :setenv=CADDY_VAR1=value_one,CADDY_VAR2=value_two:\
     :tc=daemon:
   ```

   **Note:** This is only needed if you want to set environment variables for
   your Caddy config. `setenv` sets the comma-separated key-value pairs as
   environment variables and `tc` extends the `daemon` class.

9. Update PF config:

   ```console
   doas vi /etc/pf.conf
   ```

   Then, add the following rules:

   ```text
   # Redirect standard ports to custom ports set in Caddy config
   pass in on egress proto tcp to egress port 80 rdr-to egress port <http-port>
   pass in on egress proto tcp to egress port 443 rdr-to egress port <https-port>
   ```

10. Verify PF config validity:

    ```console
    doas pfctl -nf /etc/pf.conf
    ```

11. Point your domain's A or AAAA record to your server's IP

    **Note:** It's important for this to be done before opening the floodgates
    and starting Caddy so that TLS certificates can be provisioned successfully.

12. Apply updated PF config:

    ```console
    doas pfctl -f /etc/pf.conf
    ```

13. Check active PF rules:

    ```console
    doas pfctl -sr
    ```

14. Start Caddy:

    ```console
    rcctl start caddy
    ```

15. Enable Caddy:

    ```console
    rcctl enable caddy
    ```

    **Note:** This ensures that Caddy will be restarted after server reboots.

## References

- <https://caddyserver.com/docs>
- <https://man.openbsd.org/httpd.8>
- <https://man.openbsd.org/httpd.conf.5>
- <https://man.openbsd.org/relayd.8>
- <https://man.openbsd.org/pkg_add.1>
- <https://man.openbsd.org/scp.1>
- <https://man.openbsd.org/mv.1>
- <https://man.openbsd.org/chown.8>
- <https://man.openbsd.org/chmod.1>
- <https://man.openbsd.org/mkdir.1>
- <https://man.openbsd.org/rcctl.8>
- <https://man.openbsd.org/rc.d.8>
- <https://man.openbsd.org/login.conf.5>
- <https://github.com/openbsd/ports/tree/master/www/caddy>
- <https://github.com/openbsd/src/blob/master/etc/rc.d/httpd>
- <https://github.com/openbsd/src/blob/master/etc/rc.d/rc.subr>
- <https://man.openbsd.org/pf.conf.5>
- <https://fabiolb.net/faq/binding-to-low-ports/#openbsdfreebsdnetbsd>
- <https://man.openbsd.org/pfctl.8>
