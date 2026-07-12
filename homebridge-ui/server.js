(async () => {
  const { HomebridgePluginUiServer } = await import('@homebridge/plugin-ui-utils');

  class RegzaAppConnectUiServer extends HomebridgePluginUiServer {
    constructor() {
      super();
      this.ready();
    }
  }

  new RegzaAppConnectUiServer();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
