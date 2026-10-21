export default {
  title: "Welcome to Koda",
  subtitle:
    "Your self-improving AI assistant that runs locally on your machine. Private, powerful, and always learning.",
  installIssueTitle: "Installation Issue",
  getStarted: "Get Started",
  retryInstall: "Retry Installation",
  terminalInstallHint: "Install via terminal, then come back:",
  recheck: "I've installed it — check again",
  switchToLocal: "Switch to local mode",
  installSizeHint: "This will install required components (~2 GB)",
  copyInstallCommand: "Copy install command",
  dividerOr: "or",
  connectRemote: "Connect to Remote Koda",
  connectRemoteTitle: "Connect to Remote Koda",
  connectRemoteSubtitle: "Enter the URL of a running Koda API server.",
  remoteServerUrl: "Server URL",
  remoteApiKey: "API Key (optional)",
  remoteApiKeyPlaceholder: "Bearer token (API_SERVER_KEY)",
  testingConnection: "Testing",
  connect: "Connect",
  remoteHint:
    "Authentication is detected automatically. Raw API servers use API_SERVER_KEY from ~/.hermes/.env on the remote host; dashboard servers open secure browser sign-in.",
  graphnosisTitle: "Pair with Graphnosis",
  graphnosisBody:
    "Optional local memory through the Graphnosis app and external Koda plugin. Install and unlock Graphnosis, install its memory plugin for your profile, then select it in Memory settings.",
  graphnosisDownload: "Download Graphnosis",
} as const;
