# Installing Kidboard on Omarchy

Two commands, on the Omarchy machine. Nothing here is needed to run Kidboard
in a browser — this is only what makes it an app in the launcher.

```bash
curl -fsSL https://kidboard-app.vercel.app/install | bash
```

That fetches `omarchy-webapp-handler-kidboard` into `~/.local/bin` and hands
it to Omarchy's own `omarchy-webapp-install` as a custom Exec. Nothing is
written outside `~/.local`, and it needs no sudo. The same two steps by hand:

```bash
mkdir -p ~/.local/bin
curl -fsSL https://kidboard-app.vercel.app/omarchy-webapp-handler-kidboard \
  -o ~/.local/bin/omarchy-webapp-handler-kidboard
chmod +x ~/.local/bin/omarchy-webapp-handler-kidboard

omarchy-webapp-install Kidboard \
  https://kidboard-app.vercel.app \
  https://kidboard-app.vercel.app/apple-touch-icon.png \
  "$HOME/.local/bin/omarchy-webapp-handler-kidboard"
```

Kidboard is then in the app launcher (Super + Space), in a frameless window,
wearing whatever theme the desktop is wearing. Change the Omarchy theme and
relaunch and it follows.

Remove it from Super + Space -> Remove -> Web App. That deletes the launcher
and the icon; the handler script in `~/.local/bin` is left behind and can go
with `rm`.
