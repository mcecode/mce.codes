---
title: "How To: OpenBSD (on a Remote Server)"
dateCreated: 2025-12-12
dateUpdated: 2025-12-17
---

## Preamble

### Aims

To document the steps I recently took to set up an OpenBSD server, so I don't
end up forgetting them.

Since most of these steps are the same steps you'd take to set up any server but
with commands specific to OpenBSD, the end result of following them should be a
general purpose, relatively secure server that you can SSH into for subsequent
configuration and activity.

### Assumptions

- Familiarity with Unix-like operating systems and SSH
- Some understanding of networking

### Caveats

I'm pretty new to OpenBSD and system administration in general, so there may be
errors in this document. You should consider this a resource, not the be-all and
end-all of what you should do to set up an OpenBSD server. When in doubt, the
official FAQ and man pages referenced below are your friends.

Additionally, this skips installation, disk partitioning, network setup, etc.
since the server provider I use supports OpenBSD out of the box and already
handles those things when spinning up new instances. If you need them, some
resources referenced below discuss those steps.

## Steps

1. (Local) SSH as root:

   ```console
   ssh root@<ip>
   ```

2. (Remote as root) Change default root password:

   ```console
   passwd
   ```

3. (Local) SSH as root again to verify the new password works:

   ```console
   ssh root@<ip>
   ```

   **Note:** To prevent losing access to your server, only exit your original
   root session once you've confirmed that the new password is reflected.

4. (Remote as root) Update system:

   ```console
   syspatch
   ```

   **Note:** Depending on what patches are applied, you may need to do
   additional steps such as restarting services or rebooting the server.

5. (Remote as root) Update third-party software:

   ```console
   pkg_add -u
   ```

   **Note:** This is unlikely to update anything as base OpenBSD doesn't have
   any third-party software, but it's just good practice to have the muscle
   memory of updating third-party software after the system.

6. (Remote as root) Install third-party software:

   ```console
   pkg_add <package>
   ```

   **Note:** This is optional and can be done at a later time. However, base
   OpenBSD primarily only has vi or Mg for text editing and netcat (`nc`) or
   `ftp` for making network requests. These tools can be unintuitive for users
   unfamiliar with them (like me), so you may want to install Vim or nano and
   cURL or Wget, respectively.

7. (Remote as root) Give wheel group users admin access:

   ```console
   echo "permit persist :wheel" > /etc/doas.conf
   ```

8. (Remote as root) Create admin user:

   ```console
   useradd -m -G wheel <username>
   ```

9. (Remote as root) Set admin user password:

   ```console
   passwd <username>
   ```

10. (Local) Generate SSH key pair:

    ```console
    ssh-keygen -t ed25519 -C <comment>
    ```

11. (Remote as root) Add generated public key to
    `/home/<username>/.ssh/authorized_keys`
12. (Remote as root) Harden SSH:

    ```console
    vi /etc/ssh/sshd_config
    ```

    Then, update or add the following:

    ```text
    # Change default SSH port
    Port <port>

    # Only listen to specific IP
    AddressFamily <family>
    ListenAddress <ip>

    # Prevent root login
    PermitRootLogin no

    # Disable nonpublic key authentication
    KbdInteractiveAuthentication no
    PasswordAuthentication no

    # Only allow the admin user to log in
    AllowUsers <username>

    # Only allow public key authentication
    AuthenticationMethods publickey
    ```

    **Note:** The main point of this step is to make you think about security
    since all the changes proposed here are, in a sense, optional. Some might
    even be considered bad practice like changing the default SSH port. So, do
    your research and harden SSH in a way that you think is right.

13. (Remote as root) Verify SSH config validity:

    ```console
    rcctl configtest sshd
    ```

14. (Remote as root) Reload SSH daemon:

    ```console
    rcctl reload sshd
    ```

15. (Local) SSH as admin user:

    ```console
    ssh -p <port> -i /path/to/private/key <username>@<ip>
    ```

    **Note:** To prevent losing access to your server, only exit your root
    session once you've confirmed that you can successfully connect as the admin
    user and run privileged commands. Also, `-p` can be omitted if you didn't
    change the default port on step 12.

    **Tip:** You can add the following to your SSH config so you don't have to
    type so many arguments every time:

    ```text
    Host <hostname>
      User <username>
      HostName <ip>
      # `Port` can be omitted if you didn't change the default port on step 12
      Port <port>
      IdentityFile /path/to/private/key
    ```

    Once done, you can SSH with just:

    ```console
    ssh <hostname>
    ```

16. (Remote as admin user) Configure PF as firewall:

    ```console
    doas vi /etc/pf.conf
    ```

    Then, change lines 7 and 8 from:

    ```text
    block return	# block stateless traffic
    pass		# establish keep-state
    ```

    To:

    ```text
    # Block all connections by default
    block all

    # Allow outbound connections
    pass out all

    # Only allow SSH inbound connections
    # `<port>` is either the custom port set on step 12 or the default 22
    pass in on egress proto tcp to egress port <port>
    ```

    **Note:** Like step 12, the main point of this step is to make you think
    about security since the proposed changes here are not mandatory. So, do
    your research and testing and configure PF in a way that you think is right
    for your use case.

17. (Remote as admin user) Verify PF config validity:

    ```console
    doas pfctl -nf /etc/pf.conf
    ```

18. (Remote as admin user) Apply updated PF config:

    ```console
    doas pfctl -f /etc/pf.conf
    ```

19. (Remote as admin user) Check active PF rules:

    ```console
    doas pfctl -sr
    ```

20. (Local) SSH as admin user again to verify PF allows access:

    ```console
    ssh -p <port> -i /path/to/private/key <username>@<ip>
    ```

    **Note:** `-p` can be omitted if you didn't change the default port on
    step 12.

    Or, if you've added the server in your SSH config:

    ```console
    ssh <hostname>
    ```

    **Note:** To prevent losing access to your server, only exit your original
    admin session once you've confirmed that PF successfully allows you to
    connect.

## References

- <https://blog.cschad.com/posts/guide_to_openbsd_75_installation>
- <https://blog.cschad.com/posts/openbsd_75_post_installation>
- <https://www.openbsdhandbook.com>
- <https://www.openbsd.org/faq>
- <https://man.openbsd.org/ssh.1>
- <https://man.openbsd.org/man1/passwd.1>
- <https://man.openbsd.org/syspatch.8>
- <https://man.openbsd.org/packages.7>
- <https://man.openbsd.org/pkg_add.1>
- <https://man.openbsd.org/vi.1>
- <https://man.openbsd.org/mg.1>
- <https://man.openbsd.org/nc.1>
- <https://man.openbsd.org/ftp.1>
- <https://openports.pl/path/editors/vim,no_x11>
- <https://openports.pl/path/editors/nano>
- <https://openports.pl/path/net/curl>
- <https://openports.pl/path/net/wget2>
- <https://man.openbsd.org/doas.conf.5>
- <https://man.openbsd.org/useradd.8>
- <https://man.openbsd.org/ssh-keygen.1>
- <https://man.openbsd.org/sshd_config.5>
- <https://man.openbsd.org/rcctl.8>
- <https://man.openbsd.org/rc.d.8>
- <https://man.openbsd.org/ssh_config.5>
- <https://man.openbsd.org/pf.conf.5>
- <https://man.openbsd.org/pfctl.8>

## Changelog

- December 17, 2025
  - Minor updates to caveats
  - Change "restart" to "reload" in step 14
